# ◈ ShadowQA Individual

**Your ChatGPT, Claude, Claude Code and Codex conversations → project context → a Gemini plan you approve → a real session in OpenCode, Claude Code or Codex → a verified diff.**

The team edition ([../README.md](../README.md)) reads Slack and GitHub. This edition reads the AI
conversations a single developer already has, and runs the work through the coding tool that
developer already pays for. Everything else — the planner, the policy gates, the isolated
workspace, the independent checks, the finding fingerprints — is the same code.

**The desktop app ([`../desktop/`](../desktop/)) is the interface.** Choosing "Solo" at onboarding
boots this edition's local service (`individual/service/server.ts`) in-process, for as long as the
app is open — there is no separate `serve` step to remember. The browser extension still exists to
do the one thing neither a terminal nor the desktop app can: read the ChatGPT and Claude tabs you
explicitly track.

```powershell
npm ci
npm run build:individual
npm run desktop:build
npx electron dist-desktop/desktop/electron/main.js
```

Onboarding walks Connect (Gemini/Anthropic/OpenAI keys, Claude Code/Codex detection) → your first
project (repository folder, check command, automation mode) → the "ShadowQA is watching" dashboard.
The Context tab covers everything the old `setup`/`pair`/`companion install` commands did: register
the browser extension's native messaging host, generate a pairing code for the side panel, review
tracked conversations and extracted items, subscribe to local Claude Code/Codex sessions, and toggle
saved-file watching.

## What it actually does

| Step | Desktop screen | What happens |
| --- | --- | --- |
| Connect | Connect (onboarding) | Detects the Claude Code and Codex CLIs and their local session files, and stores your Gemini key in the OS keychain. |
| Register the extension | Context → Browser extension companion | Registers the native messaging host for your unpacked extension — a one-time step, not a config file. |
| Pair | Context → Pair the browser side panel | A short numeric code, generated in the app and typed into the panel. |
| Watch | Watching (dashboard) | Shows the tracked conversations, the subscribed coding sessions, the backends and any errors. |
| Read context | Context | Every captured turn, with its source and whether the site gave a real timestamp. |
| Extract | (automatic, via Generate plan) | Gemini turns the turns into requirements, constraints, decisions, suggestions, open questions and conflicts, each citing the turns it came from. |
| Correct | Context → Extracted context | Confirm/reject an item inline; your correction is marked and never overwritten by a later extraction. |
| Plan | Watching → Generate plan | A plan grounded in the confirmed context **and** the repository at its current commit: scope, affected files, steps, acceptance criteria, tests, unresolved questions. |
| Approve | Plans → Review | Binds the exact plan digest, base commit, backend and policy version. |
| Execute | (automatic) | An isolated copy of the repository at the base commit, then a real OpenCode / Claude Code / Codex session inside it. |
| Open it | Jobs → job detail | Shows `claude --resume …`, `codex resume …` or `opencode run -s …` for the same session, to paste into your IDE terminal. |
| Verify | (automatic) | The diff is frozen, reviewed against the plan, applied to a *second* fresh copy, and your check command is run there. |
| Deliver | Jobs → job detail | A local `shadowqa/<task>` branch built with Git plumbing; a pull request only if you connected GitHub. |
| Keep watching | Context → Saved-file watching; Findings | Saved-file observation, scans, fingerprinted findings and bounded repair. |

## Layout

```
individual/
  core/            contracts, capture identity, store, extraction, planning,
                   execution, patch review, publishing, QA, backends
  service/         loopback HTTP API, auth and pairing, coding-session observers
  companion/       native messaging host, its installer, and the Claude Code /
                   Codex session adapters
  extension/       the Manifest V3 side panel (source, fixtures and dist/)
```

`core`, `service` and `companion` are TypeScript compiled by `tsconfig.individual.json` into
`dist-individual/` — and, via `tsconfig.desktop.json`, into the desktop app's own build, which
imports `individual/service/server.ts`'s `createService()` directly instead of shelling out to a
CLI. They import the business modules directly (`src/db`, `src/memory`, `src/model/gemini.ts`,
`src/runner/process.ts`, `src/runner/workspace.ts`, `src/qa/findings.ts`), so the two editions share
one schema and one set of guarantees.

