# ◈ ShadowQA

**Team edition — Slack and GitHub context → Gemini plan → approval → isolated OpenCode session → independent checks → repair PR.**

**Individual edition — ChatGPT, Claude, Claude Code and Codex context → Gemini plan → approval → a session in the coding tool you already use → verified diff.**

ShadowQA is a TypeScript service, a terminal CLI, a local Docker runner, a thin VS Code extension, and — for the individual edition — a Manifest V3 browser side panel and a local companion. There is **no web frontend**. Ordinary activity accumulates as source-linked context; `shadowqa compile` (or `shadowqa-individual plan`) starts planning. Gemini is the sole inference provider for planning in both editions. These choices implement the final **REVISIONS TO PLAN** in [doc.md](doc.md).

Both editions share one codebase, one PostgreSQL schema, one policy engine and one verification path; they keep their data in separate tenants. The individual edition lives in [`individual/`](individual/README.md) and defaults to an embedded PostgreSQL engine, so it needs no Docker and no database server.

Start with [SETUP.md](SETUP.md). The account-free demos are available immediately:

```powershell
npm ci
npm run build
npm run demo                          # team edition
npx tsx scripts/individual-demo.ts    # individual edition
```

The demo uses a real embedded PostgreSQL engine, Git snapshots, and actual Node tests. Its model output and repair are scripted fixtures: it does not call Gemini, impersonate a live OpenCode run, or open a GitHub PR. The separate `npm run test:sandbox` contract test uses real Docker and the pinned OpenCode server.

## Daily workflow

Connect the accounts once. Each step is verified live before it is recorded:

```powershell
shadowqa setup          # Slack → GitHub → automation mode → project
```

Then run these in separate terminals:

```powershell
shadowqa serve
shadowqa runner start
shadowqa ui
```

The command center shows project modes and source counts. The same actions are available individually:

```powershell
shadowqa status
shadowqa watching
shadowqa project sync my-project
shadowqa context my-project --query "duplicate submission"
shadowqa confirm SOURCE_ID
shadowqa compile my-project --objective "Prevent duplicate submissions"
shadowqa plan PLAN_ID
shadowqa approve PLAN_ID
shadowqa jobs
shadowqa attach JOB_ID
shadowqa diff JOB_ID
shadowqa findings
shadowqa repair FINDING_ID
```

An approval binds the actor to an immutable plan digest, repository SHA, command-profile digest, policy version, and expiry. Source edits, deletion, revocation, configuration changes, or a default-branch update invalidate affected execution. No model-generated shell command becomes an execution permission.

The runner creates independent copies of committed files. It never applies a repair to the developer's original clone. Dirty originals block repair with a commit/stash instruction. Jobs sleep in the durable queue when no runner is available. Closing the IDE does not stop the service or runner; stopping the runner stops its active sandbox.

## Automation modes

| Mode | Observe/check | Edit | Publish | Merge |
| --- | --- | --- | --- | --- |
| `observe` | Yes, when a reviewed runner profile is available | No | No repair PR | Never |
| `approval` | Yes | Exact user-approved plan | After independent verification | Human |
| `auto-fix` | Yes | Only configured automatic paths with no detected risk flags | After independent verification | Human |
| `full-auto` | Yes | Same restricted automatic scope | After independent verification | Explicit merge policy, exact head/checks, and repository rules required |

```powershell
shadowqa project mode my-project approval
shadowqa pause
shadowqa resume
```

Mode changes invalidate existing approvals. Automatic modes can start a bounded repair for a reproduced standing-QA finding under the administrator who enabled that policy. They **do not turn every Slack message into a coding task**. Source-driven planning still starts with `compile`. Two failed repair proposals/attempts for a finding, cooldowns, daily caps, risk flags, missing prerequisites, or exhausted Gemini quota stop further automation.

Protected paths are excluded from automated publication even after execution approval. Authentication, billing, dependencies, infrastructure, test changes and other sensitive content carry deterministic risk flags. Default automatic paths contain documentation only. Assertion removal, test disabling patterns, binary patches, renames, deletions, symlinks, submodules and changes outside the exact plan require manual handling. Broaden a profile deliberately, review it on both service and runner, and compile a new plan.

## Architecture

