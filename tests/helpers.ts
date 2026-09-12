import { PGlite } from "@electric-sql/pglite";
import { Database } from "../src/db/database.js";
import { Project, type Plan, type Principal } from "../src/core/contracts.js";
import { hash } from "../src/core/security.js";
import { planDigest } from "../src/policy/engine.js";
export async function testDb() {
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
    () => pg.close(),
  );
  await db.migrate();
  return db;
}
export const actor: Principal = {
  tenant: "t1",
  id: "alice",
  role: "admin",
  projects: [],
};
export const runner: Principal = {
  tenant: "t1",
  id: "runner1",
  role: "runner",
  projects: ["p1"],
};
export const sha = "a".repeat(40);
export function project() {
  return Project.parse({
    id: "p1",
    name: "Fixture",
    audience: "team",
    repository: {
      id: "r1",
      githubId: 123,
      owner: "test",
      name: "fixture",
      installationId: 456,
      defaultBranch: "main",
      visibility: "private",
      localPath: "unused",
    },
    channels: [{ id: "C123", private: false }],
    profile: {
      id: "node-v1",
      checks: [{ id: "test", argv: ["node", "--test"] }],
      allowedPaths: ["src/", "tests/", "docs/"],
      protectedPaths: [".github/"],
      requiredChecks: ["test"],
      reviewed: true,
      externalInferenceApproved: true,
    },
    policy: { mode: "approval", summaryApproved: true },
  });
}
export function plan(p = project()): Plan {
  const partial = {
    id: "plan1",
    taskId: "task1",
    projectId: p.id,
    repositoryId: p.repository.id,
    version: 1,
    baseSha: sha,
    sources: [],
    objective: "Correct the duplicate submission guard",
    exclusions: ["No dependencies"],
    expectedPaths: ["src/submit.js"],
    steps: [{ id: "fix", description: "Fix duplicate guard", dependsOn: [] }],
    acceptanceCriteria: ["Duplicate submissions run only once"],
    regressionStrategy: "Run original check and regression test",
    riskFlags: [],
    rollback: "Revert the repair commit",
    unansweredQuestions: [],
    assumptions: [],
    citedSourceIds: [],
    inspectedPaths: ["src/submit.js"],
    profileId: p.profile.id,
    profileDigest: hash(p.profile),
    policyVersion: p.policy.version,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    model: "fixture-model",
    resourceCap: { seconds: 120, attempts: 2 },
    status: "awaiting_approval",
    contextDigest: "context",
  };
  return { ...partial, digest: planDigest(partial) };
}
export async function seed(db: Database) {
  const p = project(),
    pl = plan(p);
  await db.put("t1", "project", p.id, p, p.id);
  await db.put("t1", "plan", pl.id, pl, p.id);
  await db.rows(
    "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,$4,$5)",
    [hash("admin-token"), "t1", "alice", "admin", "[]"],
  );
  await db.rows(
    "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,$4,$5)",
    [hash("runner-token"), "t1", "runner1", "runner", '["p1"]'],
  );
  return { p, pl };
}
export const patch =
  "diff --git a/src/submit.js b/src/submit.js\nindex 1111111..2222222 100644\n--- a/src/submit.js\n+++ b/src/submit.js\n@@ -1 +1 @@\n-export const enabled = false;\n+export const enabled = true;\n";
