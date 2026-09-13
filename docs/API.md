# ShadowQA HTTP API

Default: `http://127.0.0.1:4380`. Remote clients require HTTPS. All non-webhook/non-OAuth routes except `/health` require `Authorization: Bearer <membership-or-device-token>`. JSON requests are schema validated and bounded to 3 MB. Error responses are `{ "code": "...", "message": "..." }`. Credentials resolve to a tenant, actor, role and explicit project IDs; request bodies cannot select another tenant.

## User and administrator routes

| Method and path | Request / result |
| --- | --- |
| `GET /health` | Database health and application version. Public; contains no context. |
| `GET /me` | Current authenticated principal. |
| `GET /status` | Accessible project modes, source/job counts, cursors, runner timestamps, kill switch and model usage. |
| `GET /projects` | Accessible project configuration; local service paths are redacted for non-admins. |
| `PUT /projects/:id` | Administrator: full `Project` schema. Validates unique mappings, increments policy version and invalidates old approvals. |
| `POST /projects/:id/mode` | Administrator: `{mode: "observe" | "approval" | "auto-fix" | "full-auto"}`. |
| `GET /projects/:id/context?q=...` | Access-filtered current source records, optionally full-text/exact-URL filtered. |
| `POST /projects/:id/compile` | Developer/admin: `{objective?: string, query?: string}`. Returns the immutable plan. Gemini/inspection failures remain visible on a task. |
| `POST /projects/:id/scan` | Queue approved checks for the service clone's current configured base. |
| `POST /projects/:id/sync` | Reconcile selected GitHub sources and bounded Slack history. |
| `POST /sources/:id/confirm` | Confirm a current source revision under the authenticated actor. |
| `GET /tasks`, `GET /tasks/:id` | Task status, objective and linked plan/failure. |
| `POST /tasks/:id/plan` | Compile a fresh plan for the task objective; never reuse old approval. |
| `GET /plans`, `GET /plans/:id` | Plans visible to the principal. |
| `POST /plans/:id/challenge` | Returns `{id, nonce, expiresAt, digest, plan}`. Challenge expires after 10 minutes and belongs to one actor. |
| `POST /plans/:id/approvals` | `{approvalId, nonce, digest, decision: "approve" | "reject"}`. Atomically consumes the challenge and queues at most one execution. |
| `GET /jobs`, `GET /jobs/:id` | Job state, lease/session metadata and ordered events. |
| `GET /jobs/:id/artifacts` | Authorized diff/check/log artifacts. |
| `POST /jobs/:id/cancel` | Cancel and increment fencing token. The runner aborts when its next heartbeat fails. |
| `GET /findings`, `GET /findings/:id` | Fingerprints, occurrences, classification and repair lineage. |
| `POST /findings/:id/repair` | Compile a repair with cooldown, attempts and authority checks. |
| `POST /findings/:id/suppress` | `{reason: string, hours: 1..720}`. Audited temporary suppression. |
| `POST /control/kill` | Administrator: `{enabled: boolean}`. Fences active/queued repairs. Resume does not resurrect cancelled work. |
| `POST /members` | Administrator: `{id, role: "admin" | "developer" | "viewer", projects: string[]}`; one-time raw token returned. |
| `POST /members/:id/revoke` | Administrator: revoke credentials and associated execution authority. Also applies to runner IDs. |
| `GET /audit` | Administrator: last 200 audit metadata records. |
| `GET /queue` | Administrator: pending/failed inbox and outbound actions. |
| `POST /queue/retry` | Administrator: retry failed durable inbox/outbox records. |
| `POST /retention` | Administrator: apply configured initial content/artifact retention. |
| `POST /identity/:provider` | Begin membership-bound `github` or `slack` identity linking. Returns authorization URL. |
| `GET /oauth/github/callback` | One-use OAuth callback; plain-text completion. |
| `GET` or `POST /oauth/slack/callback` | One-use OpenID callback; verifies signature, nonce, tenant workspace and claims; plain-text completion. |

