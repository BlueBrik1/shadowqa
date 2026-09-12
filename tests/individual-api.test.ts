import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { rm } from "node:fs/promises";
import { createService } from "../individual/service/server.js";
import {
  createPairingCode,
  redeemPairingCode,
} from "../individual/service/auth.js";
import { fixtureRepo, testProject, testStore } from "./individual-helpers.js";
import type { Store } from "../individual/core/store.js";

/**
 * The HTTP surface, driven in process with Fastify's `inject`. No port is bound and no service is
 * spawned, so these run in milliseconds while still exercising the real routes, the real auth and
 * the real store.
 */
const OWNER = "owner-token-for-tests";

let store: Store;
let service: Awaited<ReturnType<typeof createService>>;
let extensionToken: string;
let repo: Awaited<ReturnType<typeof fixtureRepo>>;

const scriptedModel = {
  name: "scripted",
  async generate(_t: string, _p: string, system: string) {
    if (system.startsWith("You read excerpts"))
      return {
        items: [
          {
            kind: "requirement",
            text: "Duplicate submissions must save exactly once",
            sourceIndexes: [0],
            conflictsWithIndexes: [],
          },
        ],
      } as any;
    return {
      objective: "Set the in-flight submit guard before awaiting save()",
      scope: "src/submit.js only",
      exclusions: [],
      affectedPaths: ["src/submit.js"],
      steps: [
        { id: "guard", description: "Set pending = true", dependsOn: [] },
      ],
      acceptanceCriteria: ["Duplicate submissions save exactly once"],
      tests: [],
      unresolvedQuestions: [],
      risks: [],
      rollback: "Delete the branch",
      citedItemIds: [],
      inspectedPaths: ["src/submit.js"],
    } as any;
  },
};

const call = (
  method: string,
  url: string,
  options: { token?: string | null; body?: unknown } = {},
) =>
  service.app.inject({
    method: method as any,
    url,
    headers:
      options.token === null
        ? {}
        : { authorization: "Bearer " + (options.token ?? OWNER) },
    payload: options.body as any,
  });

beforeAll(async () => {
  store = await testStore("api-test");
  repo = await fixtureRepo();
  service = await createService({
    store,
    ownerToken: OWNER,
    model: scriptedModel as any,
  });
  await store.putProject(
    testProject({ repo: { path: repo.dir, defaultBranch: "main" } }),
  );
  const { code } = await createPairingCode(store);
  extensionToken = await redeemPairingCode(store, code, "ext-under-test");
});

afterAll(async () => {
  await service.runner.stop();
  await service.app.close();
  await repo.cleanup();
});

describe("authentication", () => {
  test("health and backends are public; everything else needs a credential", async () => {
    expect((await call("GET", "/health", { token: null })).statusCode).toBe(
      200,
    );
    expect((await call("GET", "/backends", { token: null })).statusCode).toBe(
      200,
    );
    expect((await call("GET", "/status", { token: null })).statusCode).toBe(
      401,
    );
    expect(
      (await call("GET", "/projects", { token: "nonsense" })).statusCode,
    ).toBe(401);
  });

  test("an extension token may read and capture but never act as the owner", async () => {
    expect(
      (await call("GET", "/projects", { token: extensionToken })).statusCode,
    ).toBe(200);
    expect(
      (await call("GET", "/conversations", { token: extensionToken }))
        .statusCode,
    ).toBe(200);
    for (const [method, url] of [
      ["POST", "/projects"],
      ["PATCH", "/projects/demo"],
      ["POST", "/pair/start"],
      ["POST", "/pair/revoke"],
      ["POST", "/projects/demo/scan"],
      ["POST", "/observers/subscribe"],
    ] as const) {
      const response = await call(method, url, {
        token: extensionToken,
        body: {},
      });
      expect([403, 409]).toContain(response.statusCode);
      if (response.statusCode === 403)
        expect(response.json().message).toMatch(/requires the local CLI/);
    }
  });
});

