import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { run, git } from "../../src/runner/process.js";
import { AppError, sanitize } from "../../src/core/security.js";
import type { IndividualProject, Plan, Task } from "./contracts.js";

/**
 * Writes the verified result into the developer's repository as a new branch built from Git
 * objects. It never checks anything out, never touches the index, and therefore never disturbs
 * uncommitted work — the same guarantee the business publisher gives for GitHub branches.
 */
export async function commitToBranch(
  project: IndividualProject,
  plan: Plan,
  task: Task,
  verifiedDir: string,
  files: string[],
) {
  const repo = path.resolve(project.repo!.path);
  const branch = `shadowqa/${task.id.slice(0, 8)}`;
  const indexDir = await mkdtemp(path.join(tmpdir(), "shadowqa-index-"));
  const indexFile = path.join(indexDir, "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    await git(repo, ["read-tree", plan.baseSha], { env });
    for (const file of files) {
      const source = path.join(verifiedDir, file);
      const info = await stat(source).catch(() => undefined);
      if (!info?.isFile())
        throw new AppError(
          "PUBLISH",
          `Verified copy is missing ${sanitize(file)}`,
        );
      const write = await run(
        "git",
        ["-C", repo, "hash-object", "-w", "--stdin"],
        { input: await readFile(source), timeoutMs: 30_000, env },
      );
      if (write.code !== 0)
        throw new AppError(
          "PUBLISH",
          "Could not write a Git object for " + sanitize(file),
        );
      const blob = write.stdout.trim();
      const mode =
        process.platform === "win32" || !(info.mode & 0o111)
          ? "100644"
          : "100755";
      await git(
        repo,
        ["update-index", "--add", "--cacheinfo", `${mode},${blob},${file}`],
        { env },
      );
    }
    const tree = (await git(repo, ["write-tree"], { env })).trim();
    const message = [
      plan.objective.slice(0, 72),
      "",
      `Plan: ${plan.id}`,
      `Base: ${plan.baseSha}`,
      `Backend: ${plan.backend}`,
      `Verified by ShadowQA Individual (task ${task.id}).`,
    ].join("\n");
    const commit = (
      await run(
        "git",
        [
          "-C",
          repo,
          "-c",
          "user.name=ShadowQA",
          "-c",
          "user.email=shadowqa@localhost",
          "-c",
          "commit.gpgsign=false",
          "commit-tree",
          tree,
          "-p",
          plan.baseSha,
          "-m",
          message,
        ],
        { timeoutMs: 30_000, env },
      )
    ).stdout.trim();
    if (!/^[a-f0-9]{40,64}$/.test(commit))
      throw new AppError("PUBLISH", "commit-tree returned no commit");
    await git(repo, ["update-ref", `refs/heads/${branch}`, commit], { env });
    return { branch, commit };
  } finally {
    await rm(indexDir, { recursive: true, force: true }).catch(() => {});
  }
}

export type GithubStatus = {
  connected: boolean;
  reason?: string;
  remote?: string;
};

export function githubStatus(project: IndividualProject): GithubStatus {
  if (!project.repo?.remote)
    return {
      connected: false,
      reason: "No GitHub remote configured for this project.",
    };
  if (!process.env.GITHUB_TOKEN)
    return {
      connected: false,
      remote: project.repo.remote,
      reason:
        "Set GITHUB_TOKEN to a token with 'repo' scope to open pull requests.",
    };
  return { connected: true, remote: project.repo.remote };
}

const slug = (remote: string) => {
  const match = remote.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
  );
  if (!match)
    throw new AppError("REMOTE", "Only github.com remotes are supported");
  return { owner: match[1], repo: match[2] };
};

/** Pushes the ShadowQA branch and opens one pull request. Only runs when the user asks. */
export async function openPullRequest(
  project: IndividualProject,
  plan: Plan,
  branch: string,
  summary: string,
  fetcher: typeof fetch = fetch,
) {
  const status = githubStatus(project);
  if (!status.connected)
    throw new AppError(
      "GITHUB",
      status.reason ?? "GitHub is not connected",
      409,
    );
  const { owner, repo } = slug(project.repo!.remote!);
  const push = await run(
    "git",
    [
      "-C",
      path.resolve(project.repo!.path),
      "push",
      "--set-upstream",
      "origin",
      `refs/heads/${branch}:refs/heads/${branch}`,
    ],
    { timeoutMs: 120_000 },
  );
  if (push.code !== 0)
    throw new AppError(
      "GITHUB",
      "git push failed: " + sanitize(push.stderr).slice(0, 400),
    );
  const response = await fetcher(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + process.env.GITHUB_TOKEN,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: plan.objective.slice(0, 120),
        head: branch,
        base: project.repo!.defaultBranch,
        body: summary,
        draft: false,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new AppError(
      "GITHUB",
      `GitHub refused the pull request (${response.status}): ${sanitize(await response.text()).slice(0, 300)}`,
    );
  const body: any = await response.json();
  return { url: String(body.html_url), number: Number(body.number) };
}

/** The PR body: verification metadata only, never conversation text. */
export function safeSummary(
  plan: Plan,
  task: Task,
  checks: { id: string; exitCode: number }[],
) {
  return [
    "Automated change verified by ShadowQA Individual.",
    "",
    `- Plan: \`${plan.id}\` (digest \`${plan.digest.slice(0, 16)}\`)`,
    `- Task: \`${task.id}\``,
    `- Base commit: \`${plan.baseSha}\``,
    `- Backend: \`${plan.backend}\``,
    `- Files: ${plan.affectedPaths.map((p) => "`" + p + "`").join(", ")}`,
    "",
    "Checks run independently on a fresh copy of the base commit with the patch applied:",
    ...checks.map((c) => `- \`${c.id}\` exit ${c.exitCode}`),
    "",
    "Acceptance criteria:",
    ...plan.acceptanceCriteria.map((a) => "- " + a),
    plan.unresolvedQuestions.length
      ? "\nUnresolved questions:\n" +
        plan.unresolvedQuestions.map((q) => "- " + q).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
