# ShadowQA setup

This setup covers the desktop app in [`desktop/`](desktop/) — the onboarding, dashboard, plan
review, jobs, findings and Live surface for both editions — plus the headless scripts a real server
deployment needs instead of (or alongside) the desktop app. See `doc.md` §18 for why the interface
moved from a terminal CLI to a desktop app; nothing about the underlying service, policy engine or
execution model changed.

ShadowQA ships in two editions from one codebase:


| Edition        | Reads                               | Runs the code in                            | Setup                                  |
| -------------- | ------------------------------------ | -------------------------------------------- | --------------------------------------- |
| **Team**       | Slack + GitHub                       | OpenCode in network-disabled Docker          | Part A below                            |
| **Individual** | ChatGPT, Claude, Claude Code, Codex   | OpenCode, Claude Code or Codex, your choice  | [Part B](#part-b--shadowqa-individual)  |
| **Live** (both editions) | Your running web app on localhost | The Live bridge patches your workspace behind a Git checkpoint | [Part C](#part-c--shadowqa-live) |


Both editions use Gemini for planning, the same PostgreSQL schema, the same policy gates and the same
independent verification. Their data is kept in separate tenants. Live uses Anthropic (with OpenAI as
the fallback) for runtime diagnosis and is governed by the same automation modes.

## 1. Try the offline demo

From this repository in PowerShell:

```powershell
npm ci
npm run build
npm run demo
```

The demo intentionally plants a duplicate-submission bug, runs a failing regression test, applies a scripted fixture repair in an isolated copy, runs the tests in another fresh copy, and verifies the original repository stayed untouched. Its report is `.shadowqa/demo-report.json`. No Slack/GitHub/Gemini accounts, desktop app or Docker are needed for this demo. The scripted model is used only by the demo/tests; the product uses Gemini.

## 2. Prerequisites

- Node.js 22.16+ (Node 24 is recommended), npm and Git.
- Docker Desktop with its Linux engine running, or Docker Engine on Linux.
- VS Code if you want IDE controls, in addition to the desktop app.
- A GitHub repository you administer and a local clone with an `origin` remote on `github.com`.
- A Slack workspace where you may install a bot and select channels.
- Your Gemini API key and a model with available free quota.

Build the desktop app and, if you want to attach a terminal to an agent session from the IDE, install the matching OpenCode CLI:

```powershell
npm ci
npm run desktop:build
npm install -g opencode-ai@1.15.10
```

The runner uses its own pinned OpenCode inside Docker. The globally installed CLI attaches to that exact backend from a job's detail screen or the VS Code extension; it does not create a second agent. If the native executable cannot be located on Windows, set `SHADOWQA_OPENCODE_EXE` to your `opencode.exe` path.

## 3. Launch the desktop app and connect

```powershell
npx electron dist-desktop/desktop/electron/main.js
```

Choose **Team**, then **I'm setting this up** (an admin flow) or **My team already uses ShadowQA**
(paste the service URL and member token an admin already issued you — skip straight to step 9).

Administering:

1. **Connect GitHub** opens GitHub's own [App Manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) in your browser and comes back automatically with the app id, private key and webhook secret — nothing is copied by hand, and none of it touches a `.env` file. Then **Install on a repository** and pick the repo and its local clone folder; the app refuses a folder whose `origin` does not match.
2. **Connect Slack**: the app shows a pre-filled manifest to paste into Slack's own "create from an app manifest" screen (Slack has no API to automate app creation itself). Installing to a workspace shows the bot token right there; paste it into the app's field, validated live against `auth.test`. Generating a Socket Mode app-level token is the one credential Slack only issues from its own Basic Information page — paste that too. Pick which joined channels to observe.
3. **Start the shared service** starts `src/api/server.ts` and the durable worker in-process on this machine (or click **start one with Docker** first if you have no PostgreSQL yet — this runs `docker compose up -d` for you), bootstraps the database on first run, and mints the administrator credential straight into this machine's OS keychain.

If you would rather configure by hand (for a headless server, see §6 below), everything the guided
flow writes still lands in the same two places a hand-edited setup would use: environment variables
(`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`,
`SLACK_APP_TOKEN`, `SLACK_TEAM_ID`, `SLACK_SIGNING_SECRET`, `GEMINI_API_KEY`) and
`shadowqa.config.json`'s project entries. `shadowqa.config.example.json` and `.env.example`
document every field; copy them by hand if you are not using the desktop app's connect flow at all.

Create a Gemini key in [Google AI Studio](https://aistudio.google.com/apikey). Use a project without enabled billing if you want only the free tier. Confirm available quota for the selected model in your account; ShadowQA does not enable billing or silently change providers. Gemini's data-use policy must be acceptable for the sources and code you send, and you must comply with the provider's account terms. This is reflected by the explicit `externalInferenceApproved` configuration flag.

### Project configuration reference

Whether set through the desktop app's **Add a project** form or by hand in `shadowqa.config.json`:


| Setting                                                   | What to enter                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`                                                      | Stable short project ID, e.g. `payments-ui`.                                                      |
| `name`                                                    | Human-readable display name.                                                                     |
| `audience`                                                | `team` or `public`; project memberships define who may retrieve source context.                  |
| `repository.id`                                           | Stable internal repository ID.                                                                   |
| `repository.githubId`                                     | Numeric GitHub repository ID, not the name. The desktop app's repo picker fills this in for you.  |
| `repository.owner`, `name`                                | Exact GitHub owner and repository name.                                                          |
| `repository.installationId`                               | Numeric GitHub App installation ID.                                                               |
| `repository.defaultBranch`                                | Usually `main`; must match GitHub.                                                                |
| `repository.visibility`                                   | Actual `private` or `public`; changes block publication until reconfigured.                      |
| `repository.localPath`                                    | Absolute path to the clone the **service** uses for read-only planning inspection.               |
| `channels`                                                | Explicit Slack channel IDs with their private/public status. Each channel maps to one project.   |
| `profile.checks`                                          | Check IDs and executable argument arrays, such as `["npm", "test"]`. No shell strings.           |
| `profile.install`                                         | Optional offline setup commands. Network access is disabled during execution.                    |
| `profile.requiredChecks`                                  | IDs that must exist in `checks` and pass independently.                                          |
| `profile.allowedPaths`                                    | Approved exact files or directory prefixes ending in `/`. No glob syntax.                        |
| `profile.protectedPaths`                                  | Never publish changes here automatically. Protect CI, dependencies, secrets and sensitive areas. |
| `profile.autoPaths`                                       | Smaller subset eligible for automatic repair; documentation is the initial default.              |
| `profile.image`                                           | Reviewed image; build the default with `npm run sandbox:build`.                                  |
| `profile.reviewed`                                        | Set `true` after reviewing repository scripts, commands, toolchain and isolation.                |
| `profile.externalInferenceApproved`                       | Set `true` after approving the project data for Gemini inference.                                |
| `profile.maxFiles`, `maxLines`                            | Hard patch-size publication limits.                                                               |
| `profile.timeoutSeconds`, `memoryMb`, `cpus`              | Runner/container limits.                                                                          |
| `profile.scanIntervalMinutes`                             | Standing broader-scan interval, default 1440 minutes.                                             |
| `policy.mode`                                             | Begin with `observe` or `approval`.                                                               |
| `policy.dailyJobCap`, `repairAttempts`, `cooldownMinutes` | Repair budget; no more than two attempts.                                                          |
| `policy.publishSummary`                                   | A fixed summary safe to publish to the target repository audience. No private source excerpts.   |
| `policy.summaryApproved`                                  | Set `true` after an administrator approves that publication text.                                |
| `policy.autoMerge`                                        | Explicit opt-in; defaults to `false`.                                                              |
| `policy.requiredGithubChecks`                             | Required CI context names for an exact-head automatic merge.                                      |


The server increments policy versions when configuration changes and invalidates existing approvals. Re-save the project through the desktop app's Admin tab (or `PUT /projects/:id` directly) after a change, and re-consent to a changed runner profile with `npm run runner:map`.

Each project audience must be allowed to see **all** its selected sources. Put restricted private-channel context in a separate project if it should have a different membership. ShadowQA does not use Slack display names to guess membership or write targets.

## 4. What the Slack connection actually requests

The desktop app's Slack connect step uses [infra/slack-manifest.json](infra/slack-manifest.json) as
its starting manifest: Socket Mode, and bot scopes `channels:read`, `channels:history`, `chat:write`
and `app_mentions:read`. Invite the bot only to the channels you configure. Add `groups:read`,
`groups:history`, and the `message.groups` event to the manifest yourself only when intentionally
enabling selected private channels, before pasting it into Slack.

Socket Mode needs no public inbound URL. It persists envelopes before acknowledging them. Both ordinary messages and thread replies are observed; edits/deletions update the same source identity. There are no DM or attachment scopes. Emoji and ordinary messages never approve code execution.

The desktop app's Admin tab → **Sync now** on a project performs bounded history/reply backfill. Limited permissions, rate limits or pagination caps create visible gap records (shown in the dashboard's Connections card). Event capture remains the primary observation path.

For the HTTP Events API instead of Socket Mode (needed for public Marketplace distribution, not for a self-hosted pilot): omit the app-level token, disable Socket Mode in the manifest, set a reachable HTTPS event URL ending in `/webhooks/slack`, and configure `SLACK_SIGNING_SECRET`. TLS ingress is your deployment responsibility; Docker does not make a laptop publicly reachable.

## 5. What the GitHub connection actually requests

The desktop app's GitHub connect step submits a manifest requesting:


| Permission    | Access                            |
| ------------- | ---------------------------------- |
| Metadata      | Read                                |
| Contents      | Read/write for repair publication  |
| Pull requests | Read/write                          |
| Issues        | Read/write                          |
| Checks        | Read/write                          |
| Actions       | Read                                |


No administration or workflow-edit permission is requested. If repository rule visibility is unavailable under those permissions, full-auto merge waits; do not grant broad privileges just to bypass that result. The private key GitHub returns is written to the OS keychain, never a file you manage.

A local pilot uses API reconciliation every 180 seconds by default (`GITHUB_POLL_SECONDS` changes this). It explicitly hydrates PR files, reviews, comments, checks/statuses, workflows, issues and branch heads. It does not need an inbound webhook URL.

If you have a reachable HTTPS endpoint, set the app's webhook URL to `https://YOUR_HOST/webhooks/github` (the desktop app's connect flow does not do this for you) and subscribe to issues, issue comments, pull requests, reviews, review comments, check runs/suites, workflow runs, statuses and pushes. Installation access events are also handled. Configure the identical webhook secret on both sides.

The app JWT is exchanged for short-lived installation tokens scoped to the specific repository and read/write purpose. These credentials stay in the service publisher and never enter the code sandbox.

Refresh your planning and runner clones before the first run:

```powershell
git -C C:\projects\YOUR_REPO fetch origin
```

The clone root and exact `origin` repository are validated. Private-clone fetching uses your existing Git authentication outside the sandbox. A scan whose commit is absent from the registered clone fails visibly; fetch the needed branch and retry by queuing a new scan.

## 6. Headless / server deployment

The desktop app's **Start the shared service** step does exactly this, in-process, for an admin who
leaves their desktop app open. For a real server instead:

```powershell
docker compose up -d
npm run serve:team
```

On first run this migrates the database, registers the projects from `shadowqa.config.json` (if any), and creates the first administrator once — printing its token if OS credential storage is unavailable on that machine, so you can save it and set `SHADOWQA_TOKEN` for headless callers. Later starts never regenerate it.

```powershell
curl http://127.0.0.1:4380/health
```

confirms it is up; the desktop app's dashboard (pointed at that URL) is the normal way to check status, jobs, sources and connection health day to day.

The PostgreSQL container binds only to loopback. Change its default local-pilot password for a team deployment and update `DATABASE_URL` accordingly. Remote clients must use HTTPS. Use a TLS reverse proxy for an always-on service; no public hosting is provisioned by this repository.

### Team members and provider identity links

Issue and revoke members from the desktop app's Admin tab (**Add a member** / **Revoke a member**),
or directly:

```powershell
curl -X POST http://127.0.0.1:4380/members -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"id":"jamie","role":"developer","projects":["my-project"]}'
```

An administrator gives the returned membership token to that member through an appropriate private channel. The member pastes it into the desktop app's **join an existing team** screen, or into the VS Code extension's **ShadowQA: Set API Token** command. Tokens are SHA-256 hashed server-side and kept in OS credential storage (or VS Code's secret storage) client-side. `SHADOWQA_TOKEN` is the explicit headless alternative. Revoking a membership fences its authorized/active jobs.

Optional verified provider linking (a member's own GitHub/Slack identity, separate from the app-level GitHub/Slack connections above) uses an already authenticated membership and is not yet part of the desktop app's UI — it is reached directly:

```powershell
curl http://127.0.0.1:4380/identity/github -H "Authorization: Bearer $MEMBER_TOKEN"
curl http://127.0.0.1:4380/identity/slack -H "Authorization: Bearer $MEMBER_TOKEN"
```

Configure `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` or `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`, plus `SHADOWQA_PUBLIC_URL`. Register callback URLs ending in `/oauth/github/callback` and `/oauth/slack/callback`. Slack linking is a separate OpenID flow requesting `openid profile`; do not combine these with the bot installation scopes. The response gives an authorization URL to open; callbacks return plain text. One-use state, Slack nonce/signature/issuer/audience/expiry checks, provider IDs and active membership prevent display-name impersonation. Provider access tokens from linking are not retained.

## 7. Build and pair a runner

A runner is always a separate, dedicated machine with Docker — the admin's own desktop app never
executes jobs itself. From the desktop app's Admin tab, **Register a runner** (name + permitted
project IDs) issues a runner credential. On the runner machine:

```powershell
npm ci
npm run sandbox:build
npm run test:sandbox
SHADOWQA_RUNNER_TOKEN=<token from Register a runner> npx tsx scripts/runner-start.ts --save-token
npx tsx scripts/runner-map.ts my-project C:\projects\YOUR_REPO
npm run runner:start
```

`runner-map` displays the command profile for local review and records its digest before writing the mapping; it refuses to proceed without an explicit yes (or `--accept-profile`). The service cannot supply an arbitrary host path. The runner token, once saved with `--save-token`, is kept in that machine's OS credential storage (`SHADOWQA_RUNNER_TOKEN` set directly is the alternative for a machine with no OS keychain).

The default sandbox image includes Node 24, Git, ripgrep and OpenCode 1.15.10. Its containers have no runtime network access. Projects requiring dependencies need a reviewed derivative image. For example, build an image in the **target repository** with a Dockerfile like:

```dockerfile
FROM shadowqa-sandbox:1.15.10
USER root
WORKDIR /opt/project
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && chown -R node:node /opt/project
USER node
WORKDIR /workspace
```

Then select that image in `profile.image` and use an offline install step:

```json
{"id":"dependencies","argv":["cp","-a","/opt/project/node_modules","/workspace/node_modules"],"timeoutSeconds":120}
```

Review dependencies and any required install scripts before baking them into the image. If a dependency needs a native build or scripts, perform that intentionally during the reviewed image build. Do not add an unrestricted network-enabled install step to the runner. The same approach supports approved linters, compilers, secret scanners or dependency scanners available offline in your reviewed image.

## 8. Run the complete live loop

Post a requirement in one approved Slack channel, or wait for GitHub evidence to arrive. Then, in
the desktop app's **Watching** tab:

1. Review the project's accumulated context (Context tab, or `GET /projects/:id/context`), confirming any source the plan should cite.
2. Press **Generate plan**, giving an objective such as "Prevent duplicate submissions while a save is pending".
3. Review the plan on the **Plans** tab — steps, expected files, acceptance criteria, risk flags, open questions — and **Approve**.
4. Watch progress on the **Jobs** tab; open the job to see the exact command that attaches your IDE terminal to the running agent session, and the verified diff once checks pass.

The runner starts the approved job, records a session, and runs independent checks. The publisher opens a dedicated repair PR only when the patch, current authority, base SHA and configured safe summary pass validation. Slack receives a status if configured. A daily/PR/main scan can later reproduce a recurrence and create a finding; automatic modes may propose a bounded repair, while approval mode waits for a **Repair** click (or `POST /findings/:id/repair`) on the **Findings** tab and approval.

## 9. Install the VS Code extension

```powershell
npm run package:extension
```

In VS Code, run **Extensions: Install from VSIX...** and select `vscode-extension/shadowqa-0.1.0.vsix`. Set:

```json
{
  "shadowqa.serviceUrl": "http://127.0.0.1:4380"
}
```

Run **ShadowQA: Set API Token** and paste a member or admin token (the desktop app's Admin tab issues these; there is no `shadowqa.cliPath` setting anymore — the extension calls the API directly). Then run **ShadowQA: Open Command Center**'s replacement, the diamond activity-bar icon's tree view. Plans open as readable JSON documents; approvals use native VS Code confirmation; sessions run in integrated terminals. **Open Agent Session** binds the exact recorded backend/session and can open the isolated files in another editor window. Completed sessions have logs/diffs even after the server stops.

Use **ShadowQA: Watch Saved Files**, which launches `npx tsx scripts/watch-project.ts` in an integrated terminal — the same isolated, Docker-sandboxed checks a real job uses, on every save. Generated/dependency/credential folders are excluded. Results include a snapshot hash and stale flag, and compiler locations appear in VS Code Problems. No repairs are applied to uncommitted files. Add `.shadowqa/` to the target repository's ignore file for local diagnostic reports.

## Troubleshooting and operations


| Symptom                  | Action                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No runner / queued jobs  | Keep `npm run runner:start` running on the runner machine; a sleeping machine cannot execute jobs. Check the desktop app's dashboard.                                    |
| Docker unavailable       | Start Docker Desktop with Linux containers, then `npm run test:sandbox`.                                                                                                  |
| Profile changed          | Re-save the project (desktop app or `PUT /projects/:id`), re-run `npm run runner:map`, then generate a new plan.                                                         |
| Dirty clone              | Commit or stash intentionally; ShadowQA does not change your uncommitted files.                                                                                           |
| Missing/stale SHA        | Fetch the configured remote branch in service and runner clones, then compile/scan again.                                                                                 |
| `quota_paused`           | Wait for provider quota recovery or the next configured budget day, then generate a plan again. No automatic billing/fallback occurs.                                    |
| Inference disabled       | Set `profile.externalInferenceApproved` after checking the data policy, re-save the project.                                                                             |
| PR publication blocked   | Read the Admin tab's Diagnostics card and the job's events. Check summary approval, scopes, tests, patch paths and current base.                                          |
| Quarantined runner       | `docker rm -f shadowqa-<job-id> shadowqa-<job-id>-check` on the old runner machine, inspect retained workspaces, cancel the old job in the desktop app and generate a fresh plan. Never blindly resume a second executor. |
| Tests fail on baseline   | Findings distinguish environment, pre-existing and reproduced failures. A failed process never becomes a passing artifact because an agent said so.                       |
| Slack/GitHub history gap | Check bot membership, app permissions and API rate limits; sync is bounded and may require a narrower channel/repository setup.                                           |
| Automatic merge waits    | Required human reviews/rules, stale SHA, failing/pending checks or unavailable rule visibility are authoritative. Merge manually in GitHub if appropriate.                |
| Token revoked            | Obtain a new administrator-issued membership/device token and reconnect; old jobs remain fenced.                                                                          |


The desktop app's Admin tab's Diagnostics card covers job logs, the inbox/outbox queue (with a retry button), and the recent audit log in one place.

Back up PostgreSQL with encrypted, access-controlled backups and test a restore into a separate empty database. A plain `pg_dump` contains private source context. The backup host and eventual backup expiry must follow your team retention policy. Protect the database volume and `.shadowqa` runner state with OS disk encryption. Inspect retained runner workspaces under a runner machine's home directory's `.shadowqa/runner` before removing old runs; server pruning does not delete those local folders or external backups.

The local pilot needs only the existing machine, PostgreSQL/Docker, Slack/GitHub Apps and available Gemini free quota. Always-on compute, HTTPS ingress, storage, backup and maintenance remain your deployment responsibilities.

---



# Part B — ShadowQA Individual

The individual edition needs no Slack, no GitHub App, no Docker and no PostgreSQL server. It reads
the AI conversations you already have and runs the work through the coding CLI you already use.
[individual/README.md](individual/README.md) documents the design; this part is the installation.

## B1. Prerequisites

- Node.js 22.16+ (24 recommended) and Git.
- A Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey)). Planning and extraction
require it; without one they refuse with the reason rather than showing invented output.
- At least one coding CLI on your PATH:
  - `npm i -g opencode-ai@1.15.10` — uses your Gemini key, no coding subscription needed
  - `npm i -g @anthropic-ai/claude-code` then `claude` once to sign in
  - `npm i -g @openai/codex` then `codex` once to sign in
- Chrome, Edge or Chromium 116+ for the side panel.

Build everything and launch the desktop app:

```powershell
npm ci
npm run build:individual
npm run desktop:build
npx electron dist-desktop/desktop/electron/main.js
```

`build:individual` compiles `individual/**` to `dist-individual/` (used by the headless server path
and by `tsconfig.desktop.json`'s own compile) and bundles the extension to `individual/extension/dist`.

## B2. Choose Solo and connect

At the desktop app's welcome screen, choose **Solo**, then:


| Step          | What it does                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models        | Paste your Gemini key (required); Anthropic/OpenAI (optional, for Live) — each validated live and stored in the OS keychain, never a file.                                                                                                             |
| Coding tools  | The screen detects the Claude Code and Codex CLIs and their local transcripts (`~/.claude/projects` or `CLAUDE_CONFIG_DIR`; `~/.codex/sessions` or `CODEX_HOME`) automatically — nothing to configure.                                                |
| First project | Project ID, repository folder (native picker), check command, coding backend and automation mode.                                                                                                                                                       |


Nothing is written into your repository or a project `.env` file. The individual service's own data
(embedded database, tokens, workspaces) still lives under `~/.shadowqa-individual` by default
(`SHADOWQA_INDIVIDUAL_HOME` to change it) — that part of the layout is unchanged from before.

## B3. Load the extension and pair

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → select `individual/extension/dist`
3. Copy the extension ID from its card
4. Desktop app → **Context** tab → Browser extension companion → paste the ID → **Register**, then **reload the extension** so Chrome picks up the host
5. Context tab → **Generate pairing code** → open the ShadowQA side panel, type the code, press **Pair**

`Register` writes the native messaging host manifest immediately (this is a one-time local file
Chrome itself requires — not a ShadowQA config file). The pairing code is valid for ten minutes and
one use; the extension receives its own token, which cannot mint pairing codes, change projects,
approve plans or cancel tasks.

There is no Chrome Web Store listing. Loading unpacked is the supported path.

## B4. Track what you want read

In the side panel, open a ChatGPT or Claude conversation and press **Track this conversation**.
Only then is anything captured, and only what the page has rendered. The panel labels the capture
`partial capture` for exactly that reason.

For local coding sessions, the desktop app's **Context** tab → Local coding sessions lists every
Claude Code/Codex session it can see on this machine, with a **Subscribe** button per session.
The **Watching** dashboard then confirms what is being observed.

## B5. The loop

On the **Watching** dashboard, press **Generate plan** (this both extracts context with Gemini and
compiles the plan in one step). Then:

1. **Context** tab → review extracted items; **Confirm**/**Reject** inline — your correction is never overwritten by a later extraction.
2. **Plans** tab → open the plan, review scope/files/acceptance criteria/tests/open questions, **Approve**.
3. **Jobs** tab → open the job for progress, the session, checks, the exact command to reopen the session in your IDE, and the verified diff.
4. Job detail → **Open pull request** (only with a GitHub remote and a `GITHUB_TOKEN` pasted in Connect).

Continuous QA lives on the **Context** tab (saved-file watching toggle) and the **Findings** tab
(scan results, fingerprinted findings, **Repair**).

## B6. What it does to your repository

The agent works in a copy exported from Git objects at the plan's base commit, so your clone —
including everything uncommitted — is never written to. The verified result is committed to
`refs/heads/shadowqa/<task>` using Git plumbing against a temporary index: no checkout, no index
change, no stash, and `HEAD` does not move. Delete the branch to discard it.

## B7. Troubleshooting


| Symptom                                               | Action                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel says *Companion not installed*                  | Context tab → Browser extension companion → Register, then reload the extension in `chrome://extensions`.                                                           |
| Panel says *registered for a different extension ID*  | The ID changes if you move the unpacked folder. Register again with the new ID.                                                                                      |
| Panel says *ShadowQA Individual is not running*       | Open the desktop app — Solo's service only runs while it is open.                                                                                                    |
| Pairing code rejected                                 | Codes are one-use and expire in ten minutes. Generate a new one from the Context tab.                                                                                |
| *No model is configured*                              | Set the Gemini key in Connect. ShadowQA refuses to plan rather than invent one.                                                                                      |
| Task stuck at `waiting_for_runner`                    | The chosen backend is not installed or not signed in — the Connect screen's coding-tools card names it.                                                              |
| Backend ran but nothing changed                       | Open the job's detail screen. OpenCode and Codex exit zero on some failures; ShadowQA reads their events and shows the real reason.                                  |
| `The 'gpt-…' model requires a newer version of Codex` | Upgrade the Codex CLI; the adapter reports the CLI's own message.                                                                                                    |
| No turns captured                                     | The site's markup may have changed. The panel shows a warning instead of pretending the conversation is empty; open an issue with the site and date.                 |
| Want it all gone                                      | Context tab → Browser extension companion → uninstall (or delete `~/.shadowqa-individual` to remove the database, tokens and workspaces).                            |


`GET http://127.0.0.1:4390/health` and `GET http://127.0.0.1:4390/backends` (the desktop app's own
calls) report the database, the Gemini key, and all three coding backends' availability.

---

# Part C — ShadowQA Live

Live watches a web application while it runs on your machine and turns a runtime failure into a
diagnosed, risk-graded, replay-verified fix. It is one tab in the desktop app, for either edition,
and is governed by the project's automation mode.

## C1. Prerequisites

- Python 3.11 or newer on `PATH` (`python --version`). Opening the desktop app's **Live** tab creates
  `live/backend/.venv` and installs `live/backend/requirements.txt` on first run.
- An Anthropic key (`ANTHROPIC_API_KEY`) for diagnosis; an OpenAI key (`OPENAI_API_KEY`) as the
  fallback. Either alone works — paste them on the Connect screen (Solo) or set them in the
  environment before starting `serve:team` (Team). A Gemini key adds an optional third provider.
  Without any key, Live still captures and correlates incidents but cannot diagnose them, and says so.
- Git in the workspace you want it to patch. Live creates a checkpoint before every write and rolls
  back to it when validation or replay fails.
- Optional: `MONGO_URL` for a shared store. Without it, Live keeps its state in
  `.shadowqa/live/` as JSON.

## C2. Describe the application

`live/shadowqa.workspace.json` names the workspace root (relative to the file), the frontend and
backend directories, what Live may read, what it may write, what it must never touch, how minified
frames map back to source, and the patch limits. The shipped file describes the demo storefront; copy
it next to your own application and set `SHADOWQA_WORKSPACE` to its path before opening the Live tab:

```json
{
  "name": "My app",
  "root": ".",
  "frontend_dir": "frontend",
  "backend_dir": "backend",
  "read_roots": ["frontend/src", "backend/app"],
  "write_roots": ["frontend/src", "backend/app"],
  "deny": ["frontend/.env", "backend/.env", "backend/app/auth"],
  "source_map": { "strip_prefixes": ["webpack:///./"], "map_to": "frontend" },
  "limits": { "max_files_per_patch": 3, "max_changed_lines": 120, "max_file_read_bytes": 200000 },
  "git": { "branch_prefix": "shadowqa/fix-" }
}
```

Validation uses the linters and tests the workspace already has (ESLint and the frontend test runner
under `frontend_dir`, pyflakes and pytest under `backend_dir`); `deny` paths are refused even when a
patch names them, and a patch over the limits is graded HIGH.

## C3. Start the bridge

Open the desktop app's **Live** tab and press **Start watching this app**. The bridge listens on
`http://127.0.0.1:8001`; its token is written to `live/.shadowqa/bridge-token` and is required by the
SDK and the extension.


| Project mode | Live autonomy | Meaning |
| --- | --- | --- |
| `observe` | `observe` | Diagnose only. Nothing is written. |
| `approval` | `approve_all` | Every patch waits for Approve in the Live tab. |
| `auto-fix` | `auto_low` | LOW-risk patches apply on their own, then validate and replay. |
| `full-auto` | `auto_low` | Same restricted scope; merging stays with the service's merge policy. |

## C4. Put the SDK in the page

The Live tab's **Add ShadowQA Live to your app** card has a Copy button for the
`<script src="http://127.0.0.1:8001/shadowqa.js" data-bridge-url=… data-token=…>` tag. Paste
it into the page you are developing, or load `live/extension/` unpacked in Chrome
(`chrome://extensions` → *Load unpacked*) and enter the bridge URL and token in its options page; the
extension injects the same SDK into localhost pages. The SDK records clicks, requests, console output
and exceptions; it does not send anything to a non-localhost origin.

## C5. The loop

1. Use the app. When an interaction fails, the overlay marks it and the bridge joins the click, the
   request it caused and the exception into one incident.
2. The Live tab's incident list shows them; opening one shows the chain, the root cause, the proposed patch, its risk grade and the current state. The same incidents appear on the **Findings** tab with the ◉ glyph.
3. **Approve** applies the patch behind a checkpoint, runs the workspace's linters and tests, then replays the recorded interaction against the running app. A failed replay rolls back automatically.
4. **Open pull request** pushes a branch and requests the pull request; **Undo** rolls back; **Dismiss** closes the incident.

## C6. Troubleshooting

| Symptom | Action |
| --- | --- |
| `LIVE_MISSING` | The `live/` directory is not in this checkout. |
| `PIP` | `pip install -r live/backend/requirements.txt` failed; run it in `live/backend` to see the error. |
| Health shows `linked: false` while a project was expected | The ShadowQA service is not reachable; Live keeps its last policy and never widens it. |
| Incidents are captured but stay `captured` | No `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — add one on the Connect screen (Solo) or in the Team service's environment. |
| `policy.write_blocked` in the audit | The project is in `observe`; change the mode in the desktop app's project settings. |
| Settings PUT returns 409 | Autonomy is governed by the linked project; change the project's mode instead. |
| `replay_failed` | The app could not be brought back to the recorded state, or the fix did not hold. The workspace has been rolled back; open the incident's detail in the Live tab. |
