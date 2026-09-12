import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { Database } from "../src/db/database.js";
import { Memory } from "../src/memory/sources.js";
import { Scheduler } from "../src/scheduler/jobs.js";
import { hash, token } from "../src/core/security.js";
import {
  actor,
  runner,
  plan,
  project,
  seed,
  sha,
  patch,
  testDb,
} from "./helpers.js";
let db: Database;
beforeAll(async () => {
  db = await testDb();
}, 30000);
afterAll(async () => db.close());
beforeEach(async () => {
  await db.rows(
    "TRUNCATE entities,credentials,source_events,source_documents,source_revisions,jobs,job_events,approvals,outbox,audit_log,model_usage RESTART IDENTITY",
  );
  await seed(db);
});
describe("PostgreSQL durable workflow", () => {
  it("deduplicates deliveries and source revisions; edits invalidate a confirmed decision", async () => {
    const m = new Memory(db);
    expect(await m.ingest("t1", "slack", "delivery", { event: "one" })).toBe(
      true,
    );
    expect(await m.ingest("t1", "slack", "delivery", { event: "two" })).toBe(
      false,
    );
    const input = {
      tenant: "t1",
      project_id: "p1",
      provider: "slack",
      source_key: "C:1",
      revision: "1",
      source_time: "2026-09-12T12:00:00Z",
      text: "Require duplicate guard",
      url: "https://slack.com/a",
      visibility: "private",
      deleted: false,
      metadata: {},
    };
    const first = await m.upsert(input);
    await m.confirm(actor, first.id);
    expect((await m.retrieve(actor, "p1"))[0].confirmed).toBe(true);
    await m.upsert({
      ...input,
      revision: "2",
      source_time: "2026-09-12T13:00:00Z",
      text: "Updated guard",
    });
    await m.upsert({ ...input, revision: "old", text: "stale update" });
    const docs = await m.retrieve(actor, "p1");
    expect(docs).toHaveLength(1);
    expect(docs[0].text).toBe("Updated guard");
    expect(docs[0].confirmed).toBe(false);
  });
  it("removes deleted sources from full-text retrieval and prevents stale resurrection", async () => {
    const m = new Memory(db),
      input = {
        tenant: "t1",
        project_id: "p1",
        provider: "slack",
        source_key: "C:2",
        revision: "1",
        source_time: "2026-09-12T12:00:00Z",
        text: "private phrase",
        url: "https://slack.com/a",
        visibility: "private",
        deleted: false,
        metadata: {},
      };
    await m.upsert(input);
    expect(await m.retrieve(actor, "p1", "phrase")).toHaveLength(1);
    await m.upsert({
      ...input,
      revision: "2",
      source_time: "2026-09-12T13:00:00Z",
      deleted: true,
    });
    await m.upsert(input);
    expect(await m.retrieve(actor, "p1")).toHaveLength(0);
  });
  it("filters tenant and project before returning context", async () => {
    const m = new Memory(db);
    await expect(
      m.retrieve({ ...actor, tenant: "other" }, "p1"),
    ).rejects.toThrow();
    await expect(
      m.retrieve({ ...actor, role: "viewer", projects: ["other"] }, "p1"),
    ).rejects.toThrow();
  });
  it("consumes one-use approvals and creates exactly one job", async () => {
    const scheduler = new Scheduler(db),
      c = await scheduler.challenge(actor, "plan1");
    await scheduler.approve(actor, c.id, c.nonce, c.digest, "approve");
    await expect(
      scheduler.approve(actor, c.id, c.nonce, c.digest, "approve"),
    ).rejects.toThrow(/already used/);
    expect(await db.rows("SELECT * FROM jobs")).toHaveLength(1);
  });
  it("rejects wrong actors, replayed nonces and expired approval challenges", async () => {
    const scheduler = new Scheduler(db),
      c = await scheduler.challenge(actor, "plan1");
    await expect(
      scheduler.approve(
        { ...actor, id: "mallory" },
        c.id,
        c.nonce,
        c.digest,
        "approve",
      ),
    ).rejects.toThrow();
    await db.rows("UPDATE approvals SET expires_at=now()-interval '1 second'");
    await expect(
      scheduler.approve(actor, c.id, c.nonce, c.digest, "approve"),
    ).rejects.toThrow();
  });
  it("invalidates approval when its exact source revision changes", async () => {
    const m = new Memory(db);
    const source = await m.upsert({
      tenant: "t1",
      project_id: "p1",
      provider: "slack",
      source_key: "x",
      revision: "1",
      source_time: new Date().toISOString(),
      text: "Requirement",
      url: "https://slack.com/a",
      visibility: "private",
      deleted: false,
      metadata: {},
    });
    const pl = plan();
    pl.sources = [
      { id: source.id, revision: "1", url: source.url, confirmed: false },
    ];
    const { planDigest } = await import("../src/policy/engine.js");
    pl.digest = planDigest(pl);
    await db.put("t1", "plan", "plan1", pl, "p1");
    const scheduler = new Scheduler(db),
      c = await scheduler.challenge(actor, "plan1");
    await m.upsert({
      ...source,
      revision: "2",
      source_time: new Date(Date.now() + 1000).toISOString(),
      text: "Different requirement",
    });
    await expect(
      scheduler.approve(actor, c.id, c.nonce, c.digest, "approve"),
    ).rejects.toThrow();
    expect((await db.get("t1", "plan", "plan1")).status).toBe("superseded");
  });
  it("leases once, rejects fenced results, quarantines a crashed runner", async () => {
    const scheduler = new Scheduler(db);
    await scheduler.queuePlan("t1", plan(), "alice", false);
    const job = (await scheduler.lease(runner))!;
    expect(job.fence).toBe(1);
    expect(await scheduler.lease(runner)).toBeUndefined();
    await expect(scheduler.heartbeat(runner, job.id, 999)).rejects.toThrow(
      /Lease/,
    );
    await db.rows("UPDATE jobs SET lease_until=now()-interval '1 second'");
    await scheduler.reap("t1");
    expect(await scheduler.lease(runner)).toBeUndefined();
    expect((await db.one("SELECT state FROM jobs")).state).toBe("quarantined");
    await expect(
      scheduler.heartbeat(runner, job.id, job.fence),
    ).rejects.toThrow();
  });
  it("keeps process failures from becoming a publishable repair", async () => {
    const scheduler = new Scheduler(db);
    await scheduler.queuePlan("t1", plan(), "alice", false);
    const job = (await scheduler.lease(runner))!;
    await scheduler.event(runner, job.id, job.fence, { state: "preparing" });
    await scheduler.event(runner, job.id, job.fence, {
      state: "running",
      message: "Agent says tests passed",
    });
    await scheduler.event(runner, job.id, job.fence, { state: "verifying" });
    const result = await scheduler.complete(runner, job.id, job.fence, {
      diff: patch,
      checks: [
        {
          id: "test",
          exitCode: 1,
          output: "failed",
          durationMs: 12,
          timedOut: false,
        },
      ],
      baseline: [],
      baseSha: sha,
      attempts: 1,
    });
    expect(result.state).toBe("failed");
    expect(await db.rows("SELECT * FROM outbox")).toHaveLength(0);
  });
  it("writes verified artifact and publication intent atomically", async () => {
    const scheduler = new Scheduler(db);
    await scheduler.queuePlan("t1", plan(), "alice", false);
    const job = (await scheduler.lease(runner))!;
    for (const state of ["preparing", "running", "verifying"] as const)
      await scheduler.event(runner, job.id, job.fence, { state });
    const result = await scheduler.complete(runner, job.id, job.fence, {
      diff: patch,
      checks: [
        {
          id: "test",
          exitCode: 0,
          output: "passed",
          durationMs: 12,
          timedOut: false,
        },
      ],
      baseline: [],
      baseSha: sha,
      attempts: 1,
    });
    expect(result.state).toBe("ready_to_publish");
    expect(await db.rows("SELECT * FROM outbox")).toHaveLength(1);
    expect((await db.get("t1", "artifact", result.artifactId)).diffDigest).toBe(
      hash(patch),
    );
  });
  it("kill switch fences active jobs and stops new leases", async () => {
    const s = new Scheduler(db);
    await s.queuePlan("t1", plan(), "alice", false);
    const job = (await s.lease(runner))!;
    await s.kill(actor, true);
    expect(await s.lease(runner)).toBeUndefined();
    await expect(s.heartbeat(runner, job.id, job.fence)).rejects.toThrow();
  });
  it("observation mode cannot authorize execution", async () => {
    const p = project();
    p.policy.mode = "observe";
    await db.put("t1", "project", "p1", p, "p1");
    const scheduler = new Scheduler(db),
      c = await scheduler.challenge(actor, "plan1");
    await expect(
      scheduler.approve(actor, c.id, c.nonce, c.digest, "approve"),
    ).rejects.toThrow(/Observation/);
  });
});
