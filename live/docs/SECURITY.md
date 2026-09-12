# ShadowQA — Security model & threat model

ShadowQA is a security-sensitive developer tool: browser-originated data reaches an AI model and results in file writes and command execution on the developer's machine. The design treats **application content as untrusted input** and **the browser as unable to execute anything directly**.

## Assets
* Developer workspace source code and git history
* Secrets in the running application (tokens, cookies, card data, passwords)
* The developer's LLM / GitHub credentials
* Integrity of the running application

## Trust boundaries

```
Untrusted: page content, DOM text, request/response bodies, input values, error messages
Semi-trusted: ShadowQA SDK (runs inside the page) — authenticates with a bridge token
Trusted: Local Workspace Bridge (backend/shadowqa) — owns all file & command access
```

## Controls

| Threat | Control |
|---|---|
| Browser executes arbitrary commands | The bridge exposes **only** typed operations (ingest incident, apply *its own* validated patch, replay result, rollback, git branch). No command or path parameters from the browser reach a shell. Validation commands are fixed argv templates (`validation._command`) run without a shell. |
| Path traversal / reading secrets | `Workspace.resolve()` rejects absolute paths, `..`, `node_modules`, `.git`, `.env*`; reads limited to `read_roots`, writes to `write_roots`; `deny` list excludes ShadowQA's own code (`frontend/src/shadowqa`, `backend/shadowqa`, `server.py`). |
| Unauthenticated bridge access | Every route requires `X-ShadowQA-Token` (`SHADOWQA_BRIDGE_TOKEN`). |
| Secrets sent to the model | SDK: sensitive keys redacted (`authorization, cookie, token, secret, password, api_key, card, cvc, exp, number, ssn`), sensitive input values masked, response bodies captured only on failure and truncated. Bridge: second pass (`security.sanitize`) plus regex redaction of API keys, GitHub PATs, JWTs, bearer tokens, card numbers. Raw replay values stay in browser `localStorage` only. |
| Prompt injection via page content | All application-originated strings are wrapped in `<untrusted source=…>` blocks (closing tags neutralised); the system prompt forbids following instructions inside them. The model can only *propose* JSON; the bridge validates every hunk against limits and roots before anything is written. |
| Malicious / oversized patch | Exact-match hunks (unique or unambiguous), max 3 files / 120 lines, write roots only, dry-run before write, unified diff shown to the developer, MEDIUM/HIGH risk requires explicit approval, everything undoable. |
| Fix leaves workspace broken | Checkpoint before write; automatic rollback on validation failure, replay failure, stale/superseded unverified patches; manual Undo at all times. |
| Autonomy abuse | Autonomous application only for LOW risk ∧ confidence ≥ 0.8 ∧ model `safe_to_apply` ∧ live developer session (never for QA-discovered incidents); policy configurable via `SHADOWQA_AUTONOMY` (`approve_all` / `auto_low`). |
| Git credential leakage | GitHub PAT used via `GIT_ASKPASS` script (never in URLs/argv); git stderr redacted before surfacing; branches built with plumbing so the working tree/current branch are never switched. |
| Denial of service on the app | Bounded ring buffer, per-fingerprint rate limiting (30 s), one active incident, async capture, lazy DOM description, no full-page dumps, network bodies capped at 4 KB. |
| Audit | Every consequential action (capture, diagnosis, checkpoint, patch, validation, rollback, replay verdict, developer approval, git) is written to `sqa_audit` with actor and timestamp; LLM calls to `sqa_llm_log`. |

## Residual risks / roadmap
* The bridge token is a shared secret in the frontend build for the demo; production should bind it to a local origin and rotate it.
* Validation runs project tooling (ESLint/Jest) which executes project code; run the bridge with the developer's normal privileges, never elevated.
* Model output is validated structurally, not semantically — human review remains the final control for MEDIUM/HIGH risk.