```mermaid
flowchart LR
  Slack[Slack Bolt / Socket Mode] --> Inbox[(PostgreSQL inbox)]
  GitHub[GitHub App / webhooks / polling] --> Inbox
  Inbox --> Memory[Revisions + full-text context]
  CLI[CLI / native VS Code controls] --> Planner[Explicit Gemini compilation]
  Memory --> Planner
  Planner --> Policy[Plan digest + policy + approval]
  Policy --> Jobs[(Durable jobs + fenced leases)]
  Jobs --> Runner[Authenticated outbound runner]
  Runner --> Agent[OpenCode in network-disabled Docker]
  Agent --> Verifier[Fresh snapshot + check containers]
  Verifier --> Outbox[(Transactional outbound queue)]
  Outbox --> Publisher[Credential-separated GitHub publisher]
  Publisher --> GitHub
  Verifier --> Findings[Findings + reproduction + bounded repair]
  Findings --> Planner
```

The initial deployment is a local/team pilot: the service can read registered clones to inspect repository files; the runner independently maps permitted project IDs to local clones. Remote runner connections use HTTPS and outbound authenticated API calls. A remote runner does not make a service-side clone unnecessary for planning in this implementation.

PostgreSQL is authoritative. Full-text retrieval filters tenant/project first. Project membership grants access to that project's selected sources, including its configured private channels. Configure separate projects/audiences for groups that must not share private context. Derived context remains in that audience. PR text uses an administrator-approved, fixed safe summary and verification metadata, never Slack excerpts or the model's private-context objective.

### Execution and isolation

1. The runner validates its local repository mapping, command-profile digest, pinned OpenCode version, and Docker Linux engine.
2. It leases one job per repository with a fencing token, 60-second lease, and 10-second heartbeat.
3. Git object reads export regular files at the approved SHA. Hooks, repository configuration and credential files are excluded from execution setup. Original files remain untouched.
4. Baseline checks execute as UID 1000 in containers with no network, dropped capabilities, read-only root, bounded CPU/memory/PIDs, and only isolated workspace mounts.
5. The OpenCode server uses the pinned SDK adapter. Its session ID is recorded before prompting. An authenticated host-loopback bridge lets the IDE attach to that exact session.
6. The agent has file tools, but no shell, external web tools, MCP integrations or subagent permissions. The administrator's check profile supplies executable argument arrays.
7. OpenCode is paused while the runner freezes the diff. A fresh snapshot receives the patch and runs the approved checks in separate containers. Process exit codes, timeouts, required-check presence, patch scope, possible secrets, and tracked-file mutations are checked independently.
8. The publisher repeats freshness and authorization checks, rebuilds the changed file contents from the frozen patch, writes Git objects to a dedicated `shadowqa/<job-id>` branch, and creates one source-safe PR. Deterministic commit metadata, branch names and PR markers allow retry reconciliation.
9. Full-auto merging checks the actual PR head, latest required results, current default branch, active authorization, and both current/legacy branch rules. Required human review blocks auto-merge. A merged repair is checked again at its merge SHA.

The network-disabled sandbox uses file queues for two narrow transports: local OpenCode HTTP/SSE and Gemini model requests. The guest-side bridge is `infra/bridge.mjs`; the host-side bridge is `src/runner/bridge.ts`. No Gemini key, Slack token, GitHub key, host home directory, SSH agent, or Docker socket is mounted in the agent. Gemini requests return through a leased-job endpoint restricted to the configured model and daily call budget.

Containers are a security boundary; copying a worktree by itself is not. Use dedicated runner machines for code you do not trust. Repository/test code still runs and must be reviewed as part of the execution profile. Docker does not impose a hard disk quota on the host bind mount; see the operating limits below.

## Code map

Every authored code module is listed here. [docs/CODE_REFERENCE.md](docs/CODE_REFERENCE.md) provides a generated declaration/method index with line numbers. [docs/API.md](docs/API.md) documents HTTP contracts; [SETUP.md](SETUP.md) documents configuration and deployment.

