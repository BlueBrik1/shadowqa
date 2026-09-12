import { describe, expect, test, afterEach } from "vitest";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  fixtureRepo,
  fixedModel,
  testProject,
  testStore,
} from "./individual-helpers.js";
import { Plan, type Plan as PlanType } from "../individual/core/contracts.js";
import {
  agentPrompt,
  checksPassed,
  freezeDiff,
  prepareWorkspace,
  reviewPatch,
  runChecks,
  verifyInFreshCopy,
  workRoot,
} from "../individual/core/execute.js";
import {
  commitToBranch,
  githubStatus,
  safeSummary,
} from "../individual/core/publish.js";
import {
  compilePlan,
  planDigest,
  planIsFresh,
  inspectRepo,
} from "../individual/core/plan.js";
import { backendFor, detectAll } from "../individual/core/backends.js";
import { Runner } from "../individual/core/runner.js";
import { git } from "../src/runner/process.js";
import { canonical, hash } from "../src/core/security.js";
import { forgetExecutables } from "../individual/core/executable.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function planFor(
  projectId: string,
  baseSha: string,
  overrides: Partial<PlanType> = {},
): PlanType {
  const draft = {
    id: "plan_test",
    projectId,
    version: 1,
    baseSha,
    backend: "opencode" as const,
    policyVersion: 1,
    model: "test-model",
    status: "approved" as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    contextDigest: "ctx",
    sources: [],
    objective: "Set the in-flight guard before the await",
    scope: "src/submit.js only",
    exclusions: [],
    affectedPaths: ["src/submit.js"],
    steps: [{ id: "guard", description: "Set pending = true", dependsOn: [] }],
    acceptanceCriteria: ["Duplicate submissions save once"],
    tests: [],
    unresolvedQuestions: [],
    risks: [],
    rollback: "Delete the ShadowQA branch",
    citedItemIds: [],
    inspectedPaths: ["src/submit.js"],
    ...overrides,
  };
  return Plan.parse({ ...draft, digest: planDigest(draft as any) });
}

