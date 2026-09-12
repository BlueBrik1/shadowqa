# Audit — both editions and both films

A pass over ShadowQA Team, ShadowQA Individual and the two launch films, looking for defects rather
than for confirmation. Everything listed under **Fixed** was reproduced before it was changed and
re-checked afterwards. Everything under **Accepted** is a real trade-off that is now written down
rather than quietly carried.

Scope: `src/`, `individual/`, `video/`, the two rendered films, and the documents that describe
them. Baseline: `npm run typecheck` clean under strict unused checks, `npm test` 130 passing in ≈25 s, `npm run demo` and
`scripts/individual-demo.ts` both passing, both films rendering.

---

## Fixed

### Blocking on Windows

**1. No backend could be launched, and no `npm` check could run.**
Node refuses to spawn a `.cmd` file when `shell` is false (`EINVAL`), and ShadowQA never enables a
shell — every command is an argument array so nothing a model or a config file produces can be
re-parsed as shell syntax. On Windows, `claude`, `codex`, `opencode`, `npm` and `npx` are all
`.cmd` shims. Detection therefore reported every backend as *not installed*, and a project whose
check was `npm test` would have failed with a spawn error rather than a test result.

Found by running the Claude Code backend for real, not by reading the code.

Fixed in `individual/core/executable.ts`: a CLI name resolves to a native executable on `PATH`, or
the real target the npm shim launches — following it to the `.exe`, or to the `.js` plus
`process.execPath`. Cached, with an environment override per tool. Used by backend detection,
backend execution and check execution. Covered by
`tests/individual-execution.test.ts` → *an npm shim resolves to the real target*.

### Correctness

**2. A failed agent session was reported as success.**
OpenCode and Codex both exit `0` on failures they report as events. The probe run that exposed this
produced `ok: true` with the file unchanged and an `invalid_api_key` error sitting in the log.

Fixed: both adapters parse their event streams, `ok` now requires the absence of an error event,
and `RunResult.error` carries the upstream message to the task event log. `opencodeError` and
`codexError` unwrap the two different nesting shapes. Covered by
`tests/individual-execution.test.ts` → *backend failure reporting*.

**3. The first changed path in a verification was corrupted.**
`git status --porcelain` output was `.trim()`ed before being split, which removed the leading space
of an unstaged entry and shifted the path by one character — so `src/submit.js` became
`rc/submit.js` and was then flagged as an unexpected change outside the plan.

Found by `tests/individual-execution.test.ts` → *checks run against a fresh copy*.
Fixed by splitting before trimming and parsing the two status characters explicitly.

**4. Claude turns could come back in the wrong order.**
Ordering relied on `Element.compareDocumentPosition`, which is not reliably implemented outside a
browser and silently returned `0`, leaving the array in role-grouped order: every user turn, then
every assistant turn.

Found by `tests/individual-adapters.test.ts` → *orders turns by document position*.
Fixed by running one query over the union of both role selectors; `querySelectorAll` returns
document order by specification, so no comparator is needed.

**5. `shadowqa setup --step slack` crashed on a fresh install.**
Writing configuration parsed the whole `Project` schema even when only one step had run, so a user
repeating a single step saw a Zod error instead of guidance. An empty token also produced a
`TypeError` from `.startsWith` rather than a readable message.

Fixed: `missingProjectSteps` reports which steps still have to run, the environment is written
regardless, and empty tokens are refused with a sentence. Covered by `tests/setup.test.ts`.

**6. A degraded Slack connection lost its provider.**
`shadowqa serve` recorded `{state, error}` without `provider`, and `/status` returns connections as
a flat list — so `shadowqa status` showed `—` in the provider column for exactly the case a user
most needs to identify. Fixed at the write, and the reader now tolerates a missing provider.

**7. `docs/CODE_REFERENCE.md` did not exist.**
The README linked it. `npm run docs:code` now also walks `individual/**`, and the file is generated.

### Resource use

**8. A missing backend became a busy loop.**
`waiting_for_runner` tasks were re-examined every two seconds, spawning a detection subprocess each
time, forever. Now: a 30-second backoff per task, and the waiting state is written once rather than
on every pass.

**9. The side panel would have started a native host process every few seconds.**
`chrome.runtime.sendNativeMessage` launches a fresh host process per call; the panel polls every
five seconds and each poll made up to three calls. Replaced with a single
`chrome.runtime.connectNative` port, multiplexed by request id, with a 30-second per-request
timeout and clean teardown on disconnect. The host already accepted multiple frames on one stream.

