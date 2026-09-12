/**
 * End-to-end validation of ShadowQA Individual, in a disposable home and a disposable repository.
 *
 * Real: the embedded PostgreSQL engine and its schema, the authenticated loopback API, the
 * pairing exchange, capture with deduplication and streaming completion, repository inspection at
 * a real commit, every plan gate, isolated workspace creation from Git objects, the patch review,
 * the checks (actual `node --test` processes), the branch commit through Git plumbing, and the
 * finding fingerprints.
 *
 * Scripted: the model output (no Gemini key is required to run this) and the coding agent's edit.
 * Nothing here calls Gemini, drives a real agent session, or opens a pull request.
 */
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const home = await mkdtemp(path.join(tmpdir(), "shadowqa-individual-demo-"));
process.env.SHADOWQA_INDIVIDUAL_HOME = home;
process.env.SHADOWQA_INDIVIDUAL_TENANT = "demo";
process.env.SHADOWQA_INDIVIDUAL_PORT = "4399";
delete process.env.DATABASE_URL;
delete process.env.SHADOWQA_INDIVIDUAL_DATABASE_URL;

const { openDatabase } = await import("../individual/core/db.js");
const { Store } = await import("../individual/core/store.js");
const { createService } = await import("../individual/service/server.js");
const { ownerToken } = await import("../individual/service/auth.js");
const { redeemPairingCode } = await import("../individual/service/auth.js");
const {
  prepareWorkspace,
  freezeDiff,
  reviewPatch,
  verifyInFreshCopy,
  checksPassed,
} = await import("../individual/core/execute.js");
const { commitToBranch, safeSummary, githubStatus } = await import(
  "../individual/core/publish.js"
);
const { record, findings } = await import("../individual/core/qa.js");
const { git, run } = await import("../src/runner/process.js");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const steps: { step: string; detail: string }[] = [];
const note = (step: string, detail: string) => {
  steps.push({ step, detail });
  console.log(`  ${step.padEnd(30)} ${detail}`);
};
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error("ASSERTION FAILED: " + message);
};

console.log("\n  ◈ SHADOWQA INDIVIDUAL — end-to-end check\n");

// ---------------------------------------------------------------------------
// A disposable repository holding the repository's own regression fixture.
// ---------------------------------------------------------------------------
const repo = await mkdtemp(path.join(tmpdir(), "shadowqa-individual-repo-"));
await cp(path.join(repoRoot, "fixtures", "duplicate-submit"), repo, {
  recursive: true,
});
await writeFile(
  path.join(repo, "package.json"),
  JSON.stringify(
    { name: "duplicate-submit", type: "module", private: true },
    null,
    2,
  ) + "\n",
);
await run("git", ["init", "--quiet", repo], { timeoutMs: 30_000 });
await git(repo, ["config", "user.email", "demo@localhost"]);
await git(repo, ["config", "user.name", "ShadowQA Demo"]);
await git(repo, ["config", "commit.gpgsign", "false"]);
await git(repo, ["add", "--all"]);
await git(repo, [
  "-c",
  "commit.gpgsign=false",
  "commit",
  "--quiet",
  "-m",
  "planted regression",
]);
const baseSha = (await git(repo, ["rev-parse", "HEAD"])).trim();

// Uncommitted developer work that must survive untouched.
const scratchPath = path.join(repo, "src", "scratch.md");
await writeFile(scratchPath, "my notes, not committed\n");
await writeFile(
  path.join(repo, "src", "submit.js"),
  (await readFile(path.join(repo, "src", "submit.js"), "utf8")) +
    "// work in progress\n",
);
note("repository", `${repo} @ ${baseSha.slice(0, 8)} with uncommitted work`);

// ---------------------------------------------------------------------------
// Service, on loopback, with a scripted model.
// ---------------------------------------------------------------------------
const items = [
  {
    kind: "requirement",
    text: "Duplicate submissions must save exactly once while a request is pending",
    sourceIndexes: [0],
    conflictsWithIndexes: [],
  },
  {
    kind: "decision",
    text: "Set the in-flight guard before the await, not after",
    sourceIndexes: [1],
    conflictsWithIndexes: [],
  },
  {
    kind: "constraint",
    text: "Do not change the retry banner in this pass",
    sourceIndexes: [2],
    conflictsWithIndexes: [],
  },
  {
    kind: "suggestion",
    text: "Consider a debounce on the button as well",
    sourceIndexes: [3],
    conflictsWithIndexes: [],
  },
  {
    kind: "question",
    text: "Should a failed save re-enable the button immediately?",
    sourceIndexes: [3],
    conflictsWithIndexes: [],
  },
];
let modelCalls = 0;
const scriptedModel = {
  name: "scripted-demo-model",
  async generate(_tenant: string, _project: string, system: string) {
    modelCalls += 1;
    if (system.startsWith("You read excerpts")) return { items } as any;
    return {
      objective: "Set the in-flight submit guard before awaiting save()",
      scope: "src/submit.js only; the retry banner is untouched.",
      exclusions: ["Retry banner"],
      affectedPaths: ["src/submit.js"],
      steps: [
        {
          id: "guard",
          description: "Assign pending = true before awaiting save(value)",
          dependsOn: [],
        },
        {
          id: "regress",
          description: "Run the committed duplicate-submission test",
          dependsOn: ["guard"],
        },
      ],
      acceptanceCriteria: [
        "Duplicate submissions save exactly once while a request is pending",
        "A later submission still succeeds after the first completes",
      ],
      tests: ["tests/submit.test.js"],
      unresolvedQuestions: [
        "Should a failed save re-enable the button immediately?",
      ],
      risks: [],
      rollback: "Delete the ShadowQA branch",
      citedItemIds: [],
      inspectedPaths: ["src/submit.js", "tests/submit.test.js"],
    } as any;
  },
};

