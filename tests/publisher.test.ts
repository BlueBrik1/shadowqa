import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import type { Database } from "../src/db/database.js";
import type { GitHub } from "../src/adapters/github.js";
import { Publisher } from "../src/publisher/publisher.js";
import { Scheduler } from "../src/scheduler/jobs.js";
import { planDigest } from "../src/policy/engine.js";
import { AppError } from "../src/core/security.js";
import { exportTree } from "../src/runner/workspace.js";
import { git } from "../src/runner/process.js";
import { fixture } from "../scripts/fixture.js";
import { seed, testDb, runner } from "./helpers.js";
let db: Database, repo: string, sha: string, diff: string;
beforeAll(async () => {
  db = await testDb();
  ({ repo, sha } = await fixture());
  const work = await mkdtemp(path.resolve(".shadowqa/publisher-test-"));
  await exportTree(repo, sha, work);
  const file = path.join(work, "src/submit.js");
  await writeFile(
    file,
    (await readFile(file, "utf8")).replace(
      "// Planted regression: the in-flight guard is never set.",
      "pending = true;",
    ),
  );
  diff = await git(work, ["diff", "--no-ext-diff"]);
}, 60000);
afterAll(async () => db.close());
beforeEach(async () => {
  await db.rows(
    "TRUNCATE entities,credentials,source_events,source_documents,source_revisions,jobs,job_events,approvals,outbox,audit_log,model_usage RESTART IDENTITY",
  );
  await seed(db);
});
async function ready() {
  const p = await db.project("t1", "p1");
  p.repository.localPath = repo;
  await db.put("t1", "project", "p1", p, "p1");
  const pl = await db.get<any>("t1", "plan", "plan1");
  pl.baseSha = sha;
  pl.digest = planDigest(pl);
  await db.put("t1", "plan", "plan1", pl, "p1");
  const s = new Scheduler(db);
  await s.queuePlan("t1", pl, "alice", false);
  const job = (await s.lease(runner))!;
  for (const state of ["preparing", "running", "verifying"] as const)
    await s.event(runner, job.id, job.fence, { state });
  await s.complete(runner, job.id, job.fence, {
    diff,
    checks: [
      {
        id: "test",
        exitCode: 0,
        output: "passed",
        durationMs: 1,
        timedOut: false,
      },
    ],
    baseline: [],
    baseSha: sha,
    attempts: 1,
  });
  return job;
}
function fake(jobId: string, uncertain = false) {
  let pr: any,
    branch: any,
    creates = 0;
  const requests: any[] = [];
  const adapter = {
    root: () => "/repos/test/fixture",
    head: async () => sha,
    pages: async () => (pr ? [pr] : []),
    request: async (_p: any, route: string, method = "GET", body?: any) => {
      requests.push({ route, method, body });
      if (route === "/repos/test/fixture") return { id: 123, private: true };
      if (route.endsWith("/git/blobs")) return { sha: "blob" };
      if (route.endsWith("/git/commits/" + sha))
        return { tree: { sha: "base-tree" } };
      if (route.endsWith("/git/trees")) return { sha: "fixed-tree" };
      if (route.endsWith("/git/commits")) return { sha: "c".repeat(40) };
      if (route.includes("/git/ref/heads/")) {
        if (branch) return { object: { sha: branch } };
        throw new AppError("NOT_FOUND", "not found", 404);
      }
      if (route.endsWith("/git/refs")) {
        branch = body.sha;
        return {};
      }
      if (route.endsWith("/pulls") && method === "POST") {
        creates++;
        pr = {
          number: 1,
          html_url: "https://github.com/test/fixture/pull/1",
          head: { sha: "c".repeat(40) },
          body: body.body,
        };
        if (uncertain) {
          uncertain = false;
          throw new Error("Connection lost after GitHub created PR");
        }
        return pr;
      }
      throw new Error("Unexpected fake API route: " + route);
    },
  };
  return {
    github: adapter as unknown as GitHub,
    requests,
    get creates() {
      return creates;
    },
    tamper: () => {
      pr.head.sha = "d".repeat(40);
    },
  };
}
it("creates one PR and only publishes the approved safe summary", async () => {
  const job = await ready(),
    mock = fake(job.id),
    publisher = new Publisher(db, "t1", mock.github);
  await publisher.publish(job.id);
  await publisher.publish(job.id);
  expect(mock.creates).toBe(1);
  const body = mock.requests.find(
    (x) => x.route.endsWith("/pulls") && x.method === "POST",
  ).body.body;
  expect(body).not.toContain("duplicate submission guard");
  expect(body).toContain("Automated maintenance verified by ShadowQA.");
  expect(
    (await db.one("SELECT state FROM jobs WHERE id=$1", [job.id])).state,
  ).toBe("pr_open");
}, 30000);
it("reconciles a PR created before an uncertain response without duplicating it", async () => {
  const job = await ready(),
    mock = fake(job.id, true),
    publisher = new Publisher(db, "t1", mock.github);
  await expect(publisher.publish(job.id)).rejects.toThrow(/Connection lost/);
  await publisher.publish(job.id);
  expect(mock.creates).toBe(1);
}, 90000);
it("preserves human commits after an uncertain publication attempt", async () => {
  const job = await ready(),
    mock = fake(job.id, true),
    publisher = new Publisher(db, "t1", mock.github);
  await expect(publisher.publish(job.id)).rejects.toThrow();
  mock.tamper();
  await expect(publisher.publish(job.id)).rejects.toMatchObject({
    code: "HEAD_CHANGED",
  });
  expect(mock.creates).toBe(1);
}, 90000);
it("blocks publication when the base changed or the authorizing actor was revoked", async () => {
  const job = await ready(),
    mock = fake(job.id);
  (mock.github as any).head = async () => "b".repeat(40);
  await expect(
    new Publisher(db, "t1", mock.github).publish(job.id),
  ).rejects.toMatchObject({ code: "STALE_BASE" });
  await db.rows("UPDATE credentials SET revoked=true WHERE actor_id='alice'");
  await expect(
    new Publisher(db, "t1", mock.github).publish(job.id),
  ).rejects.toMatchObject({ code: "ACTOR_REVOKED" });
}, 30000);
