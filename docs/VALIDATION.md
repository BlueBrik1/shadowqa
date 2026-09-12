# Validation

What was actually executed in this workspace, what was not, and why. Nothing here is inferred from
reading the code; every "verified" line below corresponds to a command that ran and a result that
was inspected.

Machine: Windows 11, Node 24.14.0, npm 11.9.0. Installed locally: `claude` 2.1.269, `codex` 0.133.0,
`opencode` 1.15.10. Not available: Docker, a PostgreSQL server, a Gemini API key, a Slack workspace,
a GitHub App.

## Verified

### Both editions

| Check | Command | Result |
| --- | --- | --- |
| Type safety | `npm run typecheck` | Clean across `src`, `individual`, the VS Code extension and the browser extension. |
| Unit and integration suites | `npm test` | 11 files, 119 tests, all passing, against a real PostgreSQL engine (PGlite) using the production schema and SQL. |
| Full build | `npm run build` | `dist/`, `dist-individual/`, `vscode-extension/out/` and `individual/extension/dist/` all produced. |

### Team edition

| Check | Command | Result |
| --- | --- | --- |
| Offline end-to-end demo | `npm run demo` | Context compiled against real repository files at an immutable SHA; the planted regression reproduced by a real failing test process; the scripted repair verified in a separate fresh copy; the original worktree confirmed unchanged; one durable publication intent created without sending a PR; a standing scan recorded a reproduced finding. Report: `.shadowqa/demo-report.json`. |
| Setup wizard logic | `npx vitest run tests/setup.test.ts` | Environment merging preserves comments and never duplicates a key; a single repeated step reports the steps still required instead of a schema error; empty and malformed Slack tokens are refused before any network call; a GitHub App rejection produces a clear message; installation repositories are read through a scoped installation token; a clone whose `origin` does not match, and a subdirectory of a clone, are both refused. |

### Individual edition

| Check | Command | Result |
| --- | --- | --- |
| End-to-end path | `npx tsx scripts/individual-demo.ts` | 14 stages passed in a disposable home against a disposable clone of `fixtures/duplicate-submit`. |
| Capture behaviour | `npx vitest run tests/individual-capture.test.ts` | Duplicate capture stores nothing; a streamed reply completes in place rather than becoming a second turn; an incomplete frame never overwrites a finished turn; conversation switching keeps threads separate; partial coverage is recorded as partial; projects are isolated; a paused conversation stops accepting captures; deleting a conversation removes its derived items. |
| Site adapters | `npx vitest run tests/individual-adapters.test.ts` | Against `individual/extension/fixtures/`: both roles captured in order with the site's own ids, button labels and screen-reader text excluded, only the final assistant turn marked incomplete while streaming, and an unrecognised page producing a warning rather than an empty conversation. |
| Companion | `npx vitest run tests/individual-companion.test.ts` | Frame round-trip, partial frames, two frames in one chunk, both size limits, and a handler failure becoming an error reply rather than a crashed host. Pairing: a valid code issues a working extension token that cannot mint pairing codes; a wrong code, a reused code and an expired code are all refused. Session parsers verified against the real on-disk formats. |
| Execution and isolation | `npx vitest run tests/individual-execution.test.ts` | The workspace is built from committed objects and the dirty original is untouched; checks run in a second fresh copy; a failing or missing required check fails the verdict; every patch gate fires (scope, assertion removal, binary/deletion/symlink, rename, empty, size, risk flags); the branch commit leaves `HEAD` and the working tree exactly as they were; plan freshness breaks on a moved base commit and on a mode change; an unavailable backend leaves the task waiting rather than failing it. |

### Coding-session formats

Both parsers were written against files this machine actually holds, not against documentation:

- **Claude Code** — `~/.claude/projects/C--hack/<session>.jsonl`. Confirmed record kinds, the
  `user`/`assistant` shape, `isMeta` and `isSidechain` flags, block-array content, and that the
  project folder name is the working directory with every non-alphanumeric character replaced by `-`.
- **Codex** — `~/.codex/sessions/2026/05/23/rollout-*.jsonl`. Confirmed `session_meta`,
  `response_item` (`message`, `reasoning`, `function_call`), `event_msg` and `turn_context`, and the
  `developer` / `user` / `assistant` roles.

### Execution backends, run for real

| Backend | Detection | A real session | Notes |
| --- | --- | --- | --- |
| **Claude Code** | ✅ 2.1.269 | ✅ | A real `claude -p` session created the session id ShadowQA supplied, edited the target file in the isolated workspace, emitted parseable `assistant` and `result` events, and `claude --resume <id>` is the correct reopen command. |
| **Codex** | ✅ 0.133.0 | ⚠️ ran, failed upstream | The adapter launched `codex exec --json`, captured the thread id, and surfaced the CLI's own message: *"The 'gpt-6-astra' model requires a newer version of Codex."* That is an out-of-date CLI on this machine, not an adapter defect — and the adapter reported it instead of claiming success. |
| **OpenCode** | ✅ 1.15.10 | ⚠️ ran, failed upstream | A real session was created and its id captured. The model call failed because this machine's OpenCode provider credential is invalid. OpenCode exits 0 in that case; the adapter reads its error event and reports failure. |