## Runner routes

Administrators create devices with `POST /runners/register`, body `{name, projects}`. The response `{id, token}` is a one-time device capability. All other runner endpoints require that device's token. A user membership cannot lease a job, and a device cannot retrieve arbitrary source context.

| Method and path | Request / behavior |
| --- | --- |
| `POST /runners/heartbeat` | `{capabilities: Record<string,string>, projects: string[]}`. Server authority, not this body, determines actual project access. |
| `POST /jobs/lease` | `{}`. Returns no job or `{job, project, plan}`; server clone paths are excluded. One live job per repository. |
| `POST /jobs/:id/heartbeat` | `{fence}`. Extends the live lease by 60 seconds if identity, project, fence and kill switch remain valid. |
| `POST /jobs/:id/events` | `{fence, event: {state?, message?, session?}}`. Validates transitions and assigns monotonic sequence. |
| `POST /jobs/:id/artifacts` | `{fence, artifact: {kind: "diff" | "log" | "report", content}}`. Sanitized, bounded artifact. |
| `POST /jobs/:id/findings` | `{fence, sha, checks, baseline}`. Exact job SHA required; scan repetitions distinguish reproducible and flaky failures. |
| `POST /jobs/:id/complete` | `{fence, result: {diff, checks, baseline, baseSha, attempts}}`. Only from `verifying`; all required checks must pass, then patch policy gates run and an outbound intent is committed atomically. |
| `POST /jobs/:id/model` | `{fence, path, body}`. Live repair only; exact configured Gemini model/method allowlist, inference consent, quota reserve, pre-inference sanitization. No arbitrary upstream URL or provider. |

`CheckResult` is `{id, exitCode, output, durationMs, timedOut}`. Missing required checks, nonzero exits or timeouts fail verification regardless of the agent's messages. The runner is a trusted device for reporting process evidence; it does not receive publisher credentials.

Job states are `queued → leased → preparing → running → verifying → ready_to_publish → pr_open → monitoring → resolved`, with `failed`, `blocked`, `quota_paused`, `cancelled`, `superseded`, and `quarantined` stops. Scans move from `preparing` to `verifying`. A failed first verification can return to `running` once. Expired leases become quarantined and are not automatically reassigned to another executor.

## Inbound adapters

`POST /webhooks/github` verifies `X-Hub-Signature-256` against the raw bytes, requires `X-GitHub-Delivery`, and persists before responding. Processing is asynchronous and delivery IDs deduplicate retries. Repository/installation mappings are checked before normalization.

`POST /webhooks/slack` verifies Slack's timestamped HMAC and five-minute replay window. URL-verification challenges are answered only after signature validation. Socket Mode is an alternative transport and uses the durable Bolt receiver. Both feed the same inbox. HTTP webhook routes are the only unauthenticated intake surface; provider signatures are mandatory.

## Concurrency and recovery

Approval consumption, job transitions, artifact metadata and outbound intent writes use transactions. Workers claim rows with `FOR UPDATE SKIP LOCKED`. Repository execution has a partial unique index. Every executor write requires the current fence and lease. Outbound actions use stable action keys and bounded retries; failures appear in `/queue`.

Publication reconciles its stable branch/PR marker after transport uncertainty. External actions are at-least-once; APIs and markers prevent ordinary duplicate publication, while divergence becomes a visible block. Never assume an HTTP timeout means a remote action did not happen.

---

# ShadowQA Individual HTTP API

Default: `http://127.0.0.1:4390`, loopback only. Every route except `/health` and `/backends`
requires `Authorization: Bearer <token>`. There are exactly two kinds of token:

| Token | Held by | May |
| --- | --- | --- |
| **owner** | the desktop app and the companion | everything |
| **extension** | one paired browser extension | read status/projects/conversations, capture, pause, untrack, delete a conversation's context, read items/plans/tasks/findings |