| File | Responsibility |
| --- | --- |
| `src/core/contracts.ts` | Zod schemas for projects, profiles, policies, plans, checks, artifacts, IDs and job states; shared TypeScript types. |
| `src/core/config.ts` | Environment defaults and JSON configuration parsing; duplicate repository/channel detection and profile validation. |
| `src/core/security.ts` | Canonical hashing, random capabilities, constant-time signatures, token/control-character redaction, path containment, ACL checks and HTTPS enforcement. |
| `src/db/schema.ts` | Versioned PostgreSQL schema, durable inbox/outbox, sources/revisions, approvals, jobs/events, credentials, full-text index, audit and model usage. |
| `src/db/database.ts` | PostgreSQL pool/transactions, tenant-scoped entity access, authentication, audit, outbound intents and retry backoff. |
| `src/memory/sources.ts` | Delivery deduplication, monotonic source revisions, confirmation, full-text retrieval, deletion/revocation, retention and derived-context invalidation. |
| `src/adapters/slack.ts` | Durable Bolt Socket Mode receiver; ordinary messages, threads, edits/deletes, scoped history/replies pagination, gap records and idempotent status reporting. |
| `src/adapters/github.ts` | GitHub App JWT/installation tokens, scoped REST requests, pagination, ETags/rate backoff, webhook normalization, PR/check hydration and reconciliation. |
| `src/model/gemini.ts` | Bounded structured Gemini calls, schema repair once, sanitized prompt input, content-hash cache, token/call accounting and quota pauses. |
| `src/planner/inspect.ts` | Read-only origin/root validation, commit-bound file enumeration, bounded relevant source/test excerpts and dirty-tree detection. |
| `src/planner/planner.ts` | Explicit context compilation, candidate extraction, citation validation, conflict preservation, immutable plan/snapshot creation and visible failed tasks. |
| `src/policy/engine.ts` | Plan and profile digests, source freshness, dependency/path validation, deterministic risk rules, automatic scope and patch publication gates. |
| `src/scheduler/jobs.ts` | Approval challenges, nonce consumption, idempotent job creation, daily caps, scan dispatch, leases/fencing, transitions, verification completion, quarantine, cancellation and kill switch. |
| `src/qa/findings.ts` | Detector fingerprints, occurrences, classification, reproduction/flaky distinctions and audited time-bounded suppression. |
| `src/qa/repair.ts` | Explicit/standing finding-to-plan flow with administrator authority, cooldowns, repair lineage, duplicate-plan guards and two-attempt escalation. |
| `src/publisher/publisher.ts` | Safe PR bodies, current-authority/base checks, patch reconstruction, Git objects/branch/PR reconciliation, restricted merge and post-merge monitoring. |
| `src/runner/process.ts` | Argument-array subprocess execution, bounded output, timeouts/cancellation, safe host Git invocation and error sanitization. |
| `src/runner/workspace.ts` | Bounded commit snapshots from regular Git objects; excludes secrets/config; initializes isolated comparison repositories. |
| `src/runner/workspace-blob.ts` | Binary-safe Git blob reads, avoiding corruption from text decoding. |
| `src/runner/sandbox.ts` | Docker prerequisite checks, isolation flags, clean OpenCode configuration, independently executed check profiles and process-group removal. |
| `src/runner/bridge.ts` | Authenticated loopback proxy, bounded host/guest file transport and narrow model forwarding. |
| `src/runner/opencode.ts` | Version-pinned SDK adapter, startup contract check, exact session creation, async prompts, progress, completion and abort. |
| `src/runner/runner.ts` | Outbound worker, mapping consent, baseline/patch/check orchestration, heartbeat cancellation, OS-keyring session bindings and retained isolated workspaces. |
| `src/api/identity.ts` | Membership-bound OAuth linking, one-use state, Slack OpenID signature/claims checks, provider-ID uniqueness; no display-name matching. |
| `src/api/server.ts` | Authenticated Fastify API, schema validation, role/project enforcement, webhook raw-body validation, job model gateway and administrative controls. |
| `src/api/worker.ts` | Durable inbox/outbox processing, bounded backoff, lease quarantine, periodic reconciliation/scans, standing repair and retention. |
| `src/cli/client.ts` | API transport, HTTP errors and OS credential storage; explicit environment-token alternative for headless services. |
| `src/cli/ui.ts` | Terminal glyphs, color, safe text rendering, compact tables and complete plan display. |
| `src/cli/watch.ts` | Opt-in saved-file observation, debounce, content snapshots, isolated checks, stale-result detection and IDE diagnostic report. |
| `src/cli/setup.ts` | Guided Slack → GitHub → mode → project connection; live `auth.test`, App JWT and installation listing, clone-origin verification, and `.env`/config merging that preserves unrelated settings. |
| `src/cli/main.ts` | All CLI commands, setup/bootstrap/login, service lifecycle, review/approval UX, runner mapping, exact session attachment and interactive command center. |
| `vscode-extension/src/extension.ts` | Native tree/commands, integrated CLI terminals, plan review, exact session/diff controls and saved-file diagnostics. No webview. |
| `infra/bridge.mjs` | Guest OpenCode/model file transport and lifecycle, running inside the no-network container. |
| `scripts/fixture.ts` | Creates disposable committed regression repositories without modifying a real project. |
| `scripts/demo.ts` | Offline, explicitly scripted model/patch demonstration with actual failing/passing processes and durable state assertions. |
| `scripts/sandbox-smoke.ts` | Live Docker/OpenCode contract checks: session creation, authenticated loopback, isolation, credential separation and cancellation. |
| `scripts/code-reference.ts` | Generates the declaration/method reference from the TypeScript AST. |
| `scripts/individual-demo.ts` | End-to-end individual check in a disposable home: pairing, capture, extraction, planning, isolation, patch review, real test processes, branch commit and findings. |
| `fixtures/duplicate-submit/src/submit.js` | Deliberately broken in-flight submission guard used by both demos. |
| `fixtures/duplicate-submit/tests/submit.test.js` | Regression test and independent later-submission behavior check. |