Individual data lives in its own tenant (`SHADOWQA_INDIVIDUAL_TENANT`, default `individual`) and its
own entity kinds (`iproject`, `iconversation`, `iitem`, `iplan`, `itask`). Business rows and
individual rows never mix, even when both point at the same PostgreSQL.

## The browser extension

Manifest V3. Permissions: `storage`, `sidePanel`, `nativeMessaging`, plus host permissions for
`chatgpt.com`, `chat.openai.com` and `claude.ai`. No `tabs` permission — the panel asks the content
script for the page it is on. No cookie access, no private endpoints, no remote code.

Two independent adapters (`src/content/adapters/chatgpt.ts`, `claude.ts`) read the page. Each has an
ordered list of selectors, so a markup change degrades one site's capture instead of breaking both,
and each returns a warning rather than silently reporting an empty conversation.

- **Capture is explicit.** Nothing is read until you press *Track this conversation*.
- **Capture is partial and says so.** The panel and the store both record `partial`: ShadowQA reads
  what the page has rendered. Turns you never scrolled to are not captured; a conversation you have
  not opened is not readable at all.
- **Streaming.** A reply still being written is marked incomplete and is completed in place when it
  settles — it never becomes a second turn.
- **Edits.** Where the site exposes a message id, that id is the turn's identity, so an edit
  replaces the stored revision. Where it does not, position within the conversation is the identity.
- **Absence.** A turn that is not in the DOM is not treated as deleted.
- **Deletion.** *Delete context* removes the stored text **and** every extracted item derived from
  it.

### Load it

1. `npm run build:extension:individual`
2. `chrome://extensions` → Developer mode
3. **Load unpacked** → `individual/extension/dist`
4. Copy the extension ID, paste it into the desktop app's Context tab → Browser extension companion → Register
5. Context tab → Generate pairing code, and type the code into the panel

There is no Chrome Web Store listing. Loading unpacked is the supported path.

## The companion