**10. Scan copies were never deleted.**
`POST /projects/:id/scan` exported a fresh copy of HEAD to run checks and left it behind. Now
discarded in a `finally`.

### Concurrency

**11. Two processes could open the single-process database.**
The individual edition defaults to an embedded PostgreSQL engine, which one process owns.
`shadowqa-individual watch` and `setup` opened it directly, so running either while
`shadowqa-individual serve` was up would have fought over the same files.

Fixed: the saved-file watcher moved into the service behind `POST /projects/:id/watch` and
`GET /watchers`, and the CLI follows it over HTTP. `withStore` now refuses when the service is
reachable and says which command to use instead. `setup` saves the project through the API when the
service is running and directly when it is not.

### Hardening

**12. Pairing allowed unlimited guesses.**
Redemption is deliberately unauthenticated — the code the user read from their own terminal is the
credential — so a wrong guess has to cost something. Five wrong codes now cancel the pairing.
Covered by `tests/individual-companion.test.ts` → *pairing hardening*.

**13. Version strings were reported with their decoration.**
`claude --version` prints `2.1.269 (Claude Code)`, `codex --version` prints `codex-cli 0.133.0`.
Both were shown verbatim in `doctor` and in setup. `versionNumber` now extracts the number, which
also made the films' terminal text correct.

### Films

**14. Four scenes overflowed the frame.** The business *Execute* scene pushed its heading into the
scene label and clipped the isolation panel; *Publish* clipped its footer pills; the individual
*Deliver* scene ran its last diagram node off the right edge; the individual *Execute* scene
overflowed both top and bottom. Found by rendering one still per scene and inspecting each. All
four re-laid out and re-checked.

**15. Long source lines were clipped mid-token.** The code panels sized text to a fixed value, so a
real line wider than the panel was cut — which makes a quotation inaccurate, not just ugly. Panels
now size to fit with a legibility floor and wrap below it, so the quoted line is always complete.

**16. Source cards positioned against the wrong ancestor.** The context-gathering scene's floating
cards were absolutely positioned inside a container that was not itself positioned, so they landed
across the statistics row. Fixed by making the container the positioning context.

**17. Terminal copy paraphrased the product.** Eight lines across both films were near-misses of
what the CLIs actually print (`installed on one repository` vs `installed on the repository ShadowQA
may read`, `Local clone folder:` vs `Local clone folder for read-only planning:`, and six more).
All aligned to the real strings, and both films re-rendered.

**18. Animations that never arrived.** Three elements had reveal delays close enough to their
scene's end to appear for under a second and a half. Retimed.

---

## Second pass — running the CLI as a user, and a static quality sweep

The first pass reviewed and tested. This pass launched the product and drove every command, then
put the whole repository through compiler-enforced quality checks.

### Driven for real

`shadowqa-individual serve` was started against a disposable home and a disposable clone, and every
command in the CLI was run against it: `status`, `doctor`, `project list/add/mode/backend/repo`,
`conversations`, `context`, `extract`, `items`, `confirm/reject/revise`, `plan`, `plans`, `show`,
`approve`, `tasks`, `task`, `diff`, `open`, `cancel`, `pr`, `findings`, `scan`, `repair`,
`sessions list/add/remove/sweep`, `pair`, `unpair` and `companion install/status/uninstall`.

The complete path ran end to end through the shipped binary: capture → extract → plan → `approve` →
**a real Claude Code session** → frozen diff → `node --test` → local branch. Afterwards the fixture
repository's `HEAD` was unmoved, its working tree was clean, and `shadowqa/<task>` held the fix.
Notably the agent itself reported *"the tests are unverified — my attempts to run them were blocked"*,
and ShadowQA ran them anyway and recorded `exit 0`. That is the design working.

