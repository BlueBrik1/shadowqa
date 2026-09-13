import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { testDb, actor, runner, project } from "../tests/helpers.js";
import { Memory } from "../src/memory/sources.js";
import { Planner } from "../src/planner/planner.js";
import { Scheduler } from "../src/scheduler/jobs.js";
import { QA } from "../src/qa/findings.js";
import { hash } from "../src/core/security.js";
import { git, run } from "../src/runner/process.js";
import { exportTree } from "../src/runner/workspace.js";
import { fixture } from "./fixture.js";
const line = (label: string, value: unknown) => console.log(`  ${label}: ${value}`);
const success = (text: string) => console.log(`  ✓ ${text}`);
const db = await testDb();
try {
  console.log("◈ SHADOWQA DEMO\n");
  line(
    "DEMO",
    "Offline fixture: real PostgreSQL engine, Git snapshots and tests. Scripted model/patch; no external accounts.",
  );
  const { repo, sha } = await fixture();
  const p = project();
  p.repository.localPath = repo;
  await db.put(actor.tenant, "project", p.id, p, p.id);
  await db.rows(
    "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,$4,$5)",
    [hash("demo"), "t1", "alice", "admin", "[]"],
  );
  const memory = new Memory(db);
  await memory.ingest("t1", "slack", "fixture-message", {
    text: "Double clicking Submit creates two records.",
  });
  await memory.ingest("t1", "slack", "fixture-message", {});
  const source = await memory.upsert({
    tenant: "t1",
    project_id: p.id,
    provider: "slack",
    source_key: "fixture:thread:1",
    revision: "1",
    source_time: new Date().toISOString(),
    text: "Confirmed requirement: duplicate in-flight submissions must save once. Later submissions must work.",
    url: "https://app.slack.com/archives/CFIXTURE/p1",
    visibility: "team",
    deleted: false,
    metadata: {},
  });
  await memory.confirm(actor, source.id);
  const model = {
    name: "scripted-offline-fixture",
    generate: async <T>(
      _tenant: string,
      _project: string,
      _system: string,
      _input: unknown,
      schema: z.ZodType<T>,
    ): Promise<T> =>
      schema.parse(
        schema === undefined
          ? {}
          : (z.toJSONSchema(schema) as any).properties?.items
            ? {
                items: [
                  {
                    type: "requirement",
                    statement: "Deduplicate in-flight submissions",
                    sourceIds: [source.id],
                    state: "suggested",
                  },
                ],
                contradictions: [],
              }
            : {
                objective: "Fix duplicate in-flight submissions",
                exclusions: ["No dependencies or test removal"],
                expectedPaths: ["src/submit.js"],
                steps: [
                  {
                    id: "guard",
                    description: "Set the pending flag before awaiting save",
                    dependsOn: [],
                  },
                ],
                acceptanceCriteria: [
                  "Duplicate calls persist once",
                  "Later calls work",
                ],
                regressionStrategy:
                  "Existing planted regression fails before fix and passes after",
                riskFlags: [],
                rollback: "Revert the guard change",
                unansweredQuestions: [],
                assumptions: [],
                citedSourceIds: [source.id],
                inspectedPaths: ["src/submit.js", "tests/submit.test.js"],
              },
      ),
  };
  const plan = await new Planner(db, model).compile(
    actor,
    p.id,
    "Fix duplicate submissions",
  );
  success(
    "Context compiled against real repository files and an immutable SHA.",
  );
  const scheduler = new Scheduler(db),
    challenge = await scheduler.challenge(actor, plan.id);
  await scheduler.approve(
    actor,
    challenge.id,
    challenge.nonce,
    plan.digest,
    "approve",
  );
  const job = (await scheduler.lease(runner))!;
  for (const state of ["preparing", "running"] as const)
    await scheduler.event(runner, job.id, job.fence, { state });
  const work = await mkdtemp(path.resolve(".shadowqa/demo-work-"));
  await exportTree(repo, sha, work);
  const baseline = await run(
    process.execPath,
    ["--test", "tests/submit.test.js"],
    { cwd: work },
  );
  if (baseline.code === 0)
    throw new Error("Planted regression unexpectedly passed");
  success("Original regression reproduced: test process failed.");
  const file = path.join(work, "src/submit.js"),
    original = await readFile(file, "utf8");
  await writeFile(
    file,
    original.replace(
      "// Planted regression: the in-flight guard is never set.",
      "pending = true;",
    ),
  );
  const diff = await git(work, ["diff", "--no-ext-diff"]);
  await scheduler.event(runner, job.id, job.fence, { state: "verifying" });
  const verify = await mkdtemp(path.resolve(".shadowqa/demo-verify-"));
  await exportTree(repo, sha, verify);
  await git(verify, ["apply", "-"], { input: diff });
  const checked = await run(
    process.execPath,
    ["--test", "tests/submit.test.js"],
    { cwd: verify },
  );
  const asCheck = (r: typeof checked) => ({
    id: "test",
    exitCode: r.code,
    output: r.stdout + r.stderr,
    durationMs: r.durationMs,
    timedOut: r.timedOut,
  });
  const result = await scheduler.complete(runner, job.id, job.fence, {
    diff,
    checks: [asCheck(checked)],
    baseline: [asCheck(baseline)],
    baseSha: sha,
    attempts: 1,
  });
  if (result.state !== "ready_to_publish")
    throw new Error("Verification failed");
  if ((await git(repo, ["status", "--porcelain"])).trim())
    throw new Error("Primary worktree was modified");
  success("Independent verification passed; primary worktree is unchanged.");
  success("One durable publication intent created; no live PR was sent.");
  const scan = await scheduler.scan("t1", p.id, sha, "demo-recurring");
  const finding = await new QA(db).record(
    "t1",
    p.id,
    sha,
    [asCheck(baseline)],
    [asCheck(baseline)],
    true,
  );
  success(
    "Standing scan recorded a reproduced finding for the reintroduced regression.",
  );
  const replay = await scheduler.queuePlan("t1", plan, "alice", false);
  if (replay.id !== job.id) throw new Error("Duplicate job created");
  const report = {
    model: model.name,
    baseSha: sha,
    jobId: job.id,
    state: result.state,
    tests: { before: baseline.code, after: checked.code },
    sourceEvents: (await db.rows("SELECT * FROM source_events")).length,
    outboundActions: (await db.rows("SELECT * FROM outbox")).length,
    primaryWorktreeUnchanged: true,
    finding: finding[0]?.classification,
    diff,
  };
  await writeFile(
    path.resolve(".shadowqa/demo-report.json"),
    JSON.stringify(report, null, 2),
  );
  line("REPORT", path.resolve(".shadowqa/demo-report.json"));
} finally {
  await db.close();
}