const db = await openDatabase();
const store = new Store(db);
const token = await ownerToken();
const service = await createService({
  store,
  ownerToken: token,
  model: scriptedModel as any,
});
const url = await service.listen();
note("service", url + "  (embedded postgresql)");

const api = async (
  route: string,
  method = "GET",
  body?: unknown,
  bearer = token,
) => {
  const response = await fetch(url + route, {
    method,
    headers: {
      authorization: "Bearer " + bearer,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok)
    throw new Error(`${route} → ${response.status} ${text.slice(0, 200)}`);
  return payload;
};

// ---------------------------------------------------------------------------
// 1. Pairing: an unpaired caller is refused; a paired one is not.
// ---------------------------------------------------------------------------
let refused = false;
try {
  await api("/projects", "GET", undefined, "not-a-real-token");
} catch {
  refused = true;
}
assert(refused, "an unknown bearer token must be rejected");
const pairing = await api("/pair/start", "POST", {});
const extensionToken = await redeemPairingCode(
  store,
  pairing.code,
  "demoextensionidaaaaaaaaaaaaaaaaa",
);
await api("/projects", "GET", undefined, extensionToken);
let ownerOnly = false;
try {
  await api("/pair/start", "POST", {}, extensionToken);
} catch {
  ownerOnly = true;
}
assert(ownerOnly, "an extension token must not be able to mint pairing codes");
note("pairing", "code redeemed; extension token is read/capture only");

// ---------------------------------------------------------------------------
// 2. Project.
// ---------------------------------------------------------------------------
const project = await api("/projects", "POST", {
  id: "payments",
  name: "Payments",
  repo: { path: repo, defaultBranch: "main" },
  backend: "opencode",
  mode: "approval",
  checks: [{ id: "test", argv: ["node", "--test"], timeoutSeconds: 300 }],
  requiredChecks: ["test"],
  allowedPaths: ["src/", "tests/"],
});
note("project", `${project.id} · ${project.mode} · ${project.backend}`);

// ---------------------------------------------------------------------------
// 3. Capture, through the same endpoint the extension uses.
// ---------------------------------------------------------------------------
const now = new Date().toISOString();
const conversation = {
  origin: "chatgpt" as const,
  conversationId: "demo-conv-1",
  title: "Duplicate submissions",
  url: "https://chatgpt.com/c/demo-conv-1",
  coverage: "partial" as const,
};
const turns = [
  {
    role: "user" as const,
    text: "We double-charge when someone double-clicks submit. Two saves for one click.",
    externalId: "m1",
  },
  {
    role: "assistant" as const,
    text: "The in-flight guard has to be set before the await, not after.",
    externalId: "m2",
  },
  {
    role: "user" as const,
    text: "Don't touch the retry banner in this pass.",
    externalId: "m3",
  },
  {
    role: "assistant" as const,
    text: "Understood. I could also debounce the button — up to you.",
    externalId: "m4",
  },
];
const capture = (messages: any[]) =>
  api(
    "/capture",
    "POST",
    { projectId: "payments", conversation, messages },
    extensionToken,
  );

const first = await capture(
  turns.slice(0, 3).map((t, i) => ({
    ...t,
    origin: "chatgpt",
    conversationId: conversation.conversationId,
    order: i + 1,
    url: conversation.url,
    capturedAt: now,
    complete: true,
  })),
);
const streaming = await capture([
  {
    ...turns[3],
    origin: "chatgpt",
    conversationId: conversation.conversationId,
    text: "Understood. I could also",
    order: 4,
    url: conversation.url,
    capturedAt: now,
    complete: false,
  },
]);
const settled = await capture(
  turns.map((t, i) => ({
    ...t,
    origin: "chatgpt",
    conversationId: conversation.conversationId,
    order: i + 1,
    url: conversation.url,
    capturedAt: now,
    complete: true,
  })),
);
assert(first.stored === 3, "first capture stores three turns");
assert(
  streaming.messageCount === 4,
  "a partial reply is recorded as the fourth turn",
);
assert(
  settled.messageCount === 4 && settled.updated === 1,
  "the settled reply completes that same turn instead of adding a fifth",
);
const fourth = (await api("/projects/payments/context")).find(
  (m: any) => m.role === "assistant" && m.text.includes("debounce"),
);
assert(
  fourth && fourth.text.endsWith("up to you."),
  "the completed text replaced the partial one",
);
const again = await capture(
  turns.map((t, i) => ({
    ...t,
    origin: "chatgpt",
    conversationId: conversation.conversationId,
    order: i + 1,
    url: conversation.url,
    capturedAt: now,
    complete: true,
  })),
);
assert(
  again.stored === 0 && again.updated === 0,
  "re-sending the same turns stores nothing",
);
note(
  "capture",
  `${settled.messageCount} turns, duplicates skipped, streaming completed in place`,
);

// ---------------------------------------------------------------------------
// 4. Extraction, with the suggestion kept separate from the requirements.
// ---------------------------------------------------------------------------
const extraction = await api("/projects/payments/extract", "POST", {});
const kinds = extraction.items.map((i: any) => i.kind);
assert(
  kinds.includes("requirement") && kinds.includes("suggestion"),
  "kinds are preserved",
);
assert(
  extraction.items.every((i: any) => i.status === "proposed"),
  "nothing is confirmed without a human",
);
const decision = extraction.items.find((i: any) => i.kind === "decision");
await api(`/items/${decision.id}`, "PATCH", { status: "confirmed" });
note(
  "extraction",
  `${extraction.items.length} items from ${extraction.excerpts} excerpts`,
);

// ---------------------------------------------------------------------------
// 5. Plan, grounded in the actual repository.
// ---------------------------------------------------------------------------
const plan = await api("/projects/payments/plan", "POST", {
  objective: "Stop duplicate submissions",
});
assert(
  plan.baseSha === baseSha,
  "the plan is bound to the repository's real HEAD",
);
assert(
  plan.affectedPaths.join() === "src/submit.js",
  "the plan stays inside the allowed paths",
);
assert(
  plan.unresolvedQuestions.length === 1,
  "the open question is carried, not answered",
);
note(
  "plan",
  `${plan.id} · base ${plan.baseSha.slice(0, 8)} · digest ${plan.digest.slice(0, 12)}`,
);

// A stale digest must be refused.
let staleRefused = false;
try {
  await api(`/plans/${plan.id}/approve`, "POST", { digest: "not-the-digest" });
} catch {
  staleRefused = true;
}
assert(staleRefused, "approval must be bound to the exact displayed plan");

// ---------------------------------------------------------------------------
// 6. Execution. The agent's edit is scripted here; everything around it is not.
// ---------------------------------------------------------------------------
const storedProject = await store.project("payments");
const storedPlan = await store.plan(plan.id);
const prepared = await prepareWorkspace(storedProject, storedPlan);
assert(prepared.uncommitted >= 2, "uncommitted developer work is detected");
assert(
  !(
    await readFile(path.join(prepared.workspace, "src", "submit.js"), "utf8")
  ).includes("work in progress"),
  "the isolated copy comes from the commit, not the working tree",
);
note(
  "workspace",
  `${prepared.workspace} (${prepared.uncommitted} uncommitted changes left alone)`,
);

const target = path.join(prepared.workspace, "src", "submit.js");
await writeFile(
  target,
  (await readFile(target, "utf8")).replace(
    "    // Planted regression: the in-flight guard is never set.",
    "    pending = true;",
  ),
);
const diff = await freezeDiff(prepared.workspace);
const review = reviewPatch(diff, storedProject, storedPlan);
assert(
  review.files.join() === "src/submit.js",
  "only the planned file changed",
);
note(
  "patch",
  `${review.files.length} file, +${review.added}/-${review.removed}`,
);

const verification = await verifyInFreshCopy(storedProject, storedPlan, diff);
const verdict = checksPassed(storedProject, verification.checks);
assert(
  verdict.ok,
  "the committed regression test passes on a fresh copy: " +
    JSON.stringify(verification.checks[0]?.output?.slice(-400)),
);
assert(
  verification.unexpected.length === 0,
  "nothing outside the plan was touched",
);
note(
  "verification",
  verification.checks
    .map((c) => `${c.id} exit ${c.exitCode} (${c.durationMs} ms)`)
    .join(", "),
);

// A patch that weakens a test is refused even though the agent produced it.
let weakeningRefused = false;
try {
  reviewPatch(
    [
      "diff --git a/tests/submit.test.js b/tests/submit.test.js",
      "--- a/tests/submit.test.js",
      "+++ b/tests/submit.test.js",
      "@@ -1 +1 @@",
      "-  assert.equal(calls, 1);",
      "+  // removed",
    ].join("\n"),
    storedProject,
    storedPlan,
  );
} catch {
  weakeningRefused = true;
}
assert(weakeningRefused, "a patch that deletes an assertion is refused");

// ---------------------------------------------------------------------------
// 7. The verified result becomes a local branch, with the working tree untouched.
// ---------------------------------------------------------------------------
const task = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  projectId: "payments",
  planId: plan.id,
  kind: "plan" as const,
  state: "verifying" as const,
  backend: "opencode" as const,
  attempts: 1,
  createdAt: now,
  updatedAt: now,
};
const published = await commitToBranch(
  storedProject,
  storedPlan,
  task as any,
  verification.verifyDir,
  review.files,
);
assert(
  (await git(repo, ["rev-parse", "HEAD"])).trim() === baseSha,
  "HEAD did not move",
);
assert(
  (await readFile(path.join(repo, "src", "submit.js"), "utf8")).includes(
    "work in progress",
  ),
  "the developer's uncommitted edit survived",
);
assert(
  (await readFile(scratchPath, "utf8")).includes("my notes"),
  "the developer's untracked file survived",
);
assert(
  (await git(repo, ["show", `${published.branch}:src/submit.js`])).includes(
    "pending = true;",
  ),
  "the branch holds the verified change",
);
note(
  "branch",
  `${published.branch} @ ${published.commit.slice(0, 8)} · working tree untouched`,
);
note("github", githubStatus(storedProject).reason ?? "connected");

// ---------------------------------------------------------------------------
// 8. Continuous QA: a failing check becomes one deduplicated finding.
// ---------------------------------------------------------------------------
const failing = [
  {
    id: "test",
    exitCode: 1,
    output:
      "duplicate submissions save exactly once\nexpected 1, got 2\nat submit.test.js:12:5",
    durationMs: 900,
    timedOut: false,
  },
];
await record(store, storedProject, baseSha, failing, "scheduled");
await record(
  store,
  storedProject,
  baseSha,
  failing,
  "scheduled",
  failing,
  true,
);
const found = await findings(store, "payments");
assert(found.length === 1, "the same failure is one finding, not two");
assert(found[0].occurrences === 2, "occurrences accumulate");
note(
  "findings",
  `${found[0].id.slice(0, 10)} ${found[0].classification} · seen ${found[0].occurrences}×`,
);

// ---------------------------------------------------------------------------
// 9. Deleting the conversation removes derived context too.
// ---------------------------------------------------------------------------
const forgotten = await api(
  `/conversations/${encodeURIComponent("chatgpt:demo-conv-1")}`,
  "DELETE",
  undefined,
  extensionToken,
);
assert(forgotten.removedMessages === 4, "every captured turn is deleted");
assert(
  (await api("/projects/payments/items")).length === 0,
  "items derived from it are gone",
);
note(
  "deletion",
  `${forgotten.removedMessages} messages and their derived items removed`,
);

// ---------------------------------------------------------------------------
const report = {
  ranAt: new Date().toISOString(),
  home,
  repository: repo,
  baseSha,
  branch: published.branch,
  commit: published.commit,
  modelCalls,
  checks: verification.checks.map((c) => ({
    id: c.id,
    exitCode: c.exitCode,
    durationMs: c.durationMs,
  })),
  steps,
  scripted: ["model output (no Gemini key needed)", "the coding agent's edit"],
  real: [
    "embedded PostgreSQL schema and full-text context",
    "authenticated loopback API and pairing",
    "capture deduplication, streaming completion and deletion",
    "repository inspection at a real commit",
    "plan path and digest gates",
    "isolated workspace from Git objects",
    "patch review gates",
    "node --test processes",
    "branch creation through Git plumbing",
    "finding fingerprints",
  ],
};
await mkdir(path.join(repoRoot, ".shadowqa"), { recursive: true });
await writeFile(
  path.join(repoRoot, ".shadowqa", "individual-demo-report.json"),
  JSON.stringify(report, null, 2),
);

await service.close();
await db.close();
await rm(verification.verifyDir, { recursive: true, force: true }).catch(
  () => undefined,
);
await rm(prepared.workspace, { recursive: true, force: true }).catch(
  () => undefined,
);
await rm(repo, { recursive: true, force: true }).catch(() => undefined);
await rm(home, { recursive: true, force: true }).catch(() => undefined);

console.log(
  `\n  ✓ ${steps.length} stages passed. Report: .shadowqa/individual-demo-report.json\n`,
);
console.log("  Scripted in this run: " + report.scripted.join("; ") + ".\n");
process.exit(0);