A Chrome extension cannot read local files or run processes, so the companion does it. It is a
Node process Chrome launches over
[native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
(4-byte little-endian length prefix, ≤ 1 MB per reply, ≤ 64 MB per request).

The host is deliberately small: it forwards a fixed set of named requests to the local service and
nothing else. It never gives the extension an arbitrary-URL fetch, and the extension never learns
the owner token — pairing issues it a separate credential that cannot mint pairing codes, change
projects, approve plans or cancel tasks.

It also carries the coding-session adapters:

- **Claude Code** — `~/.claude/projects/<slug>/<session>.jsonl`, the transcript Claude Code writes
  itself (`CLAUDE_CONFIG_DIR` is honoured). Optional `SessionStart` / `Stop` / `SessionEnd` hooks
  tell the service a session moved. Claude Code requires you to review changed hooks in `/hooks`
  before they run, and setup says so instead of pretending otherwise.
- **Codex** — `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`. Developer-role preambles,
  reasoning, function calls and token counters are skipped; only user and assistant messages are
  kept.

Both read only the sessions you subscribe to from the desktop app's Context tab → Local coding sessions → Subscribe.

## Execution backends

| Backend | Command ShadowQA runs | Reopen the same session |
| --- | --- | --- |
| `opencode` | `opencode run --format json --dir <workspace> -m google/<model> <prompt>` | `opencode run --dir <workspace> -s <session> -c` |
| `claude-code` | `claude -p <prompt> --session-id <uuid> --output-format stream-json --verbose --permission-mode acceptEdits --add-dir <workspace>` | `claude --resume <session-id>` |
| `codex` | `codex exec --json --skip-git-repo-check -C <workspace> -s workspace-write <prompt>` | `codex resume <session-id>` |

Choosing Claude Code or Codex uses **your** sign-in for the coding work. Planning and extraction stay
on Gemini either way, because they need structured output the CLIs do not expose.

Every backend is spawned as an argument array with no shell. On Windows the npm `.cmd` shim is
resolved to the real `.exe` (or the `.js` plus Node) it launches, because Node refuses to spawn a
`.cmd` without a shell and ShadowQA will not turn one on.

A backend that exits zero is not assumed to have succeeded: OpenCode and Codex both report failures
as events while exiting zero, so their event streams are parsed and the reason is surfaced.

## What protects your repository

1. The agent works in a copy exported from Git objects at the plan's base commit. Your clone,
   including everything uncommitted, is never written to.
2. The frozen diff is refused if it renames, deletes, symlinks, adds binaries, touches files outside
   the plan, exceeds the size caps, or removes a test or assertion.
3. Verification happens in a *second* fresh copy with the patch applied, so the checks never see the
   agent's workspace.
4. The result is committed to `refs/heads/shadowqa/<task>` with `hash-object`, `write-tree`,
   `commit-tree` and `update-ref` against a temporary index — no checkout, no index change, no stash.
5. `HEAD` does not move. Nothing merges on its own.

## Configuration

The desktop app's Connect screen stores `GEMINI_API_KEY` (required), `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` and `GITHUB_TOKEN` (needed only for opening a pull request) in the OS keychain and
sets them in the running process's environment — never in a project `.env` file. The remaining
variables below are still read from the process environment for anyone running the local service
headlessly instead of through the desktop app:

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Required for extraction and planning. Without it both refuse, with the reason, rather than showing invented output. |
| `GEMINI_MODEL` | Default `gemini-2.5-flash`. |
| `SHADOWQA_INDIVIDUAL_HOME` | Default `~/.shadowqa-individual`: database, tokens, workspaces. |
| `SHADOWQA_INDIVIDUAL_PORT` | Loopback port, default `4390`. |
| `SHADOWQA_INDIVIDUAL_DATABASE_URL` | Use a real PostgreSQL instead of the embedded engine. |
| `SHADOWQA_INDIVIDUAL_TENANT` | Default `individual`. |
| `GITHUB_TOKEN` | Only needed for opening a pull request from a job's detail screen. |
| `CLAUDE_CONFIG_DIR`, `CODEX_HOME` | Honoured when your CLIs are not in the default location. |

The database is [PGlite](https://pglite.dev) by default — the same PostgreSQL schema and SQL as the
team edition, embedded, so there is no Docker and no server to run.

## Known limitations

- **Live-site capture is unverified.** The ChatGPT and Claude adapters are tested against the
  fixtures in `extension/fixtures/`, not against a signed-in browser. The selectors are ordered and
  degrade to a visible warning, but ShadowQA cannot promise a live page still matches them.
- **Extraction and planning quality are the model's.** The gates check citations, paths and shape —
  not whether the plan is a good idea.
- **Codex `exec --json` event shapes are still changing.** The adapter reads several of them and
  reports an unrecognised failure rather than guessing.
- **No container isolation.** The agent runs in an isolated *workspace*, not a sandbox. It is your
  machine and your coding tool's own permissions. The team edition's Docker isolation is not part of
  this edition.
- **The scheduled scan needs the service running.** Nothing happens while the desktop app is closed;
  tasks wait instead of failing.
- **An unresolved question does not block approval here.** The team edition refuses a plan that
  still has open questions, because the person approving may not be the person who can answer them.
  In this edition they are the same person, so approving warns and asks rather than refusing.
- **Automatic merging does not exist here.** `auto-fix` and `full-auto` bound what may be *edited*;
  a human still decides what lands on a branch you care about.

## Tests

```powershell
npm test                          # includes the individual suites
npx tsx scripts/individual-demo.ts
```

`scripts/individual-demo.ts` runs the whole path — pairing, capture, extraction, planning,
isolation, patch review, real `node --test` processes, the branch commit and the findings — in a
disposable home against a disposable clone of `fixtures/duplicate-submit`. Its model output and the
coding agent's edit are scripted so it needs no API key; everything around them is the real code.
See [../docs/VALIDATION.md](../docs/VALIDATION.md) for what has and has not been run.
