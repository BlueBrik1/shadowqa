import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { exportTree } from "../../src/runner/workspace.js";
import { git, run } from "../../src/runner/process.js";
import { AppError, sanitize, safeRelative } from "../../src/core/security.js";
import { backendFor } from "./backends.js";
import { resolveExecutable } from "./executable.js";
import type { IndividualProject, Plan, Task } from "./contracts.js";
import type { Store } from "./store.js";

export const workRoot = () =>
  process.env.SHADOWQA_INDIVIDUAL_HOME ??
  path.join(os.homedir(), ".shadowqa-individual");

const suffix = () => randomBytes(4).toString("hex");

/**
 * Builds the prompt the coding agent receives. It contains the plan and nothing else:
 * conversation text stays out of the agent's context unless the plan quotes it.
 */
export function agentPrompt(plan: Plan, project: IndividualProject) {
  return [
    "You are completing one approved implementation plan in this repository.",
    "",
    "OBJECTIVE",
    plan.objective,
    "",
    "SCOPE",
    plan.scope,
    plan.exclusions.length
      ? "\nOUT OF SCOPE\n" + plan.exclusions.map((e) => "- " + e).join("\n")
      : "",
    "",
    "STEPS",
    plan.steps
      .map(
        (s, i) =>
          `${i + 1}. ${s.description}${s.dependsOn.length ? ` (after ${s.dependsOn.join(", ")})` : ""}`,
      )
      .join("\n"),
    "",
    "FILES YOU MAY CHANGE",
    plan.affectedPaths.map((p) => "- " + p).join("\n"),
    "",
    "ACCEPTANCE CRITERIA",
    plan.acceptanceCriteria.map((a) => "- " + a).join("\n"),
    plan.tests.length
      ? "\nTESTS\n" + plan.tests.map((t) => "- " + t).join("\n")
      : "",
    "",
    "RULES",
    "- Change only the files listed above.",
    "- Do not weaken, skip or delete existing tests or assertions.",
    `- Do not touch: ${project.protectedPaths.join(", ") || "(none configured)"}.`,
    "- If the plan cannot be completed as written, stop and explain why instead of improvising.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Creates an isolated copy of the repository at the plan's base commit. The developer's own
 * clone — including anything uncommitted — is never written to.
 */
export async function prepareWorkspace(project: IndividualProject, plan: Plan) {
  if (!project.repo?.path)
    throw new AppError("NO_REPO", "Project has no repository");
  const repo = path.resolve(project.repo.path);
  const dirty = (await git(repo, ["status", "--porcelain"])).trim();
  const workspace = path.join(
    workRoot(),
    "work",
    `${plan.projectId}-${suffix()}`,
  );
  await mkdir(path.dirname(workspace), { recursive: true });
  await exportTree(repo, plan.baseSha, workspace);
  return {
    workspace,
    uncommitted: dirty ? dirty.split("\n").length : 0,
  };
}

export type Check = {
  id: string;
  exitCode: number;
  output: string;
  durationMs: number;
  timedOut: boolean;
};

export async function runChecks(
  project: IndividualProject,
  workspace: string,
  signal?: AbortSignal,
): Promise<Check[]> {
  const results: Check[] = [];
  for (const check of project.checks) {
    const [name, ...args] = check.argv;
    // Shell-less spawning means a Windows `.cmd` shim has to be resolved to its real target.
    const exe = await resolveExecutable(name);
    const result = await run(exe.command, [...exe.prefix, ...args], {
      cwd: workspace,
      timeoutMs: check.timeoutSeconds * 1000,
      signal,
      maxOutput: 4_000_000,
    }).catch((e) => ({
      code: -1,
      stdout: "",
      stderr: String(e?.message ?? e),
      timedOut: false,
      durationMs: 0,
    }));
    results.push({
      id: check.id,
      exitCode: result.code,
      output: sanitize(result.stdout + result.stderr).slice(-60_000),
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    });
  }
  return results;
}

/** Freezes what the agent actually changed in the isolated workspace. */
export async function freezeDiff(workspace: string) {
  await git(workspace, ["add", "--all"]);
  const diff = await git(workspace, [
    "-c",
    "core.autocrlf=false",
    "diff",
    "--cached",
    "--no-color",
    "--no-ext-diff",
    "--unified=3",
  ]);
  return diff;
}

export type PatchReview = {
  files: string[];
  added: number;
  removed: number;
  risks: string[];
};

/**
 * The same deterministic gates the business policy engine applies, minus the GitHub-specific
 * parts: scope, size, secrets, and test weakening.
 */
export function reviewPatch(
  diff: string,
  project: IndividualProject,
  plan: Plan,
): PatchReview {
  if (!diff.trim())
    throw new AppError("EMPTY_PATCH", "The agent produced no changes");
  if (sanitize(diff) !== diff)
    throw new AppError(
      "PATCH_SECRET",
      "Patch contains a possible secret or control sequence",
    );
  const files: string[] = [];
  const risks = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!match || match[1] !== match[2] || !safeRelative(match[2]))
        throw new AppError(
          "PATCH_FORMAT",
          "Renames and unusual paths require manual handling",
        );
      files.push(match[2]);
    }
    if (
      /^new file mode (120000|160000)|^GIT binary patch|^Binary files|^deleted file mode/.test(
        line,
      )
    )
      throw new AppError(
        "PATCH_KIND",
        "Symlinks, submodules, binary changes and deletions require manual handling",
      );
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++;
      if (
        /(\.skip\(|\.only\(|@ts-ignore|eslint-disable|child_process|eval\(|process\.env)/.test(
          line,
        )
      )
        risks.add("sensitive-content");
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      removed++;
      if (/assert|expect\(|\bit\(|\btest\(|describe\(/.test(line))
        throw new AppError(
          "TEST_WEAKENING",
          "Patch removes a test or assertion; that needs a human, not an automatic merge",
        );
    }
  }
  const outside = files.filter((f) => !plan.affectedPaths.includes(f));
  if (outside.length)
    throw new AppError(
      "PATCH_SCOPE",
      "Patch changes files outside the approved plan: " +
        outside.slice(0, 5).join(", "),
    );
  if (files.some((f) => project.protectedPaths.some((p) => f.startsWith(p))))
    risks.add("protected-path");
  if (files.length > project.maxFiles)
    throw new AppError("PATCH_SIZE", "Patch exceeds the file cap");
  if (added + removed > project.maxLines)
    throw new AppError("PATCH_SIZE", "Patch exceeds the line cap");
  return { files, added, removed, risks: [...risks] };
}

/** Applies a frozen patch to a fresh copy so the checks never run in the agent's own workspace. */
export async function verifyInFreshCopy(
  project: IndividualProject,
  plan: Plan,
  diff: string,
  signal?: AbortSignal,
) {
  const verifyDir = path.join(
    workRoot(),
    "verify",
    `${plan.projectId}-${suffix()}`,
  );
  await mkdir(path.dirname(verifyDir), { recursive: true });
  await exportTree(path.resolve(project.repo!.path), plan.baseSha, verifyDir);
  const apply = await run(
    "git",
    ["-C", verifyDir, "apply", "--whitespace=nowarn", "-"],
    {
      input: diff,
      timeoutMs: 60_000,
    },
  );
  if (apply.code !== 0)
    throw new AppError(
      "PATCH_APPLY",
      "Frozen patch did not apply to a clean copy: " +
        sanitize(apply.stderr).slice(0, 400),
    );
  const checks = await runChecks(project, verifyDir, signal);
  // Porcelain v1 puts two status characters and a space before the path; the leading space on an
  // unstaged change must survive, so the output is split before it is trimmed.
  const touched = (await git(verifyDir, ["status", "--porcelain"]))
    .split("\n")
    .map((raw) => raw.replace(/\r$/, ""))
    .filter((raw) => raw.length > 3)
    .map((raw) =>
      raw.slice(3).replace(/^"|"$/g, "").split(" -> ").pop()!.trim(),
    );
  const unexpected = touched.filter((f) => !plan.affectedPaths.includes(f));
  return { verifyDir, checks, unexpected };
}

export async function discardWorkspace(dir: string) {
  if (!dir.startsWith(workRoot())) return;
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** A task is only "done" when every required check actually exited zero. */
export function checksPassed(project: IndividualProject, checks: Check[]) {
  const required = project.requiredChecks.length
    ? project.requiredChecks
    : project.checks.map((c) => c.id);
  const missing = required.filter((id) => !checks.some((c) => c.id === id));
  const failed = checks.filter(
    (c) => required.includes(c.id) && (c.exitCode !== 0 || c.timedOut),
  );
  return { ok: !missing.length && !failed.length, missing, failed };
}

export async function executePlan(
  store: Store,
  project: IndividualProject,
  plan: Plan,
  task: Task,
  signal: AbortSignal,
  onEvent: (kind: string, text: string) => void,
) {
  const adapter = backendFor(plan.backend);
  const status = await adapter.detect();
  if (!status.available)
    throw new AppError(
      "BACKEND_OFFLINE",
      `${adapter.label} is not available. ${status.reason ?? ""}`.trim(),
      503,
    );

  const prepared = await prepareWorkspace(project, plan);
  onEvent("preparing", `Isolated workspace at ${prepared.workspace}`);
  if (prepared.uncommitted)
    onEvent(
      "preparing",
      `${prepared.uncommitted} uncommitted change(s) in your clone were left untouched.`,
    );
  await store.patchTask(task.id, {
    state: "running",
    workspace: prepared.workspace,
  });

  const result = await adapter.execute({
    workspace: prepared.workspace,
    prompt: agentPrompt(plan, project),
    timeoutSeconds: 1800,
    signal,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    onEvent: (event) => onEvent(event.kind, event.text),
  });
  await store.patchTask(task.id, {
    sessionRef: result.sessionRef,
    state: "verifying",
  });
  onEvent("session", result.attach);
  if (result.error) onEvent("agent-error", result.error);

  const diff = await freezeDiff(prepared.workspace);
  const review = reviewPatch(diff, project, plan);
  onEvent(
    "verifying",
    `${review.files.length} file(s), +${review.added}/-${review.removed}${review.risks.length ? ", risks: " + review.risks.join(", ") : ""}`,
  );
  const verification = await verifyInFreshCopy(project, plan, diff, signal);
  const verdict = checksPassed(project, verification.checks);
  return {
    workspace: prepared.workspace,
    verifyDir: verification.verifyDir,
    sessionRef: result.sessionRef,
    attach: result.attach,
    agentReportedSuccess: result.ok,
    agentError: result.error,
    diff,
    review,
    checks: verification.checks,
    unexpected: verification.unexpected,
    verdict,
    log: result.log,
  };
}