### Individual edition

| File | Responsibility |
| --- | --- |
| `individual/core/contracts.ts` | Zod schemas for captured messages, conversations, projects, extracted items, plans and tasks; the `Backend` and `Mode` enums. |
| `individual/core/dedupe.ts` | Turn identity (site id, else position), revisions, streaming continuation, and the rule that an unseen turn is not a deleted one. |
| `individual/core/store.ts` | Individual tenant and entity kinds over the shared schema; capture, pause/untrack/forget, project-scoped retrieval, item revision. |
| `individual/core/extract.ts` | The extraction contract that keeps a suggestion distinct from a decision; citation validation and user-edit protection. |
| `individual/core/plan.ts` | Repository inspection at HEAD without touching the working tree, plan digest, path and citation gates, freshness checks. |
| `individual/core/backends.ts` | OpenCode, Claude Code and Codex adapters: detection, argument arrays, event parsing, honest failure reporting, attach commands. |
| `individual/core/executable.ts` | Resolves a CLI name to something spawnable without a shell, following the Windows npm shim to its real target. |
| `individual/core/execute.ts` | Agent prompt, isolated workspace from Git objects, check execution, frozen diff, patch review gates, verification in a second fresh copy. |
| `individual/core/publish.ts` | Local branch creation through Git plumbing against a temporary index; GitHub status and the source-safe PR body. |
| `individual/core/runner.ts` | One task per project, backend availability, plan freshness, agent-claim-independent verdict, event log. |
| `individual/core/qa.ts` | Saved-file observation, scans, finding recording over the shared QA module, and the repair bounds. |
| `individual/core/db.ts` | Embedded PostgreSQL (PGlite) by default; a configured `DATABASE_URL` instead. |
| `individual/service/server.ts` | Authenticated loopback API for the CLI, the companion and the paired extension. |
| `individual/service/auth.ts` | Owner token, endpoint file, one-use pairing codes and extension credentials. |
| `individual/service/observers.ts` | Opt-in subscriptions to local coding sessions and the sweep that captures them. |
| `individual/companion/src/native-messaging.ts` | Chrome's length-prefixed stdio framing, with both size limits enforced. |
| `individual/companion/src/host.ts` | The native messaging host: a fixed set of named requests forwarded to the service, and nothing else. |
| `individual/companion/src/install.ts` | Native messaging host manifest and its registration for Chrome, Edge and Chromium. |
| `individual/companion/src/adapters/claude-code.ts` | Claude Code transcript location, parsing, and hook install/removal. |
| `individual/companion/src/adapters/codex.ts` | Codex rollout location and parsing. |
| `individual/extension/manifest.json` | Manifest V3: `storage`, `sidePanel`, `nativeMessaging` and two host permissions. |
| `individual/extension/src/content/adapters/chatgpt.ts` | Ordered ChatGPT selectors, streaming detection, and a warning instead of a false empty thread. |
| `individual/extension/src/content/adapters/claude.ts` | Claude selectors, document-order turn sequencing across both roles. |
| `individual/extension/src/content/index.ts` | Mutation and history observation, change detection, and capture only while tracked. |
| `individual/extension/src/background/service-worker.ts` | The only caller of native messaging; tracking state, error translation and panel state. |
| `individual/extension/src/sidepanel/` | The black-and-white side panel. |
| `individual/cli/main.ts`, `setup.ts`, `ui.ts` | `shadowqa-individual` — the main interface. |

