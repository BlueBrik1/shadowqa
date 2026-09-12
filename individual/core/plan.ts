import {
  AppError,
  canonical,
  hash,
  sanitize,
} from "../../src/core/security.js";
import { git } from "../../src/runner/process.js";
import type { Model } from "../../src/model/gemini.js";
import {
  Plan,
  PlanOutput,
  type Backend,
  type ExtractedItem,
  type IndividualProject,
} from "./contracts.js";
import { groupItems } from "./extract.js";
import type { Store } from "./store.js";
import path from "node:path";
import { realpath } from "node:fs/promises";

export const PLANNER_SYSTEM = [
  "You turn a developer's captured project context plus the actual repository contents into one implementation plan.",
  "Confirmed requirements and decisions bind the plan. Suggestions do not.",
  "Every affected path must exist in the supplied repository file list, or be a new file inside an allowed prefix.",
  "Do not resolve a conflict or answer an open question: list it under unresolvedQuestions.",
  "Cite the context item ids the plan relies on. Cite nothing that was not supplied.",
  "Steps must be concrete edits a coding agent can perform in this repository.",
].join("\n");

export type Inspection = {
  root: string;
  baseSha: string;
  dirty: boolean;
  paths: string[];
  files: { path: string; text: string }[];
};

const TEXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|html|py|go|rs|java|rb|sql|sh|toml)$/i;
const FILE_CHARS = 6000;
const MAX_FILES = 14;

/**
 * Reads the repository at its current HEAD without touching the working tree. Uncommitted work is
 * reported, never included and never modified.
 */
export async function inspectRepo(
  repoPath: string,
  query: string,
  limit = MAX_FILES,
): Promise<Inspection> {
  const repo = await realpath(path.resolve(repoPath));
  const top = (await git(repo, ["rev-parse", "--show-toplevel"])).trim();
  if ((await realpath(top)).toLowerCase() !== repo.toLowerCase())
    throw new AppError("REPO", "Select the repository root folder");
  const baseSha = (
    await git(repo, ["rev-parse", "--verify", "HEAD^{commit}"])
  ).trim();
  const dirty = !!(await git(repo, ["status", "--porcelain"])).trim();
  const tree = await git(repo, ["ls-tree", "-r", "--name-only", "-z", baseSha]);
  const paths = tree.split("\0").filter(Boolean);

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  const score = (file: string) => {
    const lower = file.toLowerCase();
    let value = terms.reduce((n, t) => n + (lower.includes(t) ? 4 : 0), 0);
    if (/(^|\/)(src|lib|app)\//.test(lower)) value += 2;
    if (/\.(test|spec)\./.test(lower)) value += 1;
    if (/(^|\/)(readme|package\.json|tsconfig)/.test(lower)) value += 1;
    return value;
  };
  const chosen = paths
    .filter((p) => TEXT.test(p))
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.p.localeCompare(b.p))
    .slice(0, limit)
    .map((x) => x.p);

  const files: { path: string; text: string }[] = [];
  for (const file of chosen) {
    const size = Number(
      (await git(repo, ["cat-file", "-s", `${baseSha}:${file}`])).trim(),
    );
    if (size > 400_000) continue;
    const text = await git(repo, ["show", `${baseSha}:${file}`]);
    files.push({ path: file, text: sanitize(text).slice(0, FILE_CHARS) });
  }
  return { root: repo, baseSha, dirty, paths, files };
}

export function planDigest(plan: Omit<Plan, "digest">) {
  return hash(
    canonical({
      projectId: plan.projectId,
      objective: plan.objective,
      scope: plan.scope,
      steps: plan.steps,
      affectedPaths: plan.affectedPaths,
      acceptanceCriteria: plan.acceptanceCriteria,
      tests: plan.tests,
      baseSha: plan.baseSha,
      backend: plan.backend,
      policyVersion: plan.policyVersion,
      contextDigest: plan.contextDigest,
    }),
  );
}

export type CompileOptions = {
  objective?: string;
  query?: string;
  backend?: Backend;
  ttlMinutes?: number;
};

