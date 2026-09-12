import { realpath } from "node:fs/promises";
import { git } from "../runner/process.js";
import {
  AppError,
  excluded,
  safeRelative,
  sanitize,
} from "../core/security.js";
import type { Project } from "../core/contracts.js";
export type Inspection = {
  baseSha: string;
  files: { path: string; text: string }[];
  paths: string[];
  dirty: boolean;
};
export async function inspect(
  project: Project,
  query = "",
): Promise<Inspection> {
  const repo = await realpath(project.repository.localPath);
  const root = (await git(repo, ["rev-parse", "--show-toplevel"])).trim();
  if ((await realpath(root)).toLowerCase() !== repo.toLowerCase())
    throw new AppError("REPO_MAPPING", "Mapping must name the repository root");
  const remote = (await git(repo, ["remote", "get-url", "origin"])).trim();
  const expected =
    `${project.repository.owner}/${project.repository.name}`.toLowerCase();
  const match = remote.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^\s]+?)(?:\.git)?$/,
  );
  if (!match || match[1].toLowerCase() !== expected)
    throw new AppError(
      "REPO_MAPPING",
      "Local origin does not match the configured GitHub repository",
    );
  const ref = `refs/remotes/origin/${project.repository.defaultBranch}`;
  const baseSha = (
    await git(repo, ["rev-parse", "--verify", ref + "^{commit}"])
  ).trim();
  const dirty = !!(await git(repo, ["status", "--porcelain"])).trim();
  const tree = await git(repo, ["ls-tree", "-r", "-z", baseSha]);
  const paths = tree
    .split("\0")
    .filter(Boolean)
    .flatMap((line) => {
      const [meta, p] = line.split("\t");
      return meta?.startsWith("100") && p && safeRelative(p) && !excluded(p)
        ? [p]
        : [];
    });
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  const ranked = [...paths].sort((a, b) => score(b, words) - score(a, words));
  const files: Inspection["files"] = [];
  let total = 0;
  for (const p of ranked.slice(0, 60)) {
    if (!/\.(?:[cm]?[jt]sx?|json|md|ya?ml)$/.test(p)) continue;
    const size = Number(
      (await git(repo, ["cat-file", "-s", `${baseSha}:${p}`])).trim(),
    );
    if (size > 30_000 || total + size > 100_000) continue;
    const text = sanitize(await git(repo, ["show", `${baseSha}:${p}`]));
    if (text.includes("\0")) continue;
    files.push({ path: p, text });
    total += size;
  }
  if (!files.length)
    throw new AppError(
      "INSPECTION",
      "No eligible TypeScript/JavaScript source or tests at the configured base",
    );
  return { baseSha, files, paths, dirty };
}
function score(p: string, words: string[]) {
  return (
    words.filter((w) => p.toLowerCase().includes(w)).length * 10 +
    (/test|spec/.test(p) ? 3 : 0) +
    (p === "package.json" ? 5 : 0) +
    (p.startsWith("src/") ? 2 : 0)
  );
}
