# ShadowQA — Demonstration guide

## Setup
* Backend `.env`: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, `SHADOWQA_BRIDGE_TOKEN`, `SHADOWQA_AUTONOMY=auto_low`, `SHADOWQA_DEV_SERVER_URL=http://localhost:3000`, optional `GITHUB_REPO=owner/repo` + `GITHUB_TOKEN`.
* Frontend `.env`: `REACT_APP_SHADOWQA_TOKEN` (same token), `DISABLE_EMERGENT_OVERLAY=true` (ShadowQA owns runtime-error UX).
* Demo account: `demo@lumen.supply` / `lumen-demo`.
* Reset between runs: `scripts/reset_demo.sh` or **Reset demo bugs** in the Command Center (`/shadowqa`) — restores all four bugs from `scripts/demo_bugs/`, clears ShadowQA memory, deletes `shadowqa/*` branches.

## The four intentional bugs
| Where | Symptom | Root cause | Expected fix |
|---|---|---|---|
| Checkout → **Pay** | `POST /api/demo/payment` → 422, then `TypeError: Cannot read properties of undefined (reading 'toUpperCase')` in `pages/Checkout.jsx` | `api/payments.js` sends `total`, the gateway contract requires `amount` | 1-line key rename in `payments.js` (cause ≠ symptom file) |
| Cart → promo code `lumen20` → **Apply** | `TypeError: Cannot read properties of undefined (reading 'rate')` in `lib/promo.js` | lookup is case-sensitive although codes are documented as case-insensitive | normalise the key with `.toUpperCase()` |
| Orders → open **LUM-8842** → **Track shipment** | `GET /api/demo/orders/LUM-8842/tracking` → **200**, then `TypeError: Cannot read properties of undefined (reading 'events')` in `pages/OrderDetail.jsx` | `api/store.js` still unwraps `data.tracking` from a response the API stopped wrapping (v2 contract) | drop the `.then((data) => data.tracking)` in `store.js` (a *successful* request that still breaks the UI — the response-body sample ShadowQA captured shows the drift) |
| **Help** (after a nav click) → *Your tickets* | `GET /api/demo/support/tickets` → **500**, **no JavaScript exception** — the page degrades gracefully ("We couldn't load your tickets") | `backend/demo_store/router.py` returns raw Mongo documents (`ObjectId` is not JSON-serialisable) | add the `{"_id": 0}` projection — a **backend** patch: the server observer joins the 500 to the exception + `list_support_tickets()` at `router.py:223`, `py_compile` + `pyflakes` validation, the bridge restarts itself and resumes the pipeline on boot, then the replay proves the list renders (~28 s, RISK LOW, autonomous) |

Nothing about these bugs is known to ShadowQA — the diagnosis is produced from live context + workspace source.

## Command Center (`/shadowqa`)
Incident history (click a row → inspector), the OBSERVE → VERIFY loop with per-stage latency, a live "why not Claude Code / Cursor / Copilot" comparison filled with the latest incident's data, application health + **Run QA sweep**, in-app context signals, agent telemetry & audit trail, application memory, demo scenario state + **Reset demo bugs**, and the autonomy policy switch (Approve all / Auto-apply LOW).

## Flagship script (≈ 40 s end-to-end)
1. Sign in → **Products** → *Add* the Kodiak knife → **Cart** → *Proceed to checkout*.
2. Fill address/city/postal, card `4242 4242 4242 4242`, `12/28`, `123` → **Pay**.
3. Within a second the overlay appears bottom-right: *Checkout failed · Click 'Pay $303.00' → POST /api/demo/payment → HTTP 422 → TypeError · Source demo/pages/Checkout.jsx:31 · Diagnosing…*
4. ~15–20 s later: root cause in `demo/api/payments.js`, confidence ~97 %, **Risk LOW** → applied autonomously (checkpoint created), validation ticks: Babel ✓ ESLint ✓ Jest ✓.
5. The app hot-reloads; ShadowQA replays your exact interaction: Open /checkout ✓ Enter street address ✓ … Click 'Pay' ✓ POST /api/demo/payment ✓ Response 200 ✓ UI reached expected state ✓ No runtime errors ✓ → **🟢 FIX VERIFIED**, and the order confirmation is on screen.
6. Press **Undo** to restore the bug, **Commit to branch** for a plumbing-built `shadowqa/fix-<id>` branch (or a real PR when `GITHUB_REPO` is set), **View Diff** for the inspector.

## Approval path & QA mode
* Open the inspector (tiny dot bottom-right or `Ctrl+Shift+Q`) → **Health → Run QA sweep**. ShadowQA drives the real browser through the declared flows plus learned regression flows and reports application health (✓/✗ per flow). Failures come with reproducible sequences; QA-discovered incidents are **queued for review**: *Investigate → View Fix → Apply Fix*.
* MEDIUM/HIGH-risk patches always require approval; the diff, risk factors and confidence are shown first.

## Inspector tabs
Timeline · Graph · Network · Source (source-mapped code) · Diagnosis · Patch · Validation · Replay · Health · Memory · Agent (latency telemetry, LLM calls, audit trail).

## Chrome extension
`extension/` is an MV3 extension that injects the same SDK (`yarn build:sdk` regenerates `extension/shadowqa.js`) into any localhost app; configure bridge URL/token in its options page.
