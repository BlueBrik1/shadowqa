import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import type { Database } from "../src/db/database.js";
import { createServer } from "../src/api/server.js";
import { seed, testDb } from "./helpers.js";
import { classifyLive, toFinding } from "../src/live/bridge.js";
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
const headers = {
  authorization: "Bearer admin-token",
  "content-type": "application/json",
};
const incident = (status: string, extra: Record<string, unknown> = {}) => ({
  incidentId: "inc-1",
  status,
  title: "TypeError on /checkout",
  fingerprint: "fp-1",
  route: "/checkout",
  failure: { type: "TypeError", message: "Cannot read properties of undefined (reading 'total')" },
  location: { file: "frontend/src/demo/pages/Checkout.jsx", line: 42, side: "frontend" },
  chain: ["click Pay", "POST /api/demo/payment", "TypeError"],
  rootCause: "amount computed from a stale cart snapshot",
  confidence: 0.91,
  risk: "LOW",
  files: ["frontend/src/demo/pages/Checkout.jsx"],
  lines: 6,
  ...extra,
});
it("maps Live states onto the finding vocabulary", () => {
  expect(classifyLive(incident("captured") as any)).toMatchObject({ state: "open", classification: "observed" });
  expect(classifyLive(incident("diagnosed") as any)).toMatchObject({ state: "open", classification: "patch-ready", severity: "low" });
  expect(classifyLive(incident("verified") as any)).toMatchObject({ state: "resolved", classification: "repaired" });
  expect(classifyLive(incident("rolled_back") as any).classification).toBe("repair-failed");
  const f = toFinding("p1", incident("diagnosed") as any);
  expect(f.detector).toBe("live");
  expect(f.rule).toBe("live:/checkout");
  expect(f.output).toContain("root cause: amount computed");
});
it("exposes the project mode as Live policy and mirrors incidents as findings", async () => {
  const api = createServer(db, { tenant: "t1" });
  const policy = await api.inject({ url: "/live/policy/p1", headers });
  expect(policy.statusCode).toBe(200);
  expect(policy.json()).toMatchObject({ project: "p1", paused: false });
  expect(["observe", "approval", "auto-fix", "full-auto"]).toContain(policy.json().mode);
  const reported = await api.inject({
    method: "POST",
    url: "/live/projects/p1/incidents",
    headers,
    payload: incident("diagnosed"),
  });
  expect(reported.statusCode).toBe(200);
  expect(reported.json()).toMatchObject({ findingId: "inc-1", state: "open", classification: "patch-ready" });
  const findings = (await api.inject({ url: "/findings", headers })).json();
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({ detector: "live", projectId: "p1", rule: "live:/checkout" });
  // A later state for the same incident updates the finding instead of creating another one.
  await api.inject({
    method: "POST",
    url: "/live/projects/p1/incidents",
    headers,
    payload: incident("verified", { verified: true }),
  });
  const after = (await api.inject({ url: "/live/projects/p1/incidents", headers })).json();
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ state: "resolved", classification: "repaired" });
  expect((await api.inject({ url: "/live/policy/p1", headers: { authorization: "Bearer runner-token" } })).statusCode).toBe(200);
  await api.close();
});
it("repairing a Live finding hands the diagnosed patch to Live instead of planning again", async () => {
  const api = createServer(db, { tenant: "t1" });
  await api.inject({ method: "POST", url: "/live/projects/p1/incidents", headers, payload: incident("diagnosed") });
  await api.inject({ method: "POST", url: "/projects/p1/mode", headers, payload: { mode: "approval" } });
  const repair = await api.inject({ method: "POST", url: "/findings/inc-1/repair", headers, payload: {} });
  expect(repair.statusCode).toBe(200);
  expect(repair.json()).toMatchObject({ kind: "live", action: { kind: "approve", incidentId: "inc-1", state: "queued" } });
  const leased = await api.inject({ method: "POST", url: "/live/projects/p1/actions/lease", headers, payload: {} });
  expect(leased.json().actions).toHaveLength(1);
  expect(leased.json().actions[0]).toMatchObject({ kind: "approve", incidentId: "inc-1" });
  // Leasing is one-shot.
  expect((await api.inject({ method: "POST", url: "/live/projects/p1/actions/lease", headers, payload: {} })).json().actions).toHaveLength(0);
  // Observe mode never lets Live write.
  await api.inject({ method: "POST", url: "/projects/p1/mode", headers, payload: { mode: "observe" } });
  const blocked = await api.inject({ method: "POST", url: "/findings/inc-1/repair", headers, payload: {} });
  expect(blocked.statusCode).toBe(400);
  expect(blocked.json().code).toBe("OBSERVE");
  await api.close();
});