| Bug | How it was found | Fix |
| --- | --- | --- |
| `cancel` on a **finished** task overwrote its state, so a verified `ready` task silently became `cancelled` and its result was lost from the record | Running `cancel` against a completed task | The route refuses any task in a terminal state with a 409 naming the state; only `queued`, `waiting_for_runner`, `preparing`, `running` and `verifying` can be cancelled. Covered by `tests/individual-api.test.ts`. |
| Eleven commands printed raw JSON even without `--json`, so ordinary use looked like a debug dump | Driving every command | A `report()` helper prints one confirmed line by default and the full payload under `--json`. |
| `items` on an empty project printed nothing at all | Driving every command | It now names the command that fills it. |
| The extension side panel loaded fonts with a remote `@import`, which Manifest V3's `default-src 'self'` blocks — the faces never arrive, and every panel open would announce itself to a third party | Scanning the built extension for remote resources | The import is gone; the faces are still named first in each stack, so they are used when the reader already has them, and the system stack carries the design otherwise. |
| The films quoted `chalk.hex("#73e3d3")` and the tagline `context → plan → verify → repair` — both retired when the brand became `BRAND = { charcoal, offwhite }` and `observe → plan → verify → repair` | Comparing the extracted snippets against the current source | The extractor now anchors on `BRAND`, the film's ground, ink and accent are derived from those two values, its success and failure colours are the CLI's own `good`/`bad`, and the on-screen swatch shows the real palette. Both films re-rendered. |
| `individual/cli/main.ts` still painted the pairing code with the retired accent, so the shipped CLI contradicted its own brand module in two places | Grepping for the retired colour | Both use the brand `ink`. |
| A `private db` and `private tenant` on the Slack receiver were stored and never read | `noUnusedLocals` | Made plain constructor parameters. |
| `openPullRequest` took a `task` it never used, and `safeSummary` took one it never mentioned | `noUnusedParameters` | The parameter is gone from the first; the second now states the task id, which is real provenance for the PR body. |
| Sixteen unused imports and six dead locals across both editions and the films | `noUnusedLocals` / `noUnusedParameters` | Removed. |

### Quality gates now enforced, not just run once

`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` and
`noImplicitOverride` were added to all five TypeScript projects — the service, the individual
edition, the browser extension, the VS Code extension and the films. Every project compiles clean
under them, so this class of rot fails the build from here rather than accumulating.

Prettier now passes `--check` across `src`, `individual`, `tests`, `scripts` and `video/src`.

Scans that came back empty: no `TODO`/`FIXME`/`XXX`, no `debugger`, no `.only`/`.skip` left in tests,
no absolute scratch paths, no `eval` or `new Function` in the built extension, no remote resources in
the built extension, and no styling class used by the panel that the stylesheet does not define.

### The suite got four times faster

The individual suites booted a separate WASM PostgreSQL for each of twenty-one stores, which put the
full run at **121 seconds**. One engine is now shared per worker and isolation comes from the tenant
column — which is the product's own isolation mechanism, so the change exercises it rather than
working around it — and the files run in parallel. The same 130 tests now finish in **≈25 seconds**,
verified stable across three consecutive runs.

The slow live-service probing that found the `cancel` bug was also replaced by
`tests/individual-api.test.ts`, which drives the same routes in process with Fastify's `inject`: no
port, no spawned service, eleven cases in about six seconds.

---

## Accepted, and written down

| Behaviour | Why it stands |
| --- | --- |
| Live ChatGPT and Claude capture is unverified | No signed-in browser here. The adapters use ordered selectors and return a visible warning rather than an empty conversation, and this is stated in `individual/README.md`, `SETUP.md` and `docs/VALIDATION.md` instead of being implied to work. |
| The individual edition has no container isolation | It runs the user's own coding CLI on their own machine. It gets *workspace* isolation — a copy from Git objects — not a sandbox. The team edition's network-disabled Docker is not part of it, and the README says so. |
| Workspaces from a `needs_review` task are kept | The diff and the copy are the evidence for a human. They are under `~/.shadowqa-individual/` and are not pruned automatically; `SETUP.md` says where to look. |
| The extension token can capture into any project id it names | Single-user product; the panel chooses the project. It still cannot approve a plan, cancel a task, change a project, scan, repair, start a watcher or mint a pairing code. |
| Codex `exec --json` event shapes are still moving | The adapter reads several shapes and reports an unrecognised failure rather than guessing. |
| Illustrative numbers in the films | Source counts, turn counts and timings for the fictional `payments-ui` project are demonstration data, exactly as the fixture repository is. Every code element, command, colour and state name is extracted from the repository at build time. |

## What stayed clean

- The team edition's existing suites pass unchanged; nothing in the individual work altered
  `src/` behaviour beyond the new `setup.ts`, its two CLI commands and fix 6.
- `npm run demo` produces the same result as before this work.
- No `eval`, `new Function` or remote code in the built extension; three permissions plus two host
  permissions, and no `tabs` permission — the panel asks the content script for the page it is on.
- Both films render deterministically: every animation is a pure function of the frame number, so
  the same frame always produces the same image.
