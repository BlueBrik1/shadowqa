import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Database } from "../src/db/database.js";
import { Store } from "../individual/core/store.js";
import {
  IndividualProject,
  type CaptureBatch,
} from "../individual/core/contracts.js";
import { git, run } from "../src/runner/process.js";

/**
 * One embedded PostgreSQL per worker, shared by every test in it.
 *
 * Booting a WASM Postgres costs about a second, and these suites ask for a store two dozen times.
 * Isolation comes from the tenant column instead — which is the product's own isolation mechanism,
 * so sharing the engine exercises it rather than papering over it. `close()` is a no-op on the
 * shared handle; the engine goes away with the worker.
 */
let shared: Promise<{ pg: PGlite; db: Database }> | undefined;

async function engine() {
  shared ??= (async () => {
    const pg = new PGlite();
    const adapter = {
      query: async (sql: string, params?: any[]) =>
        sql.includes("CREATE TABLE")
          ? { rows: await pg.exec(sql) }
          : pg.query(sql, params),
    };
    const db = new Database(
      adapter as any,
      (fn) => pg.transaction((tx) => fn(new Database(tx as any))),
      async () => {},
    );
    await db.migrate();
    return { pg, db };
  })();
  return shared;
}

export async function testDb() {
  return (await engine()).db;
}

let tenants = 0;

export async function testStore(tenant?: string) {
  return new Store(await testDb(), tenant ?? `individual-test-${++tenants}`);
}

export function testProject(overrides: Partial<IndividualProject> = {}) {
  return IndividualProject.parse({
    id: "demo",
    name: "Demo",
    backend: "opencode",
    mode: "approval",
    checks: [{ id: "check", argv: ["node", "--test"], timeoutSeconds: 60 }],
    requiredChecks: ["check"],
    allowedPaths: ["src/", "tests/"],
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

export function batch(
  overrides: Partial<CaptureBatch> = {},
  messages: Partial<CaptureBatch["messages"][number]>[] = [],
): CaptureBatch {
  const now = new Date().toISOString();
  return {
    projectId: "demo",
    conversation: {
      origin: "chatgpt",
      conversationId: "conv-1",
      title: "Duplicate submissions",
      url: "https://chatgpt.com/c/conv-1",
      coverage: "partial",
      ...(overrides.conversation ?? {}),
    },
    messages: messages.map((m, i) => ({
      origin: "chatgpt",
      conversationId: "conv-1",
      role: "user",
      text: "message " + i,
      order: i + 1,
      url: "https://chatgpt.com/c/conv-1",
      capturedAt: now,
      complete: true,
      meta: {},
      ...m,
    })) as CaptureBatch["messages"],
    ...overrides,
    conversation: {
      origin: "chatgpt",
      conversationId: "conv-1",
      title: "Duplicate submissions",
      url: "https://chatgpt.com/c/conv-1",
      coverage: "partial",
      ...(overrides.conversation ?? {}),
    },
  };
}

/** A disposable Git repository with one committed file and, optionally, uncommitted work. */
export async function fixtureRepo(options: { dirty?: boolean } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "shadowqa-ind-repo-"));
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(
    path.join(dir, "src", "submit.js"),
    "export const guard = false;\n",
  );
  await run("git", ["init", "--quiet", dir], { timeoutMs: 30_000 });
  await git(dir, ["config", "user.email", "test@localhost"]);
  await git(dir, ["config", "user.name", "Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  await git(dir, ["add", "--all"]);
  await git(dir, ["commit", "--quiet", "-m", "base"]);
  const sha = (await git(dir, ["rev-parse", "HEAD"])).trim();
  if (options.dirty)
    await writeFile(
      path.join(dir, "src", "submit.js"),
      "export const guard = false; // WIP\n",
    );
  return {
    dir,
    sha,
    cleanup: () =>
      rm(dir, { recursive: true, force: true }).catch(() => undefined),
  };
}

export const fixedModel = (output: unknown) => ({
  name: "test-model",
  generate: async () => output as any,
});