describe("capture", () => {
  const batch = (text: string, complete = true) => ({
    projectId: "demo",
    conversation: {
      origin: "chatgpt",
      conversationId: "api-1",
      title: "Duplicate submissions",
      url: "https://chatgpt.com/c/api-1",
      coverage: "partial",
    },
    messages: [
      {
        origin: "chatgpt",
        conversationId: "api-1",
        externalId: "m1",
        role: "user",
        text,
        order: 1,
        url: "https://chatgpt.com/c/api-1",
        capturedAt: new Date().toISOString(),
        complete,
        meta: {},
      },
    ],
  });

  test("the extension can capture, and a repeat stores nothing new", async () => {
    const first = await call("POST", "/capture", {
      token: extensionToken,
      body: batch("we double-charge on double click"),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().stored).toBe(1);
    const again = await call("POST", "/capture", {
      token: extensionToken,
      body: batch("we double-charge on double click"),
    });
    expect(again.json()).toMatchObject({ stored: 0, updated: 0, skipped: 1 });
  });

  test("a malformed batch is rejected with a message, not a stack trace", async () => {
    const response = await call("POST", "/capture", {
      body: { projectId: "demo", conversation: {}, messages: "not an array" },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().message).toBeTruthy();
  });
});

describe("plans and tasks", () => {
  test("approval with a stale digest is refused", async () => {
    await call("POST", "/projects/demo/extract", { body: {} });
    const plan = (
      await call("POST", "/projects/demo/plan", { body: {} })
    ).json();
    expect(plan.baseSha).toBe(repo.sha);
    const refused = await call("POST", `/plans/${plan.id}/approve`, {
      body: { digest: "not-the-digest" },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().message).toMatch(/changed since it was displayed/);
  });

  test("a finished task keeps its result instead of being cancelled", async () => {
    // A task that has already produced a verified diff must not be reopened by a stray cancel.
    const now = new Date().toISOString();
    await store.putTask({
      id: "11111111-2222-3333-4444-555555555555",
      projectId: "demo",
      planId: null,
      kind: "plan",
      state: "ready",
      backend: "opencode",
      attempts: 1,
      diff: "diff --git a/src/submit.js b/src/submit.js",
      createdAt: now,
      updatedAt: now,
    });
    const response = await call(
      "POST",
      "/tasks/11111111-2222-3333-4444-555555555555/cancel",
      { body: {} },
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/already ready/);
    expect(
      (await store.task("11111111-2222-3333-4444-555555555555")).state,
    ).toBe("ready");
  });

  test("a queued task can still be cancelled", async () => {
    const now = new Date().toISOString();
    await store.putTask({
      id: "22222222-3333-4444-5555-666666666666",
      projectId: "demo",
      planId: null,
      kind: "plan",
      state: "queued",
      backend: "opencode",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    const response = await call(
      "POST",
      "/tasks/22222222-3333-4444-5555-666666666666/cancel",
      { body: {} },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      cancelled: true,
      previousState: "queued",
    });
    expect(
      (await store.task("22222222-3333-4444-5555-666666666666")).state,
    ).toBe("cancelled");
  });

  test("an unknown task and an unknown plan are 404, not 500", async () => {
    expect((await call("GET", "/tasks/nope")).statusCode).toBe(404);
    expect((await call("GET", "/plans/nope")).statusCode).toBe(404);
  });

  test("a pull request is refused for a task that was never verified", async () => {
    const response = await call(
      "POST",
      "/tasks/22222222-3333-4444-5555-666666666666/pull-request",
      { body: {} },
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/verified task/);
  });
});

describe("model configuration", () => {
  test("without a model, extraction and planning refuse instead of inventing output", async () => {
    const bare = await testStore("api-test-no-model");
    const naked = await createService({ store: bare, ownerToken: OWNER });
    try {
      await bare.putProject(testProject());
      for (const url of ["/projects/demo/extract", "/projects/demo/plan"]) {
        const response = await naked.app.inject({
          method: "POST",
          url,
          headers: { authorization: "Bearer " + OWNER },
          payload: {},
        });
        expect(response.statusCode).toBe(503);
        expect(response.json().code).toBe("MODEL_SETUP");
      }
    } finally {
      await naked.runner.stop();
      await naked.app.close();
    }
  });
});

describe("watchers", () => {
  test("starting and stopping a watcher is idempotent", async () => {
    const started = await call("POST", "/projects/demo/watch", {
      body: { enabled: true },
    });
    expect(started.json()).toMatchObject({ watching: true });
    const again = await call("POST", "/projects/demo/watch", {
      body: { enabled: true },
    });
    expect(again.json()).toMatchObject({
      watching: true,
      alreadyRunning: true,
    });
    expect((await call("GET", "/watchers")).json()).toHaveLength(1);
    const stopped = await call("POST", "/projects/demo/watch", {
      body: { enabled: false },
    });
    expect(stopped.json()).toMatchObject({ watching: false });
    expect((await call("GET", "/watchers")).json()).toHaveLength(0);
  });
});