Supporting files: `package.json` and the lockfile pin application dependencies and commands; `tsconfig.json` and the extension config compile both targets; `vitest.config.ts` configures tests; `compose.yaml` provisions loopback-only PostgreSQL; `infra/sandbox.Dockerfile` builds the reviewed Node/OpenCode image; `.env.example` and `shadowqa.config.example.json` document every primary setting; `infra/slack-manifest.json` supplies Slack app permissions/events; `vscode-extension/package.json` declares IDE contributions; `vscode-extension/media/shadow.svg` is its code-native icon. `.gitignore`, `.dockerignore`, and `.vscodeignore` prevent secrets/dependencies/build output from leaking into inappropriate artifacts.

### Database records

Structured relational tables handle contention-sensitive data: `source_events`, `source_documents`, `source_revisions`, `credentials`, `jobs`, `job_events`, `approvals`, `outbox`, `audit_log`, and `model_usage`. Their keys include tenant identity; jobs have a partial unique index allowing only one live execution per project/repository.

The `entities` table stores typed JSON records under `(tenant, kind, id)` with a project index. Kinds include `project`, `task`, `plan`, `snapshot`, `knowledge`, `model-cache`, `finding`, `occurrence`, `runner`, `artifact`, `publication`, `pr`, `pr-evidence`, `connection`, `cursor`, `schedule`, `policy-grant`, `delivery`, `identity`, `oauth`, and `control`. This keeps the proposed modular architecture in one database and one service, with no vector database or microservice dependency. Embeddings and optional MCP are intentionally not part of this release.

## Launch films

