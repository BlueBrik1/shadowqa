import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import type { Database } from "../src/db/database.js";
import { createServer } from "../src/api/server.js";
import { seed, testDb } from "./helpers.js";
import { createHmac } from "node:crypto";
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
it("requires auth and rejects runner access to project context", async () => {
  const api = createServer(db, { tenant: "t1" });
  expect((await api.inject("/status")).statusCode).toBe(401);
  expect(
    (
      await api.inject({
        url: "/projects/p1/context",
        headers: { authorization: "Bearer runner-token" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await api.inject({
        url: "/status",
        headers: { authorization: "Bearer admin-token" },
      })
    ).statusCode,
  ).toBe(200);
  await api.close();
});
it("persists a signed webhook before acknowledging it and deduplicates retries", async () => {
  process.env.GITHUB_WEBHOOK_SECRET = "secret";
  const api = createServer(db, { tenant: "t1" });
  const payload = JSON.stringify({
      action: "opened",
      repository: { id: 123 },
      installation: { id: 456 },
    }),
    signature =
      "sha256=" + createHmac("sha256", "secret").update(payload).digest("hex");
  for (let i = 0; i < 2; i++)
    expect(
      (
        await api.inject({
          method: "POST",
          url: "/webhooks/github",
          headers: {
            "content-type": "application/json",
            "x-github-delivery": "d1",
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
          payload,
        })
      ).statusCode,
    ).toBe(200);
  expect(await db.rows("SELECT * FROM source_events")).toHaveLength(1);
  expect(
    (
      await api.inject({
        method: "POST",
        url: "/webhooks/github",
        headers: { "content-type": "application/json" },
        payload,
      })
    ).statusCode,
  ).toBe(401);
  await api.close();
});
it("binds routes to tenant and project identity and validates JSON", async () => {
  const api = createServer(db, { tenant: "t1" }),
    headers = { authorization: "Bearer admin-token" };
  expect(
    (
      await api.inject({
        method: "POST",
        url: "/projects/p1/mode",
        headers,
        payload: { mode: "unrestricted" },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await api.inject({ method: "GET", url: "/plans/missing", headers }))
      .statusCode,
  ).toBe(404);
  expect(
    (
      await api.inject({
        method: "POST",
        url: "/jobs/lease",
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
  await api.close();
});