export async function compilePlan(
  store: Store,
  model: Model,
  project: IndividualProject,
  options: CompileOptions = {},
): Promise<Plan> {
  if (!project.repo?.path)
    throw new AppError(
      "NO_REPO",
      `Project '${project.id}' has no repository. Run: shadowqa-individual project repo ${project.id} <folder>`,
      409,
    );
  const items = await store.items(project.id);
  const usable = items.filter((i) => i.status !== "rejected");
  if (!usable.length)
    throw new AppError(
      "NO_ITEMS",
      "No extracted context yet. Run: shadowqa-individual extract " +
        project.id,
      409,
    );

  const query = options.query ?? options.objective ?? "";
  const inspection = await inspectRepo(project.repo.path, query);
  const grouped = groupItems(usable);
  const messages = await store.context(project.id, query, 40);

  const input = {
    objective: options.objective ?? "",
    repository: {
      baseSha: inspection.baseSha,
      files: inspection.files,
      allPaths: inspection.paths.slice(0, 600),
      allowedPaths: project.allowedPaths,
      protectedPaths: project.protectedPaths,
      checks: project.checks.map((c) => c.argv.join(" ")),
      uncommittedWorkPresent: inspection.dirty,
    },
    context: {
      requirements: describe(grouped.requirements),
      decisions: describe(grouped.decisions),
      suggestions: describe(grouped.suggestions),
      openQuestions: describe(grouped.questions),
      conflicts: describe(grouped.conflicts),
    },
    conversationExcerpts: messages
      .slice(0, 16)
      .map(
        (m) =>
          `${String(m.metadata?.role ?? "user").toUpperCase()}: ${m.text.slice(0, 1200)}`,
      ),
  };

  const output = await model.generate(
    store.tenant,
    project.id,
    PLANNER_SYSTEM,
    input,
    PlanOutput,
  );

  const ids = new Set(usable.map((i) => i.id));
  if (output.citedItemIds.some((id) => !ids.has(id)))
    throw new AppError(
      "CITATION",
      "Plan cited a context item that does not exist",
    );

  const known = new Set(inspection.paths);
  const allowed = (p: string) =>
    project.allowedPaths.some((prefix) =>
      prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix,
    );
  for (const p of output.affectedPaths) {
    if (!allowed(p))
      throw new AppError(
        "PATH_SCOPE",
        `Plan touches ${sanitize(p)}, outside the project's allowed paths`,
      );
    if (project.protectedPaths.some((prefix) => p.startsWith(prefix)))
      throw new AppError(
        "PATH_PROTECTED",
        `Plan touches protected path ${sanitize(p)}`,
      );
  }
  const unknownInspected = output.inspectedPaths.filter((p) => !known.has(p));
  if (unknownInspected.length === output.inspectedPaths.length)
    throw new AppError(
      "INSPECTION",
      "Plan claims to have inspected files that do not exist",
    );

  const contextDigest = hash(
    canonical(usable.map((i) => [i.id, i.text, i.status])),
  );
  const now = new Date();
  const previous = (await store.plans(project.id)).filter(
    (p) => p.projectId === project.id,
  );
  const draft = {
    ...output,
    id:
      "plan_" +
      hash({
        projectId: project.id,
        contextDigest,
        objective: output.objective,
        at: now.toISOString(),
      }).slice(0, 10),
    projectId: project.id,
    version: previous.length + 1,
    baseSha: inspection.baseSha,
    backend: options.backend ?? project.backend,
    policyVersion: project.policyVersion,
    model: model.name,
    status: "awaiting_approval" as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + (options.ttlMinutes ?? 60) * 60_000,
    ).toISOString(),
    contextDigest,
    sources: await Promise.all(
      output.citedItemIds.slice(0, 40).map(async (id) => {
        const item = usable.find((i) => i.id === id)!;
        const first = await store.message(item.sources[0]);
        return {
          id,
          origin: (first?.provider ??
            "chatgpt") as Plan["sources"][number]["origin"],
          url: first?.url ?? "",
          confirmed: item.status === "confirmed",
        };
      }),
    ),
  };
  const plan = Plan.parse({ ...draft, digest: planDigest(draft) });
  await store.putPlan(plan);
  await store.db.audit(store.tenant, "owner", "plan.compile", plan.id, {
    projectId: project.id,
    backend: plan.backend,
    baseSha: plan.baseSha,
  });
  return plan;
}

const describe = (items: ExtractedItem[]) =>
  items.map((i) => ({ id: i.id, status: i.status, text: i.text }));

/** A plan stops authorising work when its context, policy or base commit moves underneath it. */
export async function planIsFresh(store: Store, plan: Plan) {
  const project = await store.project(plan.projectId);
  if (project.policyVersion !== plan.policyVersion)
    return {
      fresh: false,
      reason: "The project's mode, backend or checks changed.",
    };
  if (Date.parse(plan.expiresAt) < Date.now())
    return { fresh: false, reason: "The plan expired." };
  const items = (await store.items(plan.projectId)).filter(
    (i) => i.status !== "rejected",
  );
  const digest = hash(canonical(items.map((i) => [i.id, i.text, i.status])));
  if (digest !== plan.contextDigest)
    return {
      fresh: false,
      reason: "Project context changed after the plan was compiled.",
    };
  if (project.repo?.path) {
    const head = (
      await git(await realpath(path.resolve(project.repo.path)), [
        "rev-parse",
        "HEAD",
      ])
    ).trim();
    if (head !== plan.baseSha)
      return {
        fresh: false,
        reason: "The repository moved past the plan's base commit.",
      };
  }
  return { fresh: true, reason: "" };
}
