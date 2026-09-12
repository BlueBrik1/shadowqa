import type { Database } from "../db/database.js";
import type { Plan, Project } from "../core/contracts.js";
import {
  AppError,
  hash,
  inPaths,
  safeRelative,
  sanitize,
} from "../core/security.js";
export function planDigest(plan: Omit<Plan, "digest"> | Plan) {
  const { digest: _, status: __, ...content } = plan as Plan;
  return hash(content);
}
export function pathRisks(paths: string[]) {
  const flags = new Set<string>();
  for (const p of paths) {
    if (
      /(^|\/)(auth|authorization|billing|payments?|migrations?|infra|terraform|secrets?)(\/|\.)|\.github\/|Dockerfile|\.env|package(?:-lock)?\.json|[\w-]*lock\.(yaml|json)|(^|\/)opencode\./i.test(
        p,
      )
    )
      flags.add("sensitive-path");
    if (/(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\./.test(p))
      flags.add("test-change");
  }
  return [...flags];
}
export function validatePlan(plan: Plan, project: Project, paths?: string[]) {
  if (planDigest(plan) !== plan.digest)
    throw new AppError("PLAN_DIGEST", "Plan digest mismatch");
  if (
    plan.repositoryId !== project.repository.id ||
    plan.projectId !== project.id
  )
    throw new AppError("PLAN_SCOPE", "Repository mismatch");
  if (plan.status === "superseded" || Date.parse(plan.expiresAt) <= Date.now())
    throw new AppError("STALE_PLAN", "Plan expired or was superseded");
  if (
    plan.policyVersion !== project.policy.version ||
    plan.profileDigest !== hash(project.profile)
  )
    throw new AppError(
      "STALE_POLICY",
      "Policy or command profile changed; compile again",
    );
  if (plan.unansweredQuestions.length)
    throw new AppError(
      "UNRESOLVED",
      "Resolve plan questions and compile again",
    );
  if (!project.profile.reviewed || !project.profile.externalInferenceApproved)
    throw new AppError(
      "PROFILE_REVIEW",
      "Administrator must review the execution profile and approve Gemini inference",
    );
  if (
    !plan.expectedPaths.every(
      (p) =>
        safeRelative(p) &&
        inPaths(p, project.profile.allowedPaths) &&
        !inPaths(p, project.profile.protectedPaths),
    )
  )
    throw new AppError(
      "PATH_SCOPE",
      "Plan touches paths outside the approved profile",
    );
  if (paths && plan.inspectedPaths.some((p) => !paths.includes(p)))
    throw new AppError(
      "UNGROUNDED",
      "Plan cites files that were not inspected",
    );
  const seen = new Set<string>();
  for (const step of plan.steps) {
    if (seen.has(step.id) || step.dependsOn.some((x) => !seen.has(x)))
      throw new AppError(
        "DEPENDENCIES",
        "Steps must have unique IDs and ordered acyclic dependencies",
      );
    seen.add(step.id);
  }
}
export async function fresh(
  db: Database,
  tenant: string,
  plan: Plan,
  project: Project,
) {
  validatePlan(plan, project);
  for (const source of plan.sources) {
    const s = await db.one(
      "SELECT revision,deleted,confirmed FROM source_documents WHERE tenant=$1 AND project_id=$2 AND id=$3",
      [tenant, project.id, source.id],
    );
    if (
      !s ||
      s.deleted ||
      s.revision !== source.revision ||
      s.confirmed !== source.confirmed
    )
      throw new AppError(
        "STALE_SOURCE",
        "Source context changed; compile again",
      );
  }
  if (await db.get(tenant, "control", "kill"))
    throw new AppError("KILL_SWITCH", "Workspace kill switch is active");
}
export function canAuto(plan: Plan, project: Project) {
  return (
    ["auto-fix", "full-auto"].includes(project.policy.mode) &&
    !plan.riskFlags.length &&
    !pathRisks(plan.expectedPaths).length &&
    plan.expectedPaths.every((p) => inPaths(p, project.profile.autoPaths))
  );
}
export type PatchInfo = {
  files: string[];
  added: number;
  removed: number;
  risks: string[];
};
export function validatePatch(
  diff: string,
  plan: Plan,
  project: Project,
): PatchInfo {
  if (sanitize(diff) !== diff)
    throw new AppError(
      "PATCH_SECRET",
      "Patch contains a possible secret or terminal control sequence",
    );
  const files: string[] = [];
  let added = 0,
    removed = 0;
  const risks = new Set<string>();
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!m || m[1] !== m[2] || !safeRelative(m[2]))
        throw new AppError(
          "PATCH_FORMAT",
          "Renames, quoted paths, and invalid paths require manual handling",
        );
      files.push(m[2]);
    }
    if (
      /^new file mode (120000|160000)|^old mode|^new mode|^GIT binary patch|^Binary files|^deleted file mode/.test(
        line,
      )
    )
      throw new AppError(
        "PATCH_KIND",
        "Symlinks, submodules, binary changes, deletions, or mode changes require manual handling",
      );
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++;
      if (
        /(?:\.skip\(|\.only\(|@ts-ignore|eslint-disable|process\.env|child_process|eval\(|exec\(|https?:\/\/)/.test(
          line,
        )
      )
        risks.add("sensitive-content");
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      removed++;
      if (/assert|expect\(|test\(|it\(|describe\(/.test(line))
        throw new AppError(
          "TEST_WEAKENING",
          "Patch removes a test or assertion; human review outside automated publication is required",
        );
    }
  }
  if (!files.length)
    throw new AppError("EMPTY_PATCH", "Agent produced no patch");
  if (
    files.length > project.profile.maxFiles ||
    added + removed > project.profile.maxLines
  )
    throw new AppError("PATCH_CAP", "Patch exceeds approved size");
  for (const p of files)
    if (
      !plan.expectedPaths.includes(p) ||
      !inPaths(p, project.profile.allowedPaths) ||
      inPaths(p, project.profile.protectedPaths)
    )
      throw new AppError("PATCH_SCOPE", `Unexpected or protected path: ${p}`);
  pathRisks(files).forEach((r) => risks.add(r));
  return { files, added, removed, risks: [...risks] };
}
