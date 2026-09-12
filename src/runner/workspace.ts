import { mkdir, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { git } from "./process.js";
import {
  AppError,
  contained,
  excluded,
  safeRelative,
} from "../core/security.js";
/** Export regular tracked files using Git object reads. Never run repository checkout hooks or filters. */
export async function exportTree(
  repo: string,
  sha: string,
  destination: string,
) {
  if (!/^[a-f0-9]{40,64}$/.test(sha))
    throw new AppError("SHA", "Expected an immutable commit SHA");
  const tree = await git(repo, ["ls-tree", "-r", "-z", sha]);
  await mkdir(destination, { recursive: true });
  let total = 0;
  for (const row of tree.split("\0").filter(Boolean)) {
    const [meta, file] = row.split("\t");
    if (!file || !safeRelative(file))
      throw new AppError("PATH_ESCAPE", "Unsafe tree entry");
    if (!meta.startsWith("100"))
      throw new AppError(
        "TREE_TYPE",
        "Symlinks and submodules require a separately reviewed execution environment",
      );
    if (excluded(file)) continue;
    const size = Number(
      (await git(repo, ["cat-file", "-s", `${sha}:${file}`])).trim(),
    );
    total += size;
    if (size > 2_000_000 || total > 50_000_000)
      throw new AppError(
        "REPO_CAP",
        "Repository snapshot exceeds the configured 50 MB / 2 MB per file limits",
      );
    // Git blobs are bytes; text decoding would corrupt images. Use the object ID and binary process capture.
    const { blob } = await import("./workspace-blob.js");
    const content = await blob(repo, meta.split(" ")[2]);
    const target = await contained(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, {
      mode: meta.startsWith("100755") ? 0o755 : 0o644,
    });
  }
  await git(destination, ["init", "--quiet"]);
  await git(destination, ["config", "user.name", "ShadowQA"]);
  await git(destination, ["config", "user.email", "shadowqa@localhost"]);
  await git(destination, ["config", "core.autocrlf", "false"]);
  await git(destination, ["config", "core.fileMode", "false"]);
  await git(destination, ["add", "--all"]);
  await git(destination, [
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "ShadowQA isolated baseline",
  ]);
  return realpath(destination);
}