`video/` is a [Remotion](https://www.remotion.dev) project holding one film per edition. Every code
element on screen is lifted out of this repository at build time by `video/scripts/extract.mjs`:
anchors are matched against the real files, and a moved anchor fails the build instead of letting a
film drift away from the product. The accent colour is read from `src/cli/ui.ts`, the job states from
`src/core/contracts.ts`, the isolation flags from `src/runner/sandbox.ts`, and the patch shown is the
one `npm run demo` and `scripts/individual-demo.ts` actually verify.

```powershell
cd video
npm ci
npm run render                 # both films → video/out/*.mp4
npm run still ShadowQA-Business    # one frame per scene, for layout review
npm run studio                 # interactive editor
```

| Composition | Output | Length |
| --- | --- | --- |
| `ShadowQA-Business` | `video/out/shadowqa-business.mp4` | 2780 frames · 1920×1080 · 30 fps |
| `ShadowQA-Individual` | `video/out/shadowqa-individual.mp4` | 2845 frames · 1920×1080 · 30 fps |

## Testing and development

```powershell
npm run check
npm run build
npm run demo
npx tsx scripts/individual-demo.ts
npm run sandbox:build
npm run test:sandbox
npm run package:extension
npm audit
```

| Test file | Coverage |
| --- | --- |
| `tests/helpers.ts` | Isolated PGlite PostgreSQL adapter, tenants, principals, projects, plans and fixture patch. |
| `tests/security.test.ts` | Webhook signatures/replay, path/role/transport boundaries, sanitization, plan immutability, protected patches and automatic policy. |
| `tests/database.test.ts` | Source dedupe/ordering/removal, tenant isolation, one-use approvals, stale evidence, lease fencing/quarantine, failed-process handling, atomic publication intent and kill switch. |
| `tests/api.test.ts` | API authentication/roles, durable signed intake, retry dedupe, missing objects and schema validation. |
| `tests/model-planner.test.ts` | Structured-output repair/cache, redaction, provider quota, atomic call budget, fabricated citations and unresolved conflicts. |
| `tests/adapters-qa.test.ts` | Slack threads/edits/deletes/scope, PR head changes, bot/fork treatment, installation revocation, reproduced/flaky/environment findings and occurrence deduplication. |
| `tests/individual-capture.test.ts` | Turn identity, duplicate capture, streaming completion, conversation switching, partial coverage, project isolation, pausing and deletion of derived context. |
| `tests/individual-adapters.test.ts` | ChatGPT and Claude adapters against page fixtures: roles, order, site ids, stripped controls, streaming and the unrecognised-page warning. |
| `tests/individual-companion.test.ts` | Native-messaging framing and limits, pairing success/expiry/reuse/revocation, and the Claude Code and Codex session parsers. |
| `tests/individual-execution.test.ts` | Uncommitted-work preservation, verification in a fresh copy, every patch gate, the local branch commit, plan freshness, backend availability and failure reporting. |

Tests use the same PostgreSQL schema and SQL as production, through an embedded PostgreSQL engine. They mock external network APIs; they do not prove live account permissions or model quality. The real sandbox smoke is separate because it needs Docker and the built image.

Two documents record the state of the work honestly rather than optimistically:

- [docs/VALIDATION.md](docs/VALIDATION.md) — exactly which commands were run, what they proved, and what remains unverified and why.
- [docs/AUDIT.md](docs/AUDIT.md) — the defects found across both editions and both films, how each was reproduced, and the trade-offs that were accepted rather than hidden.

## Operating limits

- One Slack workspace per configured service; explicitly mapped repositories/channels. No DMs, attachments, keystrokes, or unsaved editor buffers.
- Planning needs a service-accessible registered clone and current `origin/<defaultBranch>` reference. Runners use their own explicit mappings. Fetch remote commits before scanning a SHA missing from a clone.
- Existing TypeScript/JavaScript check profiles are the supported first path. Dependencies must be baked into a reviewed image or available through an explicitly configured offline install command; runtime containers have no network. There is no automatic online package installation.
- Snapshot cap: 50 MB total, 2 MB per file for committed execution; saved-file scans use 30 MB/1 MB caps. Source retrieval and model inputs are bounded. Host bind mounts do not have hard filesystem quotas; use a dedicated, quota-limited runner volume where that guarantee is needed.
- Current file scopes reject binary modifications, renames, deletions, symlinks, submodules and nonstandard quoted paths. These fail visibly; they are not silently approximated.
- OpenCode coding is Gemini-backed. Free quota is provider-controlled. Use an unbilled Gemini project for the free tier; ShadowQA cannot make requests free if you supply a billed key. It never enables billing, buys credits, or switches providers.
- Installation/repository revocations and source deletions invalidate retrievable context. Source-history gaps are visible. Polling cannot guarantee recovery of a deletion that occurred while disconnected and was never delivered.
- Raw completed event payloads are removed immediately. Source content defaults to 30 days and server artifacts/logs to 90 days. Isolated runner workspaces and external backups need their own retention and encrypted-storage policy.
- Local diagnostics become stale when saved content changes. Unverified model suspicions never authorize automatic repair. Environment/flaky failures are distinct from reproduced failures and demonstrated regressions.
- Required human review, stale heads, ambiguous authority, missing permissions, missing check evidence or unavailable branch rules stop automatic merging. The publisher never modifies a human-owned PR branch.
- Provider credentials, Slack/GitHub installations, production backups, an HTTPS endpoint when using webhooks, and any live deployment belong to your environment and must be configured in setup. This repository does not provision paid hosting or send messages during installation.

### Individual edition limits

- Browser capture is only what a tracked page has rendered. Turns never scrolled to are not
  captured, a conversation never opened is not readable at all, and the panel and the store both
  label this `partial`. A turn that is absent from the DOM is never treated as deleted.
- The ChatGPT and Claude adapters are tested against fixtures. **Live-site compatibility is
  unverified**; the selectors are ordered and degrade to a visible warning rather than an empty
  conversation.
- Only local Claude Code transcripts and Codex rollouts you subscribe to are read. Cloud threads
  that were never written to the machine, native desktop apps and attachments are not visible, and
  ShadowQA reports that instead of implying coverage.
- Execution is workspace isolation, not a sandbox: the agent runs in a copy exported from Git
  objects, under your own coding CLI's permissions. The team edition's network-disabled Docker is
  not part of this edition.
- Choosing Claude Code or Codex uses your own subscription for the coding work. Planning and
  extraction stay on Gemini, and refuse with `MODEL_SETUP` when no key is configured rather than
  showing invented output.
- Nothing merges on its own. The verified result is a local `shadowqa/<task>` branch; a pull request
  needs a GitHub remote and `GITHUB_TOKEN`.
- The scheduled sweep and the saved-file watcher only run while `shadowqa-individual serve` is up.
  Tasks wait rather than fail when the chosen backend is unavailable.
- The embedded database is single-process. Commands that need it refuse while the service holds it
  and name the command to use instead.

## Vendor references

Adapter contracts were checked against [OpenCode server](https://opencode.ai/docs/server/), [OpenCode CLI](https://opencode.ai/docs/cli/), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Slack Socket Mode](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/), [Slack OpenID](https://docs.slack.dev/authentication/sign-in-with-slack/), [GitHub webhook signatures](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), and [GitHub pull-request APIs](https://docs.github.com/en/rest/pulls/pulls).

The individual edition was checked against [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Chrome side panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), and the `claude --help`, `codex exec --help` and `opencode run --help` output of the versions installed during development — and, for the two session formats, against the transcript and rollout files those CLIs had actually written on disk.

Provider availability, quotas, permissions and terms remain authoritative.