Both upstream failures were found by running the backends, and both produced fixes:
`.cmd` shim resolution (below) and honest failure reporting.

## Bugs found and fixed during this work

| Bug | How it was found | Fix |
| --- | --- | --- |
| Windows `.cmd` shims cannot be spawned without a shell (Node raises `EINVAL`), so every backend looked uninstalled and every `npm test` check would have failed | Running the Claude Code backend for real | `individual/core/executable.ts` resolves a CLI name to the real `.exe` — or the `.js` plus Node — by following the npm shim. No shell is introduced. |
| OpenCode and Codex exit 0 on failures they report as events, so a failed session was reported as success | Running both backends for real | Both adapters parse their event streams and surface the upstream message; `ok` now requires no error event. |
| `git status --porcelain` output was trimmed before splitting, eating the leading space of the first line and corrupting the first path | `tests/individual-execution.test.ts` | Split before trimming, and parse the two status characters explicitly. |
| Claude's turn ordering relied on `compareDocumentPosition`, which silently returned 0 and produced the wrong order | `tests/individual-adapters.test.ts` | One query over the union of both role selectors; `querySelectorAll` returns document order by contract. |
| A missing backend made the runner probe it every two seconds forever | Review | 30-second backoff per task, and the waiting state is only written once. |
| The side panel's polling would have started a native host **process** every few seconds | Review | One `connectNative` port, multiplexed by request id, with a 30-second per-request timeout. |
| `shadowqa-individual watch` and `setup` opened the embedded database directly, which would fight a running service for the same single-process files | Review | The watcher moved into the service behind `POST /projects/:id/watch`; `withStore` refuses when the service is reachable and says what to do instead. |
| `shadowqa setup --step slack` on a fresh install crashed with a Zod error, and an empty token threw a `TypeError` | Review, then `tests/setup.test.ts` | Partial state writes the environment and names the remaining steps; empty tokens are refused with a readable message. |
| Scan copies accumulated under the individual home forever | Review | `POST /projects/:id/scan` discards its copy in a `finally`. |
| `docs/CODE_REFERENCE.md` was referenced by the README but had never been generated | Review | `npm run docs:code` regenerated it, now covering `individual/**` too. |

## Not verified

These are stated as limitations in the README and SETUP, not as working features.

| Area | Why not | What would verify it |
| --- | --- | --- |
| **Live ChatGPT and Claude capture** | No signed-in browser session in this environment. | Load the unpacked extension, open a real conversation, press *Track*, and compare the captured turns with the page. The adapters are tested against fixtures only; **live-site compatibility is unverified.** |
| **Chrome native messaging end to end** | Requires a real browser launching the host. | `companion install`, reload the extension, `pair`. The framing, the host's routing and the pairing exchange are unit-tested; the Chrome hop is not. |
| **Gemini extraction and planning against the live API** | No `GEMINI_API_KEY` available here. | Set the key and run `extract` then `plan`. Both refuse with `MODEL_SETUP` when no model is configured, which was verified. The demos use a scripted model. |
| **A full agent run through the individual runner** | Depends on a working backend credential; see the table above. | Approve a plan with a signed-in backend and watch `task <id>`. Each stage around the agent was verified separately. |
| **`npm run test:sandbox`** (team edition) | Docker is not running on this machine. | Start Docker Desktop with the Linux engine, `npm run sandbox:build`, then the smoke test. |
| **`npm run test:postgres`** (team edition) | No PostgreSQL server; `docker compose up -d` needs Docker. | Start the compose service and run it. The same schema and SQL are exercised by the suite through PGlite. |
| **Slack and GitHub connection in `shadowqa setup`** | No workspace or App available. | Run `shadowqa setup`. The request shapes are tested with stubbed fetches; the live responses are not. |
| **Pull-request creation** (both editions) | No GitHub token or remote. | `shadowqa-individual pr <task>` with `GITHUB_TOKEN` set. |
| **Films on a machine without network** | Google Fonts are fetched at render time. | Render offline; the fallback stacks are declared but the metrics will differ. |

## Films

Both compositions render end to end:

| Composition | Output | Encoded |
| --- | --- | --- |
| `ShadowQA-Business` | `video/out/shadowqa-business.mp4` | 1920×1080, 30 fps, 1:32.67, h264 |
| `ShadowQA-Individual` | `video/out/shadowqa-individual.mp4` | 1920×1080, 30 fps, 1:34.83, h264 |

Every code element on screen is extracted from this repository by `video/scripts/extract.mjs`; a
moved anchor fails the build. One frame per scene was rendered and inspected for overflow, clipping
and contrast, and the terminal copy was checked line by line against the strings the CLIs actually
print. The patch shown in both films is the one `npm run demo` and `scripts/individual-demo.ts`
apply to `fixtures/duplicate-submit` and verify with a real test process.

Numbers in the films that are illustrative rather than measured — source counts, turn counts,
timings for a fictional `payments-ui` project — are demonstration data for a fictional project, in
the same way the fixture repository is.
