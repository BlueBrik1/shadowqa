import { mkdtemp, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { git } from "../src/runner/process.js";
export async function fixture() {
  await mkdir(".shadowqa", { recursive: true });
  const repo = await mkdtemp(path.resolve(".shadowqa/fixture-"));
  await cp(path.resolve("fixtures/duplicate-submit"), repo, {
    recursive: true,
  });
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ShadowQA Fixture"]);
  await git(repo, ["config", "user.email", "fixture@localhost"]);
  await git(repo, ["config", "core.autocrlf", "false"]);
  await git(repo, ["add", "--all"]);
  await git(repo, [
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Planted regression fixture",
  ]);
  await git(repo, [
    "remote",
    "add",
    "origin",
    "https://github.com/test/fixture.git",
  ]);
  const sha = (await git(repo, ["rev-parse", "HEAD"])).trim();
  await git(repo, ["update-ref", "refs/remotes/origin/main", sha]);
  return { repo, sha };
}
