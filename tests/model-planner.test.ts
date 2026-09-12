import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { z } from "zod";
import { Gemini } from "../src/model/gemini.js";
import { Planner } from "../src/planner/planner.js";
import { actor, seed, testDb, sha, plan } from "./helpers.js";
import type { Database } from "../src/db/database.js";
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
it("repairs invalid model JSON once, caches valid output, and redacts context", async () => {
  let calls = 0;
  const requests: string[] = [];
  const mock = async (_url: any, init: any) => {
    requests.push(init.body);
    calls++;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: calls === 1 ? "bad JSON" : '{"answer":"ok"}' }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
      { status: 200 },
    );
  };
  const model = new Gemini(
      db,
      "gemini-fixture",
      "test-api-key",
      10,
      mock as typeof fetch,
    ),
    schema = z.object({ answer: z.string() });
  expect(
    await model.generate(
      "t1",
      "p1",
      "system",
      { message: "password=supersecret" },
      schema,
    ),
  ).toEqual({ answer: "ok" });
  expect(requests.join("")).not.toContain("supersecret");
  expect(
    await model.generate(
      "t1",
      "p1",
      "system",
      { message: "password=supersecret" },
      schema,
    ),
  ).toEqual({ answer: "ok" });
  expect(calls).toBe(2);
});
it("does not switch provider or billing on Gemini quota exhaustion", async () => {
  let calls = 0;
  const model = new Gemini(db, "gemini-fixture", "key", 10, (async () => {
    calls++;
    return new Response("{}", { status: 429 });
  }) as typeof fetch);
  await expect(
    model.generate("t1", "p1", "system", {}, z.object({})),
  ).rejects.toMatchObject({ code: "QUOTA_PAUSED" });
  expect(calls).toBe(1);
});
it("reserves daily quota atomically", async () => {
  const model = new Gemini(db, "gemini-fixture", "key", 1);
  await model.reserve("t1");
  await expect(model.reserve("t1")).rejects.toMatchObject({
    code: "QUOTA_PAUSED",
  });
  expect((await db.one("SELECT calls FROM model_usage")).calls).toBe(1);
});
it("rejects fabricated source citations", async () => {
  const inspector = async () => ({
    baseSha: sha,
    files: [{ path: "src/submit.js", text: "export const a = 1;" }],
    paths: ["src/submit.js"],
    dirty: false,
  });
  const output = plan();
  const mock = {
    name: "fixture",
    generate: async <T>(
      _t: string,
      _p: string,
      _s: string,
      _i: unknown,
      schema: z.ZodType<T>,
    ) =>
      schema.parse(
        (z.toJSONSchema(schema) as any).properties.items
          ? { items: [], contradictions: [] }
          : { ...output, citedSourceIds: ["nonexistent"] },
      ),
  };
  await expect(
    new Planner(db, mock, inspector).compile(actor, "p1", "Fix guard"),
  ).rejects.toMatchObject({ code: "CITATION" });
});
it("preserves authority conflicts as blocking unanswered questions", async () => {
  const inspector = async () => ({
    baseSha: sha,
    files: [{ path: "src/submit.js", text: "export const a = 1;" }],
    paths: ["src/submit.js"],
    dirty: false,
  });
  const output = plan();
  const mock = {
    name: "fixture",
    generate: async <T>(
      _t: string,
      _p: string,
      _s: string,
      _i: unknown,
      schema: z.ZodType<T>,
    ) =>
      schema.parse(
        (z.toJSONSchema(schema) as any).properties.items
          ? { items: [], contradictions: ["Two confirmed decisions conflict"] }
          : { ...output },
      ),
  };
  const result = await new Planner(db, mock, inspector).compile(
    actor,
    "p1",
    "Fix guard",
  );
  expect(result.status).toBe("blocked");
  expect(result.unansweredQuestions).toContain(
    "Two confirmed decisions conflict",
  );
});
