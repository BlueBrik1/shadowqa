import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Database } from "../db/database.js";
import type { Project } from "../core/contracts.js";
import { AppError, hash, sanitize } from "../core/security.js";
import { Memory, invalidate } from "../memory/sources.js";
import { Scheduler } from "../scheduler/jobs.js";
export class GitHub {
  private tokens = new Map<string, { value: string; expires: number }>();
  private etags = new Map<string, { etag: string; body: any }>();
  private backoffUntil = 0;
  constructor(
    private db: Database,
    private tenant: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async installationToken(project: Project, write = false) {
    const key = `${project.repository.installationId}:${project.repository.githubId}:${write}`;
    const cached = this.tokens.get(key);
    if (cached && cached.expires > Date.now() + 120_000) return cached.value;
    const app = process.env.GITHUB_APP_ID,
      privatePath = process.env.GITHUB_PRIVATE_KEY_PATH;
    if (!app || !privatePath)
      throw new AppError(
        "GITHUB_SETUP",
        "Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY_PATH",
        503,
      );
    const now = Math.floor(Date.now() / 1000),
      encode = (v: unknown) =>
        Buffer.from(JSON.stringify(v)).toString("base64url");
    const unsigned =
      encode({ alg: "RS256", typ: "JWT" }) +
      "." +
      encode({ iat: now - 60, exp: now + 540, iss: app });
    const jwt =
      unsigned +
      "." +
      createSign("RSA-SHA256")
        .update(unsigned)
        .sign(await readFile(privatePath), "base64url");
    const response = await this.fetcher(
      `https://api.github.com/app/installations/${project.repository.installationId}/access_tokens`,
      {
        method: "POST",
        headers: this.headers(jwt),
        body: JSON.stringify({
          repository_ids: [project.repository.githubId],
          permissions: write
            ? {
                contents: "write",
                pull_requests: "write",
                issues: "write",
                checks: "write",
                actions: "read",
              }
            : {
                contents: "read",
                pull_requests: "read",
                issues: "read",
                checks: "read",
                actions: "read",
              },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new AppError(
        "GITHUB_AUTH",
        `GitHub installation authorization failed (${response.status})`,
        502,
      );
    const body: any = await response.json();
    this.tokens.set(key, {
      value: body.token,
      expires: Date.parse(body.expires_at),
    });
    return body.token;
  }
  private headers(token: string) {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ShadowQA/0.1",
    };
  }
  async request(
    project: Project,
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<any> {
    if (Date.now() < this.backoffUntil)
      throw new AppError(
        "GITHUB_RATE_LIMIT",
        "GitHub rate budget is cooling down",
        429,
      );
    if (!path.startsWith("/") || path.includes("://"))
      throw new AppError("GITHUB_PATH", "Invalid API path");
    const auth = await this.installationToken(project, method !== "GET");
    const key = `${project.id}:${path}`,
      cached = method === "GET" ? this.etags.get(key) : undefined;
    const response = await this.fetcher("https://api.github.com" + path, {
      method,
      headers: {
        ...this.headers(auth),
        ...(cached ? { "If-None-Match": cached.etag } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 304 && cached) return cached.body;
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after")))
    ) {
      this.backoffUntil = Math.max(
        Date.now() + Number(response.headers.get("retry-after") ?? 60) * 1000,
        Number(response.headers.get("x-ratelimit-reset") ?? 0) * 1000,
      );
      throw new AppError(
        "GITHUB_RATE_LIMIT",
        "GitHub rate limit reached; observation is delayed",
        429,
      );
    }
    if (!response.ok)
      throw new AppError(
        "GITHUB_API",
        `GitHub ${method} ${path} returned ${response.status}`,
        response.status === 404 ? 404 : 502,
      );
    if (response.status === 204) return null;
    const value = await response.json();
    if (method === "GET" && response.headers.get("etag")) {
      if (this.etags.size > 500) this.etags.clear();
      this.etags.set(key, { etag: response.headers.get("etag")!, body: value });
    }
    return value;
  }
  async pages(project: Project, path: string, field?: string): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const body = await this.request(
        project,
        path + (path.includes("?") ? "&" : "?") + `per_page=100&page=${page}`,
      );
      const rows = field ? body[field] : body;
      if (!Array.isArray(rows))
        throw new AppError("GITHUB_SCHEMA", "Expected a paginated GitHub list");
      result.push(...rows);
      if (rows.length < 100) return result;
    }
    throw new AppError(
      "HISTORY_GAP",
      "GitHub pagination cap reached; narrow the reconciliation window",
    );
  }
  root(p: Project) {
    return `/repos/${p.repository.owner}/${p.repository.name}`;
  }
  async accepts(body: any) {
    return (await this.db.list<Project>(this.tenant, "project")).some(
      (p) =>
        p.repository.installationId === body.installation?.id &&
        (!body.repository ||
          (p.enabled && p.repository.githubId === body.repository.id)),
    );
  }
  async head(p: Project) {
    return (
      await this.request(
        p,
        this.root(p) +
          "/git/ref/heads/" +
          encodeURIComponent(p.repository.defaultBranch),
      )
    ).object.sha as string;
  }
  async normalize(type: string, body: any) {
    const projects = await this.db.list<Project>(this.tenant, "project");
    if (
      type === "installation" &&
      ["deleted", "suspend"].includes(body.action)
    ) {
      for (const p of projects.filter(
        (p) => p.repository.installationId === body.installation?.id,
      ))
        await this.revoke(p);
      return;
    }
    if (type === "installation_repositories") {
      for (const repo of body.repositories_removed ?? []) {
        const p = projects.find((p) => p.repository.githubId === repo.id);
        if (p) await this.revoke(p);
      }
      return;
    }
    const p = projects.find(
      (p) =>
        p.enabled &&
        p.repository.githubId === body.repository?.id &&
        p.repository.installationId === body.installation?.id,
    );
    if (!p) return;
    const timestamp = new Date().toISOString();
    const item =
      body.comment ??
      body.review ??
      body.issue ??
      body.pull_request ??
      body.check_run ??
      body.check_suite ??
      body.workflow_run;
    if (item) {
      const family = body.comment
        ? "comment"
        : body.review
          ? "review"
          : body.issue
            ? "issue"
            : body.pull_request
              ? "pr"
              : body.check_run
                ? "check"
                : body.check_suite
                  ? "suite"
                  : "workflow";
      const sourceKey = `${p.repository.githubId}:${family}:${item.id}`;
      const text = [
        item.title,
        item.body,
        item.output?.title,
        item.output?.summary,
        item.conclusion ? `Conclusion: ${item.conclusion}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await new Memory(this.db).upsert({
        tenant: this.tenant,
        project_id: p.id,
        provider: "github",
        source_key: sourceKey,
        revision: hash(item),
        source_time:
          item.updated_at ??
          item.submitted_at ??
          item.completed_at ??
          item.created_at ??
          timestamp,
        text,
        url: item.html_url ?? item.url ?? "",
        visibility: p.repository.visibility,
        deleted: body.action === "deleted",
        metadata: {
          event: type,
          headSha: item.head?.sha ?? item.head_sha,
          baseSha: item.base?.sha,
          number: item.number,
          author: item.user?.login,
          origin: item.user?.type === "Bot" ? "bot" : "human",
        },
      });
    }
    if (body.pull_request) {
      const pr = body.pull_request;
      await this.db.put(
        this.tenant,
        "pr",
        String(pr.number),
        {
          number: pr.number,
          projectId: p.id,
          headSha: pr.head.sha,
          baseSha: pr.base.sha,
          state: pr.state,
          merged: pr.merged ?? false,
          url: pr.html_url,
          shadow: pr.head.ref?.startsWith("shadowqa/"),
        },
        p.id,
      );
      if (
        pr.head.repo?.id === p.repository.githubId &&
        !pr.head.ref?.startsWith("shadowqa/")
      )
        await new Scheduler(this.db).scan(this.tenant, p.id, pr.head.sha, "pr");
    }
    if (
      type === "push" &&
      body.ref === `refs/heads/${p.repository.defaultBranch}` &&
      !body.deleted
    ) {
      await this.invalidateBase(p, body.after);
      await new Scheduler(this.db).scan(this.tenant, p.id, body.after, "main");
    }
    if (
      ["check_run", "check_suite", "workflow_run"].includes(type) &&
      item?.head_sha &&
      ["failure", "timed_out", "cancelled"].includes(item.conclusion)
    )
      await new Scheduler(this.db).scan(this.tenant, p.id, item.head_sha, "ci");
  }
  private async revoke(p: Project) {
    await this.db.put(
      this.tenant,
      "project",
      p.id,
      { ...p, enabled: false },
      p.id,
    );
    await new Memory(this.db).revoke(this.tenant, p.id);
    await this.db.rows(
      "UPDATE jobs SET state='cancelled',fence=fence+1,lease_until=NULL WHERE tenant=$1 AND project_id=$2 AND state IN ('queued','leased','preparing','running','verifying','ready_to_publish')",
      [this.tenant, p.id],
    );
    this.tokens.clear();
    this.etags.clear();
  }
  private async invalidateBase(p: Project, head: string) {
    const plans = await this.db.list<any>(this.tenant, "plan", p.id);
    if (
      plans.some(
        (plan) =>
          plan.baseSha !== head &&
          !["superseded", "rejected"].includes(plan.status),
      )
    )
      await invalidate(this.db, this.tenant, p.id);
  }
  async reconcile(p: Project) {
    const root = this.root(p);
    const repo = await this.request(p, root);
    if (
      repo.id !== p.repository.githubId ||
      (repo.private ? "private" : "public") !== p.repository.visibility
    )
      throw new AppError(
        "REPOSITORY_CHANGED",
        "Repository identity or visibility changed; review its configuration",
      );
    const previous = await this.db.get<any>(
      this.tenant,
      "cursor",
      `github:${p.id}`,
    );
    const since =
      previous?.watermark ?? new Date(Date.now() - 7 * 86400_000).toISOString();
    const envelope = {
      repository: { id: p.repository.githubId },
      installation: { id: p.repository.installationId },
    };
    const start = new Date().toISOString();
    try {
      const prs = await this.pages(p, root + "/pulls?state=open");
      for (const pr of prs) {
        await this.normalize("pull_request", {
          ...envelope,
          pull_request: pr,
          action: "synchronize",
        });
        const [files, reviews, comments, inline, checks, statuses, runs] =
          await Promise.all([
            this.pages(p, `${root}/pulls/${pr.number}/files`),
            this.pages(p, `${root}/pulls/${pr.number}/reviews`),
            this.pages(p, `${root}/issues/${pr.number}/comments`),
            this.pages(p, `${root}/pulls/${pr.number}/comments`),
            this.pages(
              p,
              `${root}/commits/${pr.head.sha}/check-runs`,
              "check_runs",
            ),
            this.pages(p, `${root}/commits/${pr.head.sha}/statuses`),
            this.pages(
              p,
              `${root}/actions/runs?head_sha=${pr.head.sha}`,
              "workflow_runs",
            ),
          ]);
        for (const review of reviews)
          await this.normalize("pull_request_review", { ...envelope, review });
        for (const comment of [...comments, ...inline])
          await this.normalize("issue_comment", { ...envelope, comment });
        for (const check_run of checks.filter(
          (c) => c.head_sha === pr.head.sha,
        ))
          await this.normalize("check_run", { ...envelope, check_run });
        await this.db.put(
          this.tenant,
          "pr-evidence",
          `${p.id}:${pr.number}`,
          {
            projectId: p.id,
            number: pr.number,
            headSha: pr.head.sha,
            files: files.map((f) => ({
              filename: f.filename,
              status: f.status,
              patch: sanitize(f.patch ?? "").slice(0, 30_000),
              truncated: !f.patch,
            })),
            checks,
            statuses,
            workflows: runs.map((r) => ({
              id: r.id,
              head_sha: r.head_sha,
              status: r.status,
              conclusion: r.conclusion,
            })),
            updatedAt: start,
          },
          p.id,
        );
      }
      for (const issue of await this.pages(
        p,
        `${root}/issues?state=all&since=${encodeURIComponent(since)}`,
      ))
        await this.normalize("issues", { ...envelope, issue });
      for (const comment of await this.pages(
        p,
        `${root}/issues/comments?since=${encodeURIComponent(since)}`,
      ))
        await this.normalize("issue_comment", { ...envelope, comment });
      const head = await this.head(p);
      if (previous?.head !== head) {
        await this.invalidateBase(p, head);
        await new Scheduler(this.db).scan(this.tenant, p.id, head, "main");
      }
      await this.db.put(
        this.tenant,
        "cursor",
        `github:${p.id}`,
        {
          provider: "github",
          projectId: p.id,
          watermark: start,
          head,
          gap: false,
          lastSuccess: start,
        },
        p.id,
      );
    } catch (e: any) {
      await this.db.put(
        this.tenant,
        "cursor",
        `github:${p.id}`,
        {
          ...previous,
          provider: "github",
          projectId: p.id,
          gap: true,
          error: sanitize(e.message),
        },
        p.id,
      );
      throw e;
    }
  }
}