describe("isolated execution", () => {
  test("the workspace is built from committed objects and leaves uncommitted work alone", async () => {
    const repo = await fixtureRepo({ dirty: true });
    cleanups.push(repo.cleanup);
    const project = testProject({
      repo: { path: repo.dir, defaultBranch: "main" },
    });
    const plan = planFor(project.id, repo.sha);
    const prepared = await prepareWorkspace(project, plan);
    cleanups.push(() =>
      rm(prepared.workspace, { recursive: true, force: true }),
    );

    expect(prepared.uncommitted).toBe(1);
    // The developer's own file still has their edit.
    expect(
      await readFile(path.join(repo.dir, "src", "submit.js"), "utf8"),
    ).toContain("WIP");
    // The isolated copy has the committed content, not the edit.
    expect(
      await readFile(path.join(prepared.workspace, "src", "submit.js"), "utf8"),
    ).not.toContain("WIP");
    expect(prepared.workspace.startsWith(workRoot())).toBe(true);
  });

  test("a patch is frozen from what the agent actually changed", async () => {
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const project = testProject({
      repo: { path: repo.dir, defaultBranch: "main" },
    });
    const plan = planFor(project.id, repo.sha);
    const prepared = await prepareWorkspace(project, plan);
    cleanups.push(() =>
      rm(prepared.workspace, { recursive: true, force: true }),
    );
    await writeFile(
      path.join(prepared.workspace, "src", "submit.js"),
      "export const guard = true;\n",
    );
    const diff = await freezeDiff(prepared.workspace);
    expect(diff).toContain("diff --git a/src/submit.js b/src/submit.js");
    expect(diff).toContain("+export const guard = true;");
    const review = reviewPatch(diff, project, plan);
    expect(review.files).toEqual(["src/submit.js"]);
    expect(review.added).toBe(1);
    expect(review.removed).toBe(1);
  });

  test("checks run against a fresh copy, not the agent's workspace", async () => {
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const project = testProject({
      repo: { path: repo.dir, defaultBranch: "main" },
      checks: [
        {
          id: "check",
          argv: ["node", "-e", "process.exit(0)"],
          timeoutSeconds: 30,
        },
      ],
      requiredChecks: ["check"],
    });
    const plan = planFor(project.id, repo.sha);
    const diff = [
      "diff --git a/src/submit.js b/src/submit.js",
      "--- a/src/submit.js",
      "+++ b/src/submit.js",
      "@@ -1 +1 @@",
      "-export const guard = false;",
      "+export const guard = true;",
      "",
    ].join("\n");
    const verification = await verifyInFreshCopy(project, plan, diff);
    cleanups.push(() =>
      rm(verification.verifyDir, { recursive: true, force: true }),
    );
    expect(
      await readFile(
        path.join(verification.verifyDir, "src", "submit.js"),
        "utf8",
      ),
    ).toContain("guard = true");
    expect(verification.checks[0].exitCode).toBe(0);
    expect(verification.unexpected).toEqual([]);
    expect(checksPassed(project, verification.checks).ok).toBe(true);
  });

  test("a failing required check is not reported as a pass", async () => {
    const project = testProject({
      checks: [
        {
          id: "check",
          argv: ["node", "-e", "process.exit(1)"],
          timeoutSeconds: 30,
        },
      ],
      requiredChecks: ["check"],
    });
    const verdict = checksPassed(project, [
      {
        id: "check",
        exitCode: 1,
        output: "boom",
        durationMs: 5,
        timedOut: false,
      },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.failed.map((c) => c.id)).toEqual(["check"]);
  });

  test("a required check that never ran fails the verdict", () => {
    const project = testProject({ requiredChecks: ["check", "types"] });
    const verdict = checksPassed(project, [
      { id: "check", exitCode: 0, output: "", durationMs: 1, timedOut: false },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toEqual(["types"]);
  });

  test("a check command that does not exist is a failure, not a crash", async () => {
    const project = testProject({
      checks: [
        {
          id: "check",
          argv: ["definitely-not-a-real-binary-xyz"],
          timeoutSeconds: 10,
        },
      ],
    });
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const results = await runChecks(project, repo.dir);
    expect(results[0].exitCode).toBe(-1);
    expect(results[0].output.length).toBeGreaterThan(0);
  });
});

describe("patch gates", () => {
  const project = testProject();
  const plan = planFor("demo", "a".repeat(40));

  test("a change outside the plan's files is refused", () => {
    const diff = [
      "diff --git a/src/other.js b/src/other.js",
      "--- a/src/other.js",
      "+++ b/src/other.js",
      "@@ -1 +1 @@",
      "-const a = 1;",
      "+const a = 2;",
    ].join("\n");
    expect(() => reviewPatch(diff, project, plan)).toThrow(
      /outside the approved plan/,
    );
  });

  test("deleting an assertion is refused outright", () => {
    const diff = [
      "diff --git a/src/submit.js b/src/submit.js",
      "--- a/src/submit.js",
      "+++ b/src/submit.js",
      "@@ -1,2 +1 @@",
      "-assert.equal(calls, 1);",
      "+// removed",
    ].join("\n");
    expect(() => reviewPatch(diff, project, plan)).toThrow(
      /removes a test or assertion/,
    );
  });

  test("binary changes, deletions and symlinks are refused", () => {
    for (const marker of [
      "GIT binary patch",
      "deleted file mode 100644",
      "new file mode 120000",
    ]) {
      const diff = [
        "diff --git a/src/submit.js b/src/submit.js",
        marker,
        "--- a/src/submit.js",
        "+++ b/src/submit.js",
      ].join("\n");
      expect(() => reviewPatch(diff, project, plan)).toThrow(/manual handling/);
    }
  });

  test("a rename is refused", () => {
    const diff =
      "diff --git a/src/submit.js b/src/submitter.js\n--- a/src/submit.js\n+++ b/src/submitter.js";
    expect(() => reviewPatch(diff, project, plan)).toThrow(/Renames/);
  });

  test("an empty patch is an error, not a silent success", () => {
    expect(() => reviewPatch("   \n", project, plan)).toThrow(/no changes/);
  });

  test("risky additions are flagged but not silently blocked", () => {
    const diff = [
      "diff --git a/src/submit.js b/src/submit.js",
      "--- a/src/submit.js",
      "+++ b/src/submit.js",
      "@@ -1 +1,2 @@",
      " export const guard = false;",
      "+const token = process.env.SECRET;",
    ].join("\n");
    expect(reviewPatch(diff, project, plan).risks).toContain(
      "sensitive-content",
    );
  });

  test("a patch bigger than the line cap is refused", () => {
    const body = Array.from({ length: 40 }, (_, i) => "+line " + i).join("\n");
    const diff = [
      "diff --git a/src/submit.js b/src/submit.js",
      "--- a/src/submit.js",
      "+++ b/src/submit.js",
      "@@ -1 +1,40 @@",
      body,
    ].join("\n");
    expect(() => reviewPatch(diff, testProject({ maxLines: 5 }), plan)).toThrow(
      /line cap/,
    );
  });
});

describe("publishing to a local branch", () => {
  test("a verified result becomes a branch without touching the working tree", async () => {
    const repo = await fixtureRepo({ dirty: true });
    cleanups.push(repo.cleanup);
    const project = testProject({
      repo: { path: repo.dir, defaultBranch: "main" },
    });
    const plan = planFor(project.id, repo.sha);
    const diff = [
      "diff --git a/src/submit.js b/src/submit.js",
      "--- a/src/submit.js",
      "+++ b/src/submit.js",
      "@@ -1 +1 @@",
      "-export const guard = false;",
      "+export const guard = true;",
      "",
    ].join("\n");
    const verification = await verifyInFreshCopy(project, plan, diff);
    cleanups.push(() =>
      rm(verification.verifyDir, { recursive: true, force: true }),
    );
    const task = {
      id: "11111111-2222-3333-4444-555555555555",
      projectId: project.id,
      planId: plan.id,
      kind: "plan" as const,
      state: "verifying" as const,
      backend: "opencode" as const,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const published = await commitToBranch(
      project,
      plan,
      task,
      verification.verifyDir,
      ["src/submit.js"],
    );
    expect(published.branch).toBe("shadowqa/11111111");

    // The developer's uncommitted edit survived, and HEAD did not move.
    expect(
      await readFile(path.join(repo.dir, "src", "submit.js"), "utf8"),
    ).toContain("WIP");
    expect((await git(repo.dir, ["rev-parse", "HEAD"])).trim()).toBe(repo.sha);
    expect((await git(repo.dir, ["status", "--porcelain"])).trim()).toContain(
      "src/submit.js",
    );

    // The branch holds the verified content.
    const branchContent = await git(repo.dir, [
      "show",
      `${published.branch}:src/submit.js`,
    ]);
    expect(branchContent).toContain("guard = true");
  });

  test("GitHub is reported as unconnected rather than assumed", () => {
    const withoutRemote = githubStatus(testProject());
    expect(withoutRemote.connected).toBe(false);
    expect(withoutRemote.reason).toMatch(/No GitHub remote/);
    const previous = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const withRemote = githubStatus(
      testProject({
        repo: {
          path: ".",
          defaultBranch: "main",
          remote: "https://github.com/a/b",
        },
      }),
    );
    expect(withRemote.connected).toBe(false);
    expect(withRemote.reason).toMatch(/GITHUB_TOKEN/);
    if (previous) process.env.GITHUB_TOKEN = previous;
  });

  test("the pull-request body carries verification metadata and no conversation text", () => {
    const plan = planFor("demo", "a".repeat(40));
    const summary = safeSummary(plan, {} as any, [
      { id: "check", exitCode: 0 },
    ]);
    expect(summary).toContain("plan_test");
    expect(summary).toContain("`check` exit 0");
    expect(summary).not.toContain("double-charge");
  });
});

describe("planning", () => {
  test("a plan that touches a path outside the allowed prefixes is refused", async () => {
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const store = await testStore();
    cleanups.push(() => store.db.close());
    const project = await store.putProject(
      testProject({ repo: { path: repo.dir, defaultBranch: "main" } }),
    );
    await store.putItem({
      id: "item_1",
      projectId: project.id,
      kind: "requirement",
      text: "guard duplicate submits",
      status: "confirmed",
      sources: ["s1"],
      conflictsWith: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedByUser: false,
    });
    const model = fixedModel({
      objective: "Rewrite the build",
      scope: "everything",
      exclusions: [],
      affectedPaths: [".github/workflows/ci.yml"],
      steps: [{ id: "a", description: "edit ci", dependsOn: [] }],
      acceptanceCriteria: ["ci passes"],
      tests: [],
      unresolvedQuestions: [],
      risks: [],
      rollback: "revert",
      citedItemIds: [],
      inspectedPaths: ["src/submit.js"],
    });
    await expect(compilePlan(store, model as any, project)).rejects.toThrow(
      /allowed paths/,
    );
  });

  test("a plan citing an item that does not exist is refused", async () => {
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const store = await testStore();
    cleanups.push(() => store.db.close());
    const project = await store.putProject(
      testProject({ repo: { path: repo.dir, defaultBranch: "main" } }),
    );
    await store.putItem({
      id: "item_real",
      projectId: project.id,
      kind: "requirement",
      text: "guard duplicate submits",
      status: "confirmed",
      sources: ["s1"],
      conflictsWith: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedByUser: false,
    });
    const model = fixedModel({
      objective: "Set the guard",
      scope: "src/submit.js",
      exclusions: [],
      affectedPaths: ["src/submit.js"],
      steps: [{ id: "a", description: "set flag", dependsOn: [] }],
      acceptanceCriteria: ["saves once"],
      tests: [],
      unresolvedQuestions: [],
      risks: [],
      rollback: "revert",
      citedItemIds: ["item_invented"],
      inspectedPaths: ["src/submit.js"],
    });
    await expect(compilePlan(store, model as any, project)).rejects.toThrow(
      /does not exist/,
    );
  });

  test("a plan stops being fresh when the repository moves past its base", async () => {
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const store = await testStore();
    cleanups.push(() => store.db.close());
    const project = await store.putProject(
      testProject({ repo: { path: repo.dir, defaultBranch: "main" } }),
    );
    const plan = planFor(project.id, repo.sha, {
      contextDigest: emptyContextDigest(),
    });
    expect((await planIsFresh(store, plan)).fresh).toBe(true);

    await writeFile(
      path.join(repo.dir, "src", "extra.js"),
      "export const x = 1;\n",
    );
    await git(repo.dir, ["add", "--all"]);
    await git(repo.dir, [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "move",
    ]);
    const after = await planIsFresh(store, plan);
    expect(after.fresh).toBe(false);
    expect(after.reason).toMatch(/moved past/);
  });

  test("a plan stops being fresh when the mode changes", async () => {
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const store = await testStore();
    cleanups.push(() => store.db.close());
    const project = await store.putProject(
      testProject({ repo: { path: repo.dir, defaultBranch: "main" } }),
    );
    const plan = await store.putPlan(
      planFor(project.id, repo.sha, { contextDigest: emptyContextDigest() }),
    );
    await store.updateProject(project.id, { mode: "full-auto" });
    const after = await planIsFresh(store, plan);
    expect(after.fresh).toBe(false);
    expect(after.reason).toMatch(/mode, backend or checks/);
    // The plan itself was superseded, so it cannot be approved later.
    expect((await store.plan(plan.id)).status).toBe("superseded");
  });

  test("repository inspection reports uncommitted work without including it", async () => {
    const repo = await fixtureRepo({ dirty: true });
    cleanups.push(repo.cleanup);
    const inspection = await inspectRepo(repo.dir, "submit");
    expect(inspection.dirty).toBe(true);
    expect(inspection.baseSha).toBe(repo.sha);
    expect(
      inspection.files.find((f) => f.path === "src/submit.js")?.text,
    ).not.toContain("WIP");
  });
});

describe("backends and the runner", () => {
  test("every backend reports availability with a reason when missing", async () => {
    const statuses = await detectAll();
    expect(statuses.map((s) => s.id).sort()).toEqual([
      "claude-code",
      "codex",
      "opencode",
    ]);
    for (const status of statuses)
      if (!status.available) expect(status.reason).toBeTruthy();
      else expect(status.version).toBeTruthy();
  });

  test("each backend names the exact command that reopens its session", () => {
    expect(backendFor("claude-code").attachCommand("/ws", "sess-1")).toBe(
      "claude --resume sess-1",
    );
    expect(backendFor("codex").attachCommand("/ws", "sess-1")).toBe(
      "codex resume sess-1",
    );
    expect(backendFor("opencode").attachCommand("/ws", "sess-1")).toContain(
      "-s sess-1",
    );
    expect(backendFor("opencode").attachCommand("/ws", "unknown")).toContain(
      "/ws",
    );
  });

  test("an unavailable backend leaves the task waiting instead of failing it", async () => {
    const store = await testStore();
    cleanups.push(() => store.db.close());
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const project = await store.putProject(
      testProject({
        repo: { path: repo.dir, defaultBranch: "main" },
        backend: "claude-code",
      }),
    );
    const plan = await store.putPlan(
      planFor(project.id, repo.sha, {
        backend: "claude-code",
        status: "approved",
        contextDigest: emptyContextDigest(),
      }),
    );
    const runner = new Runner(store);
    const task = await runner.enqueue(plan);
    // Force the backend to look missing by pointing the executable override at nothing.
    const previous = process.env.SHADOWQA_CLAUDE_EXE;
    process.env.SHADOWQA_CLAUDE_EXE = "definitely-not-a-real-binary-xyz";
    forgetExecutables();
    await (runner as any).tick();
    if (previous === undefined) delete process.env.SHADOWQA_CLAUDE_EXE;
    else process.env.SHADOWQA_CLAUDE_EXE = previous;
    forgetExecutables();
    const after = await store.task(task.id);
    expect(after.state).toBe("waiting_for_runner");
    expect(after.error).toMatch(/Claude Code/);
    await runner.stop();
  });

  test("cancelling an unstarted task marks it cancelled", async () => {
    const store = await testStore();
    cleanups.push(() => store.db.close());
    const repo = await fixtureRepo();
    cleanups.push(repo.cleanup);
    const project = await store.putProject(
      testProject({ repo: { path: repo.dir, defaultBranch: "main" } }),
    );
    const plan = await store.putPlan(
      planFor(project.id, repo.sha, { status: "approved" }),
    );
    const runner = new Runner(store);
    const task = await runner.enqueue(plan);
    expect(runner.cancel(task.id)).toBe(false);
    await store.patchTask(task.id, { state: "cancelled" });
    expect((await store.task(task.id)).state).toBe("cancelled");
    await runner.stop();
  });

  test("the agent prompt carries the plan and not the conversation", () => {
    const plan = planFor("demo", "a".repeat(40));
    const prompt = agentPrompt(plan, testProject());
    expect(prompt).toContain("Set the in-flight guard before the await");
    expect(prompt).toContain("src/submit.js");
    expect(prompt).toContain("Do not weaken, skip or delete existing tests");
    expect(prompt).not.toContain("double-charge");
  });
});

/** planIsFresh hashes the project's item list; with no items that is the digest of an empty array. */
function emptyContextDigest() {
  return hash(canonical([]));
}

describe("backend failure reporting", () => {
  test("OpenCode's zero exit code does not override an error event", async () => {
    const { opencodeError } = await import("../individual/core/backends.js");
    expect(
      opencodeError({
        name: "APIError",
        data: { message: "Incorrect API key provided", statusCode: 401 },
      }),
    ).toBe("APIError: Incorrect API key provided");
    expect(opencodeError(undefined)).toBeUndefined();
    expect(opencodeError("plain failure")).toBe("plain failure");
  });

  test("Codex's nested JSON error is unwrapped to the message a user can act on", async () => {
    const { codexError } = await import("../individual/core/backends.js");
    expect(
      codexError(
        JSON.stringify({
          type: "error",
          status: 400,
          error: {
            type: "invalid_request_error",
            message: "requires a newer version of Codex",
          },
        }),
      ),
    ).toBe("requires a newer version of Codex");
    expect(codexError("stream disconnected")).toBe("stream disconnected");
    expect(codexError(undefined)).toBeUndefined();
  });

  test("an npm shim resolves to the real target rather than being spawned as a .cmd", async () => {
    const { shimTarget } = await import("../individual/core/executable.js");
    const exeShim =
      '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*';
    expect(shimTarget(exeShim)).toBe(
      "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
    );
    // npm's Node-script shim names node.exe first; the script it launches is the real target.
    const jsShim =
      'IF EXIST "%dp0%\\node.exe" (\\n SET "_prog=%dp0%\\node.exe"\\n)\\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*';
    expect(shimTarget(jsShim)).toBe(
      "node_modules\\@openai\\codex\\bin\\codex.js",
    );
    expect(shimTarget("@ECHO off, no target here")).toBeUndefined();
  });
});
