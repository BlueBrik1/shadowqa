import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Database } from "../db/database.js";
import type { Job, Plan } from "../core/contracts.js";
import { AppError, hash, contained, sanitize } from "../core/security.js";
import { fresh, validatePatch, canAuto } from "../policy/engine.js";
import { GitHub } from "../adapters/github.js";
import { git } from "../runner/process.js";
import { exportTree } from "../runner/workspace.js";
export class Publisher {
  constructor(
    private db: Database,
    private tenant: string,
    private github: GitHub,
  ) {}
  async publish(jobId: string) {
    // A database row lock serializes publication and revocation with the same job.
    return this.db.tx(async (db) => {
      const target = await db.one<Job>(
        "SELECT * FROM jobs WHERE tenant=$1 AND id=$2",
        [this.tenant, jobId],
      );
      if (!target) throw new AppError("JOB_MISSING", "Job not found");
      await db.rows(
        "SELECT id FROM entities WHERE tenant=$1 AND kind='project' AND id=$2 FOR UPDATE",
        [this.tenant, target.project_id],
      );
      const job = await db.one<Job>(
        "SELECT * FROM jobs WHERE tenant=$1 AND id=$2 FOR UPDATE",
        [this.tenant, jobId],
      );
      if (!job) throw new AppError("JOB_MISSING", "Job not found");
      if (job.state === "pr_open") return job.data.pr;
      if (job.state !== "ready_to_publish" || !job.data.verified)
        throw new AppError(
          "UNVERIFIED",
          "Job is not verified and ready to publish",
        );
      const project = await db.project(this.tenant, job.project_id),
        plan = await db.get<Plan>(this.tenant, "plan", job.plan_id!);
      if (!plan) throw new AppError("PLAN_MISSING", "Plan missing");
      await fresh(db, this.tenant, plan, project);
      const actor = await db.one(
        "SELECT role,projects FROM credentials WHERE tenant=$1 AND actor_id=$2 AND revoked=false FOR SHARE",
        [this.tenant, job.data.authorizedBy],
      );
      if (
        !actor ||
        (actor.role !== "admin" && !actor.projects.includes(project.id))
      )
        throw new AppError(
          "ACTOR_REVOKED",
          "Authorizing actor no longer has repository access",
        );
      const artifact = await db.get<any>(
        this.tenant,
        "artifact",
        job.data.artifactId,
      );
      if (!artifact || hash(artifact.diff) !== job.data.diffDigest)
        throw new AppError("ARTIFACT_DIGEST", "Artifact is missing or changed");
      const patch = validatePatch(artifact.diff, plan, project);
      if (job.data.automatic && (!canAuto(plan, project) || patch.risks.length))
        throw new AppError(
          "REVIEW_REQUIRED",
          "Automatic scope no longer permits this patch",
        );
      if (!project.policy.summaryApproved)
        throw new AppError(
          "PUBLICATION_SUMMARY",
          "Approve a safe publication summary in the project policy first",
        );
      if (
        sanitize(project.policy.publishSummary) !==
        project.policy.publishSummary
      )
        throw new AppError(
          "SUMMARY_SECRET",
          "Publication summary contains a possible secret",
        );
      const root = this.github.root(project),
        head = await this.github.head(project);
      if (head !== plan.baseSha)
        throw new AppError(
          "STALE_BASE",
          "Default branch changed after planning; compile and verify again",
        );
      const repo = await this.github.request(project, root);
      if (
        repo.id !== project.repository.githubId ||
        (repo.private ? "private" : "public") !== project.repository.visibility
      )
        throw new AppError(
          "REPOSITORY_CHANGED",
          "Repository visibility or identity changed",
        );
      const branch = `shadowqa/${job.id}`,
        marker = `<!-- shadowqa-job:${job.id} -->`;
      const prs = await this.github.pages(
        project,
        `${root}/pulls?state=all&head=${encodeURIComponent(project.repository.owner + ":" + branch)}`,
      );
      let pr = prs.find((pr) => pr.body?.includes(marker));
      {
        const temp = await mkdtemp(path.join(os.tmpdir(), "shadowqa-publish-"));
        try {
          await exportTree(project.repository.localPath, plan.baseSha, temp);
          await git(temp, ["apply", "--check", "--whitespace=error", "-"], {
            input: artifact.diff,
          });
          await git(temp, ["apply", "--whitespace=error", "-"], {
            input: artifact.diff,
          });
          const tree = [];
          for (const file of patch.files) {
            const content = await readFile(await contained(temp, file));
            if (content.includes(0))
              throw new AppError(
                "BINARY_PATCH",
                "Binary files cannot be published",
              );
            const blob = await this.github.request(
              project,
              root + "/git/blobs",
              "POST",
              { content: content.toString("base64"), encoding: "base64" },
            );
            const mode = (
              await git(project.repository.localPath, [
                "ls-tree",
                plan.baseSha,
                "--",
                file,
              ])
            ).startsWith("100755")
              ? "100755"
              : "100644";
            tree.push({ path: file, mode, type: "blob", sha: blob.sha });
          }
          const baseCommit = await this.github.request(
            project,
            `${root}/git/commits/${plan.baseSha}`,
          );
          const newTree = await this.github.request(
            project,
            root + "/git/trees",
            "POST",
            { base_tree: baseCommit.tree.sha, tree },
          );
          // Only contents from the independently checked patch are sent to GitHub.
          const commit = await this.github.request(
            project,
            root + "/git/commits",
            "POST",
            {
              message: `ShadowQA repair ${job.id}`,
              tree: newTree.sha,
              parents: [plan.baseSha],
              author: {
                name: "ShadowQA",
                email: "shadowqa@users.noreply.github.com",
                date: new Date(job.created_at).toISOString(),
              },
              committer: {
                name: "ShadowQA",
                email: "shadowqa@users.noreply.github.com",
                date: new Date(job.created_at).toISOString(),
              },
            },
          );
          if (pr && pr.head.sha !== commit.sha)
            throw new AppError(
              "HEAD_CHANGED",
              "Existing PR contains commits that differ from the tested patch",
            );
          let existing: any;
          try {
            existing = await this.github.request(
              project,
              `${root}/git/ref/heads/${branch}`,
            );
          } catch (e: any) {
            if (e.status !== 404) throw e;
          }
          if (existing && existing.object.sha !== commit.sha)
            throw new AppError(
              "BRANCH_COLLISION",
              "Existing repair branch contains different commits; preserving it",
            );
          if (!existing)
            await this.github.request(project, root + "/git/refs", "POST", {
              ref: `refs/heads/${branch}`,
              sha: commit.sha,
            });
          await db.put(
            this.tenant,
            "publication",
            job.id,
            {
              jobId: job.id,
              branch,
              headSha: commit.sha,
              diffDigest: job.data.diffDigest,
              treeSha: newTree.sha,
            },
            project.id,
          );
          if (!pr)
            pr = await this.github.request(project, root + "/pulls", "POST", {
              title: `ShadowQA: verified maintenance ${job.id.slice(0, 8)}`,
              head: branch,
              base: project.repository.defaultBranch,
              body: `${marker}\n\n${project.policy.publishSummary}\n\nVerified against base \`${plan.baseSha}\`.\nPatch digest: \`${job.data.diffDigest}\`.\nChecks: ${artifact.checks.map((c: any) => c.id + " (" + c.exitCode + ")").join(", ")}.\n\nSource discussions and private planning context are available only through the authorized ShadowQA CLI.`,
              draft: false,
            });
        } finally {
          await rm(temp, { recursive: true, force: true });
        }
      }
      const publication = await db.get<any>(this.tenant, "publication", job.id);
      if (publication && pr.head.sha !== publication.headSha)
        throw new AppError(
          "HEAD_CHANGED",
          "PR head differs from the verified publication",
        );
      await db.rows(
        "UPDATE jobs SET state='pr_open',data=data || $3::jsonb,updated_at=now() WHERE tenant=$1 AND id=$2",
        [
          this.tenant,
          job.id,
          JSON.stringify({
            pr: { number: pr.number, url: pr.html_url, headSha: pr.head.sha },
          }),
        ],
      );
      await db.enqueue(
        this.tenant,
        project.id,
        "slack-report",
        `status:${job.id}:pr`,
        {
          jobId: job.id,
          text: `ShadowQA opened a verified repair PR: ${pr.html_url}`,
        },
      );
      await db.audit(this.tenant, "publisher", "pr.open", job.id, {
        number: pr.number,
        head: pr.head.sha,
      });
      return pr;
    });
  }
  async monitor(job: Job) {
    if (!job.data.pr) return;
    const p = await this.db.project(this.tenant, job.project_id),
      root = this.github.root(p),
      pr = await this.github.request(p, `${root}/pulls/${job.data.pr.number}`);
    if (pr.merged) {
      if (job.state !== "merged" && job.state !== "monitoring") {
        await this.db.rows(
          "UPDATE jobs SET state='monitoring',data=data || $3::jsonb WHERE tenant=$1 AND id=$2",
          [
            this.tenant,
            job.id,
            JSON.stringify({ mergeSha: pr.merge_commit_sha }),
          ],
        );
        const { Scheduler } = await import("../scheduler/jobs.js");
        await new Scheduler(this.db).scan(
          this.tenant,
          p.id,
          pr.merge_commit_sha,
          `post-merge:${job.id}`,
        );
      }
      const scan = await this.db.one<Job>(
        "SELECT * FROM jobs WHERE tenant=$1 AND action_key=$2",
        [this.tenant, `scan:${pr.merge_commit_sha}:post-merge:${job.id}`],
      );
      if (scan?.state === "resolved") {
        await this.db.rows(
          "UPDATE jobs SET state='resolved' WHERE tenant=$1 AND id=$2",
          [this.tenant, job.id],
        );
        await this.db.enqueue(
          this.tenant,
          p.id,
          "slack-report",
          `status:${job.id}:main`,
          {
            jobId: job.id + "-main",
            text: `ShadowQA verified merged repair #${pr.number} on ${pr.merge_commit_sha}.`,
          },
        );
      }
      return;
    }
    if (
      p.policy.mode !== "full-auto" ||
      !p.policy.autoMerge ||
      pr.state !== "open"
    )
      return;
    await this.db.tx(async (db) => {
      const current = await db.one<Job>(
        "SELECT * FROM jobs WHERE tenant=$1 AND id=$2 FOR UPDATE",
        [this.tenant, job.id],
      );
      if (current?.state !== "pr_open") return;
      const plan = await db.get<Plan>(this.tenant, "plan", job.plan_id!);
      if (!plan) return;
      await fresh(db, this.tenant, plan, p);
      if (
        !canAuto(plan, p) ||
        pr.head.sha !== job.data.pr.headSha ||
        pr.head.ref !== `shadowqa/${job.id}` ||
        pr.draft ||
        pr.mergeable !== true ||
        pr.mergeable_state !== "clean"
      )
        return;
      if ((await this.github.head(p)) !== plan.baseSha) return;
      const actor = await db.one(
        "SELECT role,projects FROM credentials WHERE tenant=$1 AND actor_id=$2 AND revoked=false",
        [this.tenant, job.data.authorizedBy],
      );
      if (!actor || (actor.role !== "admin" && !actor.projects.includes(p.id)))
        return;
      const rules = await this.github.request(
        p,
        `${root}/rules/branches/${encodeURIComponent(p.repository.defaultBranch)}`,
      );
      if (
        !Array.isArray(rules) ||
        rules.some((r: any) => r.type === "pull_request")
      )
        return;
      // Legacy protection is also authoritative; unknown permission/rules means wait.
      let legacy: string[] = [];
      try {
        const protection = await this.github.request(
          p,
          `${root}/branches/${encodeURIComponent(p.repository.defaultBranch)}/protection`,
        );
        if (protection.required_pull_request_reviews) return;
        legacy = protection.required_status_checks?.contexts ?? [];
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }
      const [checks, statuses, reviews] = await Promise.all([
        this.github.pages(
          p,
          `${root}/commits/${pr.head.sha}/check-runs`,
          "check_runs",
        ),
        this.github.pages(p, `${root}/commits/${pr.head.sha}/statuses`),
        this.github.pages(p, `${root}/pulls/${pr.number}/reviews`),
      ]);
      if (reviews.some((r) => r.state === "CHANGES_REQUESTED")) return;
      const required = [
        ...new Set([
          ...p.policy.requiredGithubChecks,
          ...legacy,
          ...rules
            .filter((r: any) => r.type === "required_status_checks")
            .flatMap(
              (r: any) =>
                r.parameters?.required_status_checks?.map(
                  (c: any) => c.context,
                ) ?? [],
            ),
        ]),
      ];
      if (!required.length) return;
      if (
        !required.every((name) => {
          const check = checks
            .filter((c) => c.name === name && c.head_sha === pr.head.sha)
            .sort((a, b) => b.id - a.id)[0];
          return check
            ? check.status === "completed" && check.conclusion === "success"
            : statuses.find((s) => s.context === name)?.state === "success";
        })
      )
        return;
      const result = await this.github.request(
        p,
        `${root}/pulls/${pr.number}/merge`,
        "PUT",
        { sha: pr.head.sha, merge_method: "squash" },
      );
      if (result.merged)
        await db.audit(this.tenant, "publisher", "pr.auto-merge", job.id, {
          head: pr.head.sha,
          mergeSha: result.sha,
        });
    });
  }
}