`requireOwner` rejects an extension token on every route that changes a project, approves a plan,
cancels a task, opens a pull request, scans, repairs, starts a watcher, mints a pairing code or
revokes clients. The extension never receives the owner token, and the companion never exposes an
arbitrary-URL fetch to it: it forwards a fixed set of named requests and nothing else.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Product, database engine, model name and whether a model is configured. No context. |
| `GET /backends` | OpenCode / Claude Code / Codex availability, versions and the reason when unavailable. |
| `GET /status` | Projects, tracked conversations, coding-session observers, tasks and open findings. |
| `GET /projects`, `POST /projects`, `PATCH /projects/:id` | Project configuration. A mode, backend or check change bumps the policy version and supersedes plans awaiting approval. |
| `POST /capture` | `CaptureBatch`. Deduplicates by turn identity, completes a streamed reply in place, and refuses while the conversation is paused. |
| `GET /conversations` | Tracked conversations with coverage, counts, last sync and last error. |
| `POST /conversations/:id/pause`, `/untrack`, `POST /conversations/:id/error` | Tracking state and error reporting from the extension. |
| `DELETE /conversations/:id` | Deletes the stored text **and** every extracted item derived from it. |
| `GET /projects/:id/context?q=...` | Captured turns, each flagged with whether the site supplied a real timestamp. |
| `POST /projects/:id/extract` | Requires a configured model. Returns items with their citations and the items it dropped for citing nothing real. |
| `GET /projects/:id/items`, `PATCH /items/:id` | Read and correct extracted items. A corrected item is marked and never overwritten by a later extraction. |
| `POST /projects/:id/plan` | Repository-grounded plan. Fails visibly on a path outside scope, a protected path, an invented citation or an invented inspected file. |
| `GET /plans`, `GET /plans/:id` | Plans; the single-plan route includes a freshness verdict and its reason. |
| `POST /plans/:id/approve` | Owner only. `{digest?, decision?: "approve" \| "reject", backend?}`. A mismatched digest or a stale plan is refused; approval queues exactly one task. |
| `GET /tasks`, `GET /tasks/:id` | Task state, the agent session reference, the ordered event log, checks and the frozen diff. |
| `POST /tasks/:id/cancel` | Owner only. Aborts a running backend, or marks a queued task cancelled. |
| `POST /tasks/:id/pull-request` | Owner only, verified tasks only. Requires a GitHub remote and `GITHUB_TOKEN`. |
| `GET /findings`, `POST /projects/:id/scan`, `POST /findings/:id/repair` | Fingerprinted findings, a scan of a clean copy of HEAD, and a bounded repair plan. |
| `GET /watchers`, `POST /projects/:id/watch` | Saved-file watching. It runs inside the service because the embedded database is single-process. |
| `GET /observers`, `GET /observers/sessions`, `POST /observers/subscribe`, `/unsubscribe`, `/sweep` | Local Claude Code and Codex sessions, and the opt-in subscriptions that capture them. |
| `POST /pair/start` | Owner only. Mints a one-use, ten-minute pairing code. |
| `POST /pair/redeem` | Deliberately unauthenticated: the short-lived code the user read from the desktop app's Context tab is the credential. Returns the extension token. |
| `POST /pair/revoke` | Owner only. Revokes every paired extension. |

Task states are `queued → preparing → running → verifying → ready`, with `waiting_for_runner`
(the chosen backend is not installed or not signed in), `needs_review` (the diff is kept but the
checks did not pass), `cancelled` and `failed`. A backend that exits zero is not treated as
success: OpenCode and Codex report failures as events, and those events decide.

## Native messaging

The companion speaks Chrome's stdio protocol: a 32-bit little-endian length prefix, then UTF-8
JSON. Replies over 1 MB and requests over 64 MB are refused rather than truncated. The background
service worker holds one `connectNative` port and multiplexes requests over it by id, so the panel
does not start a host process per poll.
