# ShadowQA setup

This setup implements the revisions in `doc.md`: a CLI and native IDE controls, explicit context compilation, and Gemini. There is no dashboard to deploy.

ShadowQA ships in two editions from one codebase:

| Edition | Reads | Runs the code in | Setup |
| --- | --- | --- | --- |
| **Team** (`shadowqa`) | Slack + GitHub | OpenCode in network-disabled Docker | Parts 1–9 below |
| **Individual** (`shadowqa-individual`) | ChatGPT, Claude, Claude Code, Codex | OpenCode, Claude Code or Codex, your choice | [Part B](#part-b--shadowqa-individual) |

Both use Gemini for planning, the same PostgreSQL schema, the same policy gates and the same
independent verification. Their data is kept in separate tenants.

## 1. Try the offline demo

From this repository in PowerShell:

```powershell
cd C:\hack
npm ci
npm run build
npm run demo
```

The demo intentionally plants a duplicate-submission bug, runs a failing regression test, applies a scripted fixture repair in an isolated copy, runs the tests in another fresh copy, and verifies the original repository stayed untouched. Its report is `.shadowqa/demo-report.json`. No Slack/GitHub/Gemini accounts or Docker are needed for this demo. The scripted model is used only by the demo/tests; the product uses Gemini.

## 2. Prerequisites

- Node.js 22.16+ (Node 24 is recommended), npm and Git.
- Docker Desktop with its Linux engine running, or Docker Engine on Linux.
- VS Code if you want IDE controls.
- A GitHub repository you administer and a local clone with an `origin` remote on `github.com`.
- A Slack workspace where you may install a bot and select channels.
- Your Gemini API key and a model with available free quota.

Install the matching OpenCode CLI for terminal attachment:

```powershell
npm install -g opencode-ai@1.15.10
npm link
shadowqa --help
```

The runner uses its own pinned OpenCode inside Docker. The globally installed CLI attaches to that exact backend; it does not create a second agent. If the native executable cannot be located on Windows, set `SHADOWQA_OPENCODE_EXE` to your `opencode.exe` path.

## 3. Create configuration

The guided route connects Slack, then GitHub, then the automation mode, then the project, verifying
each account live before it records anything:

```powershell
shadowqa setup
```

Step 1 calls Slack's `auth.test` and lists only the channels the bot actually joined. Step 2
authenticates the GitHub App, lists its installations and their repositories, and refuses a local
folder whose `origin` does not match the repository you picked. Step 3 records the automation mode.
Step 4 names the project and takes your Gemini key. It writes `.env` and `shadowqa.config.json`,
preserving comments and any settings it does not own. Repeat one step with
`shadowqa setup --step slack|github|mode|project`.

`shadowqa watching` then shows what is being observed, and the same steps are reachable from
`shadowqa ui` (option 8).

To edit the files by hand instead:

```powershell
shadowqa init
```

This copies `.env.example` to `.env` and `shadowqa.config.example.json` to `shadowqa.config.json` without replacing existing files. Keep `.env`, GitHub private keys and backup passphrases out of Git.

Edit `.env`:

```dotenv
DATABASE_URL=postgresql://shadowqa:shadowqa@127.0.0.1:5432/shadowqa
SHADOWQA_URL=http://127.0.0.1:4380
SHADOWQA_TENANT=local
GEMINI_API_KEY=YOUR_KEY
GEMINI_MODEL=gemini-2.5-flash
GEMINI_DAILY_CALLS=100
```

Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Use a project without enabled billing if you want only the free tier. Confirm available quota for the selected model in your account; ShadowQA does not enable billing or silently change providers. Gemini's data-use policy must be acceptable for the sources and code you send, and you must comply with the provider's account terms. This is reflected by the explicit `externalInferenceApproved` configuration flag.

### Project configuration

Edit each project in `shadowqa.config.json`:

| Setting | What to enter |
| --- | --- |
| `id` | Stable short project ID, e.g. `payments-ui`. Used in CLI commands. |
| `name` | Human-readable display name. |
| `audience` | `team` or `public`; project memberships define who may retrieve source context. |
| `repository.id` | Stable internal repository ID. |
| `repository.githubId` | Numeric GitHub repository ID, not the name. Read it from the GitHub repository API. |
| `repository.owner`, `name` | Exact GitHub owner and repository name. |
| `repository.installationId` | Numeric GitHub App installation ID. |
| `repository.defaultBranch` | Usually `main`; must match GitHub. |
| `repository.visibility` | Actual `private` or `public`; changes block publication until reconfigured. |
| `repository.localPath` | Absolute path to the clone the **service** uses for read-only planning inspection. |
| `channels` | Explicit Slack channel IDs with their private/public status. Each channel maps to one project. |
| `profile.checks` | Check IDs and executable argument arrays, such as `["npm", "test"]`. No shell strings. |
| `profile.install` | Optional offline setup commands. Network access is disabled during execution. |
| `profile.requiredChecks` | IDs that must exist in `checks` and pass independently. |
| `profile.allowedPaths` | Approved exact files or directory prefixes ending in `/`. No glob syntax. |
| `profile.protectedPaths` | Never publish changes here automatically. Protect CI, dependencies, secrets and sensitive areas. |
| `profile.autoPaths` | Smaller subset eligible for automatic repair; documentation is the initial default. |
| `profile.image` | Reviewed image; build the default with `npm run sandbox:build`. |
| `profile.reviewed` | Set `true` after reviewing repository scripts, commands, toolchain and isolation. |
| `profile.externalInferenceApproved` | Set `true` after approving the project data for Gemini inference. |
| `profile.maxFiles`, `maxLines` | Hard patch-size publication limits. |
| `profile.timeoutSeconds`, `memoryMb`, `cpus` | Runner/container limits. |
| `profile.scanIntervalMinutes` | Standing broader-scan interval, default 1440 minutes. |
| `policy.mode` | Begin with `observe` or `approval`. |
| `policy.dailyJobCap`, `repairAttempts`, `cooldownMinutes` | Repair budget; no more than two attempts. |
| `policy.publishSummary` | A fixed summary safe to publish to the target repository audience. No private source excerpts. |
| `policy.summaryApproved` | Set `true` after an administrator approves that publication text. |
| `policy.autoMerge` | Explicit opt-in; defaults to `false`. |
| `policy.requiredGithubChecks` | Required CI context names for an exact-head automatic merge. |

The server increments policy versions when configuration changes and invalidates existing approvals. Re-import changes with `shadowqa project import`, and re-consent to changed runner profiles with `shadowqa runner map`.

Each project audience must be allowed to see **all** its selected sources. Put restricted private-channel context in a separate project if it should have a different membership. ShadowQA does not use Slack display names to guess membership or write targets.

## 4. Install the Slack app

1. Create an app at [Slack app management](https://api.slack.com/apps), using [infra/slack-manifest.json](infra/slack-manifest.json).
2. Enable Socket Mode and generate an app-level token with `connections:write`.
3. Install the bot into your workspace. The manifest requests `channels:read`, `channels:history`, `chat:write`, and `app_mentions:read`.
4. Invite the bot only to the channels you configure. Add `groups:read`, `groups:history`, and the `message.groups` event only when intentionally enabling selected private channels.
5. Add these `.env` values:

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_TEAM_ID=T...
SLACK_SIGNING_SECRET=...
```

Socket Mode needs no public inbound URL. It persists envelopes before acknowledging them. Both ordinary messages and thread replies are observed; edits/deletions update the same source identity. There are no DM or attachment scopes. Emoji and ordinary messages never approve code execution.

`shadowqa project sync PROJECT_ID` performs bounded history/reply backfill. Limited permissions, rate limits or pagination caps create visible gap records. Event capture remains the primary observation path.

For HTTP Events API instead, omit `SLACK_APP_TOKEN`, disable Socket Mode in the app, set a reachable HTTPS event URL ending in `/webhooks/slack`, and configure `SLACK_SIGNING_SECRET`. TLS ingress is your deployment responsibility; Docker does not make a laptop publicly reachable.

## 5. Install the GitHub App

Create a GitHub App in the organization/user account that owns your selected repositories. Install it only on those repositories. Configure these repository permissions:

| Permission | Access |
| --- | --- |
| Metadata | Read |
| Contents | Read/write for repair publication |
| Pull requests | Read/write |
| Issues | Read/write |
| Checks | Read/write |
| Actions | Read |

No administration or workflow-edit permission is requested. If repository rule visibility is unavailable under those permissions, full-auto merge waits; do not grant broad privileges just to bypass that result.

Generate a private key and store it outside the repository. Add:

```dotenv
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY_PATH=C:/secure/shadowqa-app.pem
GITHUB_WEBHOOK_SECRET=YOUR_RANDOM_SECRET
```

Set each project's numeric repository and installation IDs. A local pilot uses API reconciliation every 180 seconds by default (`GITHUB_POLL_SECONDS` changes this). It explicitly hydrates PR files, reviews, comments, checks/statuses, workflows, issues and branch heads. It does not need an inbound webhook URL.

If you have a reachable HTTPS endpoint, set the app webhook URL to `https://YOUR_HOST/webhooks/github` and subscribe to issues, issue comments, pull requests, reviews, review comments, check runs/suites, workflow runs, statuses and pushes. Installation access events are also handled. Configure the identical webhook secret on both sides.

The app JWT is exchanged for short-lived installation tokens scoped to the specific repository and read/write purpose. These credentials stay in the service publisher and never enter the code sandbox.

Refresh your planning and runner clones before the first run:

```powershell
git -C C:\projects\YOUR_REPO fetch origin
```

The clone root and exact `origin` repository are validated. Private-clone fetching uses your existing Git authentication outside the sandbox. A scan whose commit is absent from the registered clone fails visibly; fetch the needed branch and retry by queuing a new scan.

## 6. Start PostgreSQL and initialize membership

```powershell
docker compose up -d
shadowqa bootstrap
shadowqa serve
```

`bootstrap` migrates the database, registers configured projects, and creates the first administrator once. Its token is stored in the OS keyring. If OS storage is unavailable, it prints the token **once** so you can save it securely and supply `SHADOWQA_TOKEN` to a headless service. Later starts never regenerate it.

Keep `serve` running. In another terminal:

```powershell
shadowqa status
shadowqa doctor
```

The PostgreSQL container binds only to loopback. Change its default local-pilot password for a team deployment and update `DATABASE_URL` accordingly. Remote clients must use HTTPS. Use a TLS reverse proxy for an always-on service; no public hosting is provisioned by this repository.

### Team members and provider identity links

```powershell
shadowqa member add jamie --role developer --projects my-project
shadowqa member add reviewer --role viewer --projects my-project
```

An administrator gives the returned membership token to that member through an appropriate private channel. The member runs `shadowqa login` and pastes it into the hidden prompt. Tokens are SHA-256 hashed server-side and kept in OS credential storage client-side. `SHADOWQA_TOKEN` is the explicit headless alternative. `shadowqa member revoke MEMBER_ID` revokes the membership and fences its authorized/active jobs.

Optional verified provider linking uses an already authenticated membership:

```powershell
shadowqa link github
shadowqa link slack
```

Configure `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` or `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`, plus `SHADOWQA_PUBLIC_URL`. Register callback URLs ending in `/oauth/github/callback` and `/oauth/slack/callback`. Slack linking is a separate OpenID flow requesting `openid profile`; do not combine these with the bot installation scopes. The CLI prints the authorization URL. Callbacks return plain text, not a web app. One-use state, Slack nonce/signature/issuer/audience/expiry checks, provider IDs and active membership prevent display-name impersonation. Provider access tokens from linking are not retained.

## 7. Build and pair the runner

```powershell
npm run sandbox:build
npm run test:sandbox
shadowqa runner register my-laptop --projects my-project
shadowqa runner map my-project C:\projects\YOUR_REPO
shadowqa runner start
```

Mapping displays the command profile for local review and records its digest. The service cannot supply an arbitrary host path. The runner token is kept separately in OS credential storage (`SHADOWQA_RUNNER_TOKEN` is the headless alternative). For a remote machine, register the device on the service, securely transfer the one-time token if necessary, run `shadowqa login --runner` on the device, then map its local clone.

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

Post a requirement in one approved Slack channel, or wait for GitHub evidence to arrive. Then:

```powershell
shadowqa context my-project
shadowqa confirm SOURCE_ID
shadowqa compile my-project --objective "Prevent duplicate submissions while a save is pending"
shadowqa approve PLAN_ID
shadowqa jobs
shadowqa attach JOB_ID
shadowqa diff JOB_ID
```

The runner starts the approved job, records a session, and runs independent checks. The publisher opens a dedicated repair PR only when the patch, current authority, base SHA and configured safe summary pass validation. Slack receives a status if configured. A daily/PR/main scan can later reproduce a recurrence and create a finding; automatic modes may propose a bounded repair, while approval mode waits for `shadowqa repair FINDING_ID` and approval.

`shadowqa ui` gives you the same actions in a simple terminal command center. `--json` on the root command produces machine-readable output for automation.

## 9. Install the VS Code extension

```powershell
npm run package:extension
```

In VS Code, run **Extensions: Install from VSIX...** and select `vscode-extension/shadowqa-0.1.0.vsix`. Set:

```json
{
  "shadowqa.cliPath": "C:/hack/dist/cli/main.js",
  "shadowqa.serviceUrl": "http://127.0.0.1:4380"
}
```

Run **ShadowQA: Open Command Center** or open the diamond activity-bar icon. Plans open as readable JSON documents; approvals use native VS Code confirmation; sessions run in integrated terminals. **Open Agent Session** binds the exact recorded backend/session and can open the isolated files in another editor window. Completed sessions have logs/diffs even after the server stops.

Use **ShadowQA: Watch Saved Files** or:

```powershell
shadowqa watch my-project --folder C:\projects\YOUR_REPO
```

Only saved files are copied. Checks run after 8 seconds of inactivity in separate containers. Generated/dependency/credential folders are excluded. Results include a snapshot hash and stale flag, and compiler locations appear in VS Code Problems. No repairs are applied to uncommitted files. Add `.shadowqa/` to the target repository's ignore file for local diagnostic reports.

## Troubleshooting and operations

| Symptom | Action |
| --- | --- |
| No runner / queued jobs | Keep `shadowqa runner start` running; a sleeping machine cannot execute jobs. Check `status`. |
| Docker unavailable | Start Docker Desktop with Linux containers, then `npm run test:sandbox`. |
| Profile changed | Review/import project settings, re-run `runner map`, then compile a new plan. |
| Dirty clone | Commit or stash intentionally; ShadowQA does not change your uncommitted files. |
| Missing/stale SHA | Fetch the configured remote branch in service and runner clones, then compile/scan again. |
| `quota_paused` | Wait for provider quota recovery or the next configured budget day, then explicitly compile again. No automatic billing/fallback occurs. |
| Inference disabled | Set `profile.externalInferenceApproved` after checking the data policy, import config. |
| PR publication blocked | Read `shadowqa queue` and job logs. Check summary approval, scopes, tests, patch paths and current base. |
| Quarantined runner | Run `runner quarantine-clean JOB_ID` on the old device, inspect retained workspaces, cancel the old job and compile a fresh plan. Never blindly resume a second executor. |
| Tests fail on baseline | Findings distinguish environment, pre-existing and reproduced failures. A failed process never becomes a passing artifact because an agent said so. |
| Slack/GitHub history gap | Check bot membership, app permissions and API rate limits; sync is bounded and may require a narrower channel/repository setup. |
| Automatic merge waits | Required human reviews/rules, stale SHA, failing/pending checks or unavailable rule visibility are authoritative. Merge manually in GitHub if appropriate. |
| Token revoked | Obtain a new administrator-issued membership/device token and log in; old jobs remain fenced. |

Useful commands: `shadowqa logs JOB_ID`, `shadowqa queue`, `shadowqa queue --retry`, `shadowqa audit`, `shadowqa prune`, `shadowqa pause`, `shadowqa resume`.

Back up PostgreSQL with encrypted, access-controlled backups and test a restore into a separate empty database. A plain `pg_dump` contains private source context. The backup host and eventual backup expiry must follow your team retention policy. Protect the database volume and `.shadowqa` runner state with OS disk encryption. Inspect retained runner workspaces under your home directory's `.shadowqa/runner` before removing old runs; server pruning does not delete those local folders or external backups.

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

Build both halves:

```powershell
npm ci
npm run build:individual
npm link          # puts shadowqa-individual on your PATH
```

`build:individual` compiles `individual/**` to `dist-individual/` and bundles the extension to
`individual/extension/dist`.

## B2. Guided setup

```powershell
shadowqa-individual setup
```

| Step | What it does |
| --- | --- |
| 1 · Claude | Detects the Claude Code CLI and its local transcripts (`~/.claude/projects`, or `CLAUDE_CONFIG_DIR`). Optionally installs `SessionStart` / `Stop` / `SessionEnd` hooks. Claude Code will ask you to review changed hooks in `/hooks` before they run. |
| 2 · OpenAI | Detects the Codex CLI and its rollouts (`~/.codex/sessions`, or `CODEX_HOME`). States plainly that Codex threads never written to this machine are not visible. |
| 3 · Extension | Prints the load-unpacked instructions, takes your extension ID, and registers the native messaging host for Chrome, Edge and Chromium. |
| 4 · Mode | Takes your Gemini key, then the automation mode and the execution backend, then the project ID, repository folder and check command. |

Settings are written to `~/.shadowqa-individual/individual.env` with mode `0600`. Nothing is written
into your repository. Repeat one step with
`shadowqa-individual setup --step claude|openai|extension|mode`.

## B3. Load the extension and pair

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → select `individual/extension/dist`
3. Copy the extension ID from its card
4. `shadowqa-individual companion install <extension-id>` (setup does this for you if you gave it
   the ID) — then **reload the extension** so Chrome picks up the host
5. Start the service, then pair:

```powershell
shadowqa-individual serve     # leave this running
# in another terminal:
shadowqa-individual pair
```

`pair` prints an eight-character code valid for ten minutes. Open the ShadowQA side panel, type the
code, press **Pair**. The extension receives its own token; it cannot mint pairing codes, change
projects, approve plans or cancel tasks.

There is no Chrome Web Store listing. Loading unpacked is the supported path.

## B4. Track what you want read

In the side panel, open a ChatGPT or Claude conversation and press **Track this conversation**.
Only then is anything captured, and only what the page has rendered. The panel labels the capture
`partial capture` for exactly that reason.

For local coding sessions:

```powershell
shadowqa-individual sessions list
shadowqa-individual sessions add my-project claude-code <session-id>
shadowqa-individual sessions add my-project codex <session-id>
```

Then confirm what is being watched:

```powershell
shadowqa-individual status
```

## B5. The loop

```powershell
shadowqa-individual extract my-project
shadowqa-individual items my-project
shadowqa-individual confirm ITEM_ID            # your correction is never overwritten
shadowqa-individual plan my-project -o "Stop duplicate submissions"
shadowqa-individual approve PLAN_ID
shadowqa-individual task TASK_ID               # progress, session, checks
shadowqa-individual open TASK_ID               # command to reopen the session in your IDE
shadowqa-individual diff TASK_ID
shadowqa-individual pr TASK_ID                 # only with a GitHub remote and GITHUB_TOKEN
```

`shadowqa-individual ui` gives the same actions in one terminal screen. `--json` on the root command
produces machine-readable output.

Continuous QA:

```powershell
shadowqa-individual watch my-project      # saved files, checks after 8s of quiet
shadowqa-individual scan my-project       # your checks against a clean copy of HEAD
shadowqa-individual findings
shadowqa-individual repair FINDING_ID
```

## B6. What it does to your repository

The agent works in a copy exported from Git objects at the plan's base commit, so your clone —
including everything uncommitted — is never written to. The verified result is committed to
`refs/heads/shadowqa/<task>` using Git plumbing against a temporary index: no checkout, no index
change, no stash, and `HEAD` does not move. Delete the branch to discard it.

## B7. Troubleshooting

| Symptom | Action |
| --- | --- |
| Panel says *Companion not installed* | `shadowqa-individual companion install <extension-id>`, then reload the extension in `chrome://extensions`. |
| Panel says *registered for a different extension ID* | The ID changes if you move the unpacked folder. Re-run `companion install` with the new ID. |
| Panel says *ShadowQA Individual is not running* | Start `shadowqa-individual serve`. |
| Pairing code rejected | Codes are one-use and expire in ten minutes. Run `pair` again. |
| *No model is configured* | Set `GEMINI_API_KEY`. ShadowQA refuses to plan rather than invent one. |
| Task stuck at `waiting_for_runner` | The chosen backend is not installed or not signed in. `shadowqa-individual doctor` names it. |
| Backend ran but nothing changed | Read `shadowqa-individual task <id>`. OpenCode and Codex exit zero on some failures; ShadowQA reads their events and shows the real reason. |
| `The 'gpt-…' model requires a newer version of Codex` | Upgrade the Codex CLI; the adapter reports the CLI's own message. |
| No turns captured | The site's markup may have changed. The panel shows a warning instead of pretending the conversation is empty; open an issue with the site and date. |
| Want it all gone | `shadowqa-individual companion uninstall` removes the host and the Claude Code hooks; delete `~/.shadowqa-individual` to remove the database, tokens and workspaces. |

```powershell
shadowqa-individual doctor
```

checks Node, the Gemini key, all three backends, the native messaging host and the service.
