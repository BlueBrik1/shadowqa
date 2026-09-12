import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/database.js";
import {
  Artifact,
  CheckResult,
  Id,
  Mode,
  Project as ProjectSchema,
  Sha,
  States,
  type Job,
  type Principal,
  type Project,
} from "../core/contracts.js";
import {
  AppError,
  authorize,
  githubSignature,
  hash,
  sanitize,
  slackSignature,
  token,
} from "../core/security.js";
import { Memory, invalidate } from "../memory/sources.js";
import { Planner } from "../planner/planner.js";
import { Gemini, type Model } from "../model/gemini.js";
import { Scheduler } from "../scheduler/jobs.js";
import { QA } from "../qa/findings.js";
import { canAuto } from "../policy/engine.js";
import { GitHub } from "../adapters/github.js";
import { SlackAdapter } from "../adapters/slack.js";
import { inspect } from "../planner/inspect.js";
import { IdentityLinks } from "./identity.js";
import { repairFinding } from "../qa/repair.js";
const params = (r: FastifyRequest) => r.params as Record<string, string>;
const actor = (r: FastifyRequest) => (r as any).principal as Principal;
export function body(r: FastifyRequest): any {
  try {
    return Buffer.isBuffer(r.body)
      ? JSON.parse(r.body.toString("utf8"))
      : (r.body ?? {});
  } catch {
    throw new AppError("JSON", "Invalid JSON");
  }
}
const fence = z.object({ fence: z.number().int().positive() });
export function createServer(
  db: Database,
  options: {
    tenant: string;
    model?: Model;
    inspector?: typeof inspect;
    github?: GitHub;
    slack?: SlackAdapter;
  },
): FastifyInstance {
  const api = Fastify({
    logger: false,
    bodyLimit: 3_000_000,
    requestTimeout: 250_000,
  });
  api.removeContentTypeParser("application/json");
  api.addContentTypeParser(
    ["application/json", "application/x-www-form-urlencoded"],
    { parseAs: "buffer" },
    (_r, b, done) => done(null, b),
  );
  const memory = new Memory(db),
    scheduler = new Scheduler(db),
    qa = new QA(db),
    model = options.model ?? new Gemini(db),
    planner = new Planner(db, model, options.inspector);
  const github = options.github ?? new GitHub(db, options.tenant),
    slack = options.slack ?? new SlackAdapter(db, options.tenant),
    identities = new IdentityLinks(db);
  const publicPaths = new Set([
    "/health",
    "/webhooks/slack",
    "/webhooks/github",
    "/oauth/github/callback",
    "/oauth/slack/callback",
  ]);
  api.addHook("onRequest", async (r) => {
    if (publicPaths.has(r.url.split("?")[0])) return;
    const authorization = r.headers.authorization ?? "";
    if (!authorization.startsWith("Bearer "))
      throw new AppError("UNAUTHORIZED", "Bearer authentication required", 401);
    (r as any).principal = await db.identity(authorization.slice(7));
  });
  api.setErrorHandler((error, _request, reply) => {
    const e = error as any;
    const status =
      e instanceof z.ZodError ? 400 : (e.status ?? e.statusCode ?? 500);
    if (status >= 500) console.error("ShadowQA API:", sanitize(e.message));
    reply.code(status).send({
      code: e instanceof z.ZodError ? "VALIDATION" : (e.code ?? "INTERNAL"),
      message: sanitize(
        e instanceof z.ZodError
          ? e.issues
              .map((x: any) => x.path.join(".") + ": " + x.message)
              .join("; ")
          : status === 500
            ? "Internal service error; inspect service logs"
            : e.message,
      ),
    });
  });
  api.get("/health", async () => {
    await db.rows("SELECT 1");
    return { ok: true, version: "0.1.0" };
  });
  api.get("/me", async (r) => actor(r));
  api.get("/status", async (r) => {
    const a = actor(r);
    authorize(a);
    const projects = (await db.list<Project>(a.tenant, "project")).filter(
      (p) => a.role === "admin" || a.projects.includes(p.id),
    );
    const ids = projects.map((p) => p.id);
    const counts = await db.rows(
      "SELECT state,count(*)::int AS count FROM jobs WHERE tenant=$1 AND project_id=ANY($2::text[]) GROUP BY state",
      [a.tenant, ids],
    );
    const sources = await db.one(
      "SELECT count(*)::int AS count FROM source_documents WHERE tenant=$1 AND project_id=ANY($2::text[]) AND deleted=false",
      [a.tenant, ids],
    );
    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        mode: p.policy.mode,
        enabled: p.enabled,
        profileReviewed: p.profile.reviewed,
      })),
      sources: sources.count,
      jobs: counts,
      killed: !!(await db.get(a.tenant, "control", "kill")),
      connections: [
        ...(await db.list<any>(a.tenant, "connection")),
        ...(await db.list<any>(a.tenant, "cursor")),
      ].filter((x) => !x.projectId || ids.includes(x.projectId)),
      runners: (await db.list<any>(a.tenant, "runner")).filter((x) =>
        x.projects?.some((p: string) => ids.includes(p)),
      ),
      modelUsage: await db.one(
        "SELECT calls,input_tokens,output_tokens FROM model_usage WHERE tenant=$1 AND day=CURRENT_DATE",
        [a.tenant],
      ),
    };
  });
  api.get("/projects", async (r) => {
    const a = actor(r);
    authorize(a);
    return (await db.list<Project>(a.tenant, "project"))
      .filter((p) => a.role === "admin" || a.projects.includes(p.id))
      .map((p) => ({
        ...p,
        repository: {
          ...p.repository,
          localPath:
            a.role === "admin" ? p.repository.localPath : "[service mapping]",
        },
      }));
  });
  api.put("/projects/:id", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    const p = ProjectSchema.parse(body(r));
    if (p.id !== params(r).id) throw new AppError("ID", "Project ID mismatch");
    const projects = await db.list<Project>(a.tenant, "project");
    if (
      projects.some(
        (other) =>
          other.id !== p.id &&
          (other.repository.githubId === p.repository.githubId ||
            other.channels.some((c) => p.channels.some((n) => n.id === c.id))),
      )
    )
      throw new AppError(
        "AMBIGUOUS",
        "Repository or channel is already mapped",
      );
    if (
      p.profile.requiredChecks.some(
        (id) => !p.profile.checks.some((c) => c.id === id),
      )
    )
      throw new AppError("PROFILE", "Required checks must exist in profile");
    const old = await db.get<Project>(a.tenant, "project", p.id);
    if (
      old &&
      hash({ ...old, policy: { ...old.policy, version: 0 } }) !==
        hash({ ...p, policy: { ...p.policy, version: 0 } })
    )
      p.policy.version = Math.max(p.policy.version, old.policy.version + 1);
    await db.tx(async (tx) => {
      await tx.put(a.tenant, "project", p.id, p, p.id);
      await tx.put(
        a.tenant,
        "policy-grant",
        p.id,
        { actorId: a.id, version: p.policy.version },
        p.id,
      );
      if (old && hash(old) !== hash(p)) await invalidate(tx, a.tenant, p.id);
      await tx.audit(a.tenant, a.id, "project.configure", p.id, {
        digest: hash(p),
      });
    });
    if (old)
      for (const c of old.channels.filter(
        (c) => !p.channels.some((n) => n.id === c.id),
      ))
        await memory.revoke(a.tenant, p.id, "slack", c.id);
    return p;
  });
  api.post("/projects/:id/mode", async (r) => {
    const a = actor(r),
      id = params(r).id;
    authorize(a, id, ["admin"]);
    const { mode } = z.object({ mode: Mode }).parse(body(r));
    return db.tx(async (tx) => {
      await tx.rows(
        "SELECT id FROM entities WHERE tenant=$1 AND kind='project' AND id=$2 FOR UPDATE",
        [a.tenant, id],
      );
      const p = await tx.project(a.tenant, id);
      p.policy = { ...p.policy, mode, version: p.policy.version + 1 };
      await tx.put(a.tenant, "project", id, p, id);
      await tx.put(
        a.tenant,
        "policy-grant",
        id,
        { actorId: a.id, version: p.policy.version },
        id,
      );
      await invalidate(tx, a.tenant, id);
      await tx.audit(a.tenant, a.id, "policy.mode", id, {
        mode,
        version: p.policy.version,
      });
      return p.policy;
    });
  });
  api.get("/projects/:id/context", async (r) =>
    memory.retrieve(
      actor(r),
      params(r).id,
      z.object({ q: z.string().max(1000).default("") }).parse(r.query).q,
    ),
  );
  api.post("/sources/:id/confirm", async (r) => {
    await memory.confirm(actor(r), params(r).id);
    return { confirmed: true };
  });
  api.post("/projects/:id/compile", async (r) => {
    const input = z
      .object({
        objective: z.string().max(3000).default(""),
        query: z.string().max(1000).default(""),
      })
      .parse(body(r));
    const a = actor(r),
      plan = await planner.compile(
        a,
        params(r).id,
        input.objective,
        input.query,
      );
    const p = await db.project(a.tenant, plan.projectId);
    if (plan.status !== "blocked" && canAuto(plan, p)) {
      await scheduler.queuePlan(a.tenant, plan, a.id);
      plan.status = "queued";
    }
    return plan;
  });
  for (const kind of ["task", "plan", "finding"] as const) {
    api.get("/" + kind + "s", async (r) => {
      const a = actor(r);
      authorize(a);
      return (await db.list<any>(a.tenant, kind)).filter(
        (x) => a.role === "admin" || a.projects.includes(x.projectId),
      );
    });
    api.get("/" + kind + "s/:id", async (r) => {
      const a = actor(r);
      const item = await db.get<any>(a.tenant, kind, params(r).id);
      if (!item) throw new AppError("NOT_FOUND", kind + " not found", 404);
      authorize(a, item.projectId);
      return item;
    });
  }
  api.post("/tasks/:id/plan", async (r) => {
    const a = actor(r),
      t = await db.get<any>(a.tenant, "task", params(r).id);
    if (!t) throw new AppError("NOT_FOUND", "Task not found", 404);
    return planner.compile(a, t.projectId, t.objective);
  });
  api.post("/plans/:id/challenge", async (r) =>
    scheduler.challenge(actor(r), params(r).id),
  );
  api.post("/plans/:id/approvals", async (r) => {
    const a = actor(r),
      input = z
        .object({
          approvalId: Id,
          nonce: z.string(),
          digest: z.string(),
          decision: z.enum(["approve", "reject"]),
        })
        .parse(body(r));
    const approval = await db.one(
      "SELECT plan_id FROM approvals WHERE tenant=$1 AND id=$2",
      [a.tenant, input.approvalId],
    );
    if (approval?.plan_id !== params(r).id)
      throw new AppError(
        "APPROVAL_SCOPE",
        "Approval does not refer to this plan",
      );
    return scheduler.approve(
      a,
      input.approvalId,
      input.nonce,
      input.digest,
      input.decision,
    );
  });
  api.get("/jobs", async (r) => {
    const a = actor(r);
    authorize(a);
    return db.rows(
      "SELECT * FROM jobs WHERE tenant=$1" +
        (a.role === "admin" ? "" : " AND project_id=ANY($2::text[])") +
        " ORDER BY created_at DESC LIMIT 100",
      a.role === "admin" ? [a.tenant] : [a.tenant, a.projects],
    );
  });
  api.get("/jobs/:id", async (r) => {
    const a = actor(r),
      job = await db.one<Job>("SELECT * FROM jobs WHERE tenant=$1 AND id=$2", [
        a.tenant,
        params(r).id,
      ]);
    if (!job) throw new AppError("NOT_FOUND", "Job not found", 404);
    authorize(a, job.project_id);
    return {
      ...job,
      events: await db.rows(
        "SELECT sequence,event,created_at FROM job_events WHERE tenant=$1 AND job_id=$2 ORDER BY sequence",
        [a.tenant, job.id],
      ),
    };
  });
  api.get("/jobs/:id/artifacts", async (r) => {
    const a = actor(r),
      job = await db.one<Job>("SELECT * FROM jobs WHERE tenant=$1 AND id=$2", [
        a.tenant,
        params(r).id,
      ]);
    if (!job) throw new AppError("NOT_FOUND", "Job not found", 404);
    authorize(a, job.project_id);
    return (await db.list<any>(a.tenant, "artifact", job.project_id)).filter(
      (x) => x.jobId === job.id,
    );
  });
  api.post("/jobs/:id/cancel", async (r) => {
    await scheduler.cancel(actor(r), params(r).id);
    return { cancelled: true };
  });
  api.post("/control/kill", async (r) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(body(r));
    await scheduler.kill(actor(r), enabled);
    return { enabled };
  });
  api.post("/findings/:id/suppress", async (r) => {
    const { reason, hours } = z
      .object({
        reason: z.string().min(3).max(1000),
        hours: z.number().min(1).max(720),
      })
      .parse(body(r));
    await qa.suppress(actor(r), params(r).id, reason, hours);
    return { suppressed: true };
  });
  api.post("/findings/:id/repair", async (r) =>
    repairFinding(db, model, actor(r), params(r).id),
  );
  api.post("/projects/:id/scan", async (r) => {
    const a = actor(r);
    authorize(a, params(r).id, ["admin", "developer"]);
    const p = await db.project(a.tenant, params(r).id),
      inspection = await inspect(p);
    return (
      (await scheduler.scan(
        a.tenant,
        p.id,
        inspection.baseSha,
        `manual:${randomUUID()}`,
      )) ?? {
        state: "disabled",
        message: "Review the profile or disable the kill switch",
      }
    );
  });
  api.post("/projects/:id/sync", async (r) => {
    const a = actor(r);
    authorize(a, params(r).id, ["admin", "developer"]);
    const p = await db.project(a.tenant, params(r).id);
    await github.reconcile(p);
    if (process.env.SLACK_BOT_TOKEN) await slack.backfill(p);
    return { synced: true };
  });
  api.post("/runners/register", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    const input = z
      .object({
        name: z.string().min(1).max(100),
        projects: z.array(Id).min(1),
      })
      .parse(body(r));
    for (const p of input.projects) await db.project(a.tenant, p);
    const raw = token(),
      id = randomUUID();
    await db.rows(
      "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,'runner',$4)",
      [hash(raw), a.tenant, id, JSON.stringify(input.projects)],
    );
    await db.put(a.tenant, "runner", id, {
      id,
      name: input.name,
      projects: input.projects,
      state: "registered",
    });
    await db.audit(a.tenant, a.id, "runner.register", id, {
      projects: input.projects,
    });
    return { id, token: raw };
  });
  api.post("/runners/heartbeat", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["runner"]);
    const info = z
      .object({
        capabilities: z.record(z.string(), z.string()),
        projects: z.array(Id),
      })
      .parse(body(r));
    const old = await db.get<any>(a.tenant, "runner", a.id);
    await db.put(a.tenant, "runner", a.id, {
      ...old,
      id: a.id,
      projects: a.projects,
      capabilities: info.capabilities,
      lastSeen: new Date().toISOString(),
      state: "online",
    });
    return { ok: true };
  });
  api.post("/jobs/lease", async (r) => {
    const a = actor(r),
      job = await scheduler.lease(a);
    if (!job) return {};
    const p = await db.project(a.tenant, job.project_id);
    return {
      job,
      project: {
        ...p,
        repository: { ...p.repository, localPath: "[use runner mapping]" },
      },
      plan: job.plan_id
        ? await db.get(a.tenant, "plan", job.plan_id)
        : undefined,
    };
  });
  api.post("/jobs/:id/heartbeat", async (r) =>
    scheduler.heartbeat(actor(r), params(r).id, fence.parse(body(r)).fence),
  );
  api.post("/jobs/:id/events", async (r) => {
    const input = fence
      .extend({
        event: z.object({
          state: z.enum(States).optional(),
          message: z.string().max(4000).optional(),
          session: z
            .object({
              url: z.string().url(),
              sessionId: z.string(),
              workspace: z.string(),
            })
            .optional(),
        }),
      })
      .parse(body(r));
    return scheduler.event(actor(r), params(r).id, input.fence, input.event);
  });
  api.post("/jobs/:id/complete", async (r) => {
    const input = fence
      .extend({
        result: z.object({
          diff: z.string().max(2_000_000),
          checks: z.array(CheckResult).max(30),
          baseline: z.array(CheckResult).max(30),
          baseSha: Sha,
          attempts: z.number().int().min(1).max(2),
        }),
      })
      .parse(body(r));
    return scheduler.complete(
      actor(r),
      params(r).id,
      input.fence,
      input.result,
    );
  });
  api.post("/jobs/:id/artifacts", async (r) => {
    const input = fence.extend({ artifact: Artifact }).parse(body(r)),
      a = actor(r);
    const job = await scheduler.owned(db, a, params(r).id, input.fence);
    const id = randomUUID();
    await db.put(
      a.tenant,
      "artifact",
      id,
      {
        id,
        jobId: job.id,
        ...input.artifact,
        content: sanitize(input.artifact.content),
      },
      job.project_id,
    );
    return { id };
  });
  api.post("/jobs/:id/findings", async (r) => {
    const input = fence
        .extend({
          sha: Sha,
          checks: z.array(CheckResult).max(30),
          baseline: z.array(CheckResult).max(30),
        })
        .parse(body(r)),
      a = actor(r);
    const job = await scheduler.owned(db, a, params(r).id, input.fence);
    if (input.sha !== job.data.baseSha)
      throw new AppError("SHA", "Finding SHA differs from job");
    return qa.record(
      a.tenant,
      job.project_id,
      input.sha,
      input.checks,
      input.baseline,
      job.kind === "scan",
    );
  });
  api.post("/jobs/:id/model", async (r) => {
    const input = fence
        .extend({ path: z.string().max(300), body: z.string().max(2_000_000) })
        .parse(body(r)),
      a = actor(r),
      job = await scheduler.owned(db, a, params(r).id, input.fence),
      p = await db.project(a.tenant, job.project_id);
    if (
      !p.profile.externalInferenceApproved ||
      job.kind !== "repair" ||
      job.state !== "running"
    )
      throw new AppError(
        "MODEL_SCOPE",
        "Model access is disabled for this job",
      );
    const name = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const match = input.path.match(
      /^\/v1beta\/models\/([\w.-]+):(generateContent|streamGenerateContent|countTokens)(\?alt=sse)?$/,
    );
    if (!match || match[1] !== name)
      throw new AppError(
        "MODEL_SCOPE",
        "Only the configured Gemini model is permitted",
      );
    if (!process.env.GEMINI_API_KEY)
      throw new AppError("MODEL_SETUP", "GEMINI_API_KEY is missing", 503);
    JSON.parse(input.body);
    await new Gemini(db).reserve(a.tenant);
    const response = await fetch(
      "https://generativelanguage.googleapis.com" + input.path,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "content-type": "application/json",
        },
        body: sanitize(input.body),
        signal: AbortSignal.timeout(90_000),
      },
    );
    const text = await response.text();
    if (text.length > 4_000_000)
      throw new AppError("MODEL_CAP", "Gemini response exceeded cap");
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "application/json",
      body: text,
    };
  });
  api.post("/members", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    const input = z
      .object({
        id: Id,
        role: z.enum(["admin", "developer", "viewer"]),
        projects: z.array(Id),
      })
      .parse(body(r));
    for (const id of input.projects) await db.project(a.tenant, id);
    const raw = token();
    await db.rows(
      "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,$4,$5)",
      [
        hash(raw),
        a.tenant,
        input.id,
        input.role,
        JSON.stringify(input.projects),
      ],
    );
    await db.audit(a.tenant, a.id, "member.issue", input.id, {
      role: input.role,
    });
    return { token: raw, ...input };
  });
  api.post("/members/:id/revoke", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    await db.rows(
      "UPDATE credentials SET revoked=true WHERE tenant=$1 AND actor_id=$2",
      [a.tenant, params(r).id],
    );
    await db.rows(
      "UPDATE jobs SET state='cancelled',fence=fence+1,lease_until=NULL WHERE tenant=$1 AND (runner_id=$2 OR data->>'authorizedBy'=$2) AND state IN ('queued','leased','preparing','running','verifying','ready_to_publish')",
      [a.tenant, params(r).id],
    );
    await db.audit(a.tenant, a.id, "member.revoke", params(r).id);
    return { revoked: true };
  });
  api.get("/audit", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    return db.rows(
      "SELECT * FROM audit_log WHERE tenant=$1 ORDER BY id DESC LIMIT 200",
      [a.tenant],
    );
  });
  api.get("/queue", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    return {
      inbox: await db.rows(
        "SELECT provider,delivery_id,state,attempts,error FROM source_events WHERE tenant=$1 AND state!='done' LIMIT 100",
        [a.tenant],
      ),
      outbox: await db.rows(
        "SELECT id,kind,state,attempts,error FROM outbox WHERE tenant=$1 AND state!='done' LIMIT 100",
        [a.tenant],
      ),
    };
  });
  api.post("/queue/retry", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    for (const table of ["source_events", "outbox"])
      await db.rows(
        `UPDATE ${table} SET state='queued',attempts=0,available_at=now(),error=NULL WHERE tenant=$1 AND state='failed'`,
        [a.tenant],
      );
    return { retried: true };
  });
  api.post("/retention", async (r) => {
    const a = actor(r);
    authorize(a, undefined, ["admin"]);
    await memory.retention(a.tenant);
    return { pruned: true };
  });
  api.post("/identity/:provider", async (r) =>
    identities.begin(
      actor(r),
      z.enum(["github", "slack"]).parse(params(r).provider),
    ),
  );
  for (const provider of ["github", "slack"] as const)
    api.get(`/oauth/${provider}/callback`, async (r, reply) => {
      await identities.finish(
        provider,
        z.object({ code: z.string(), state: z.string() }).parse(r.query),
      );
      reply
        .type("text/plain")
        .send(
          "Identity linked. You can close this tab and return to the ShadowQA terminal.",
        );
    });
  api.post("/oauth/slack/callback", async (r, reply) => {
    const form = Object.fromEntries(
      new URLSearchParams(
        Buffer.isBuffer(r.body) ? r.body.toString("utf8") : "",
      ),
    );
    await identities.finish(
      "slack",
      z.object({ code: z.string(), state: z.string() }).parse(form),
    );
    reply
      .type("text/plain")
      .send("Slack identity linked. Return to the ShadowQA terminal.");
  });
  api.post("/webhooks/github", async (r) => {
    const raw = Buffer.isBuffer(r.body) ? r.body.toString("utf8") : "";
    if (
      !githubSignature(
        raw,
        String(r.headers["x-hub-signature-256"] ?? ""),
        process.env.GITHUB_WEBHOOK_SECRET ?? "",
      )
    )
      throw new AppError("SIGNATURE", "Invalid GitHub signature", 401);
    const delivery = z
        .string()
        .min(1)
        .max(200)
        .parse(r.headers["x-github-delivery"]),
      payload = JSON.parse(raw);
    if (await github.accepts(payload))
      await memory.ingest(options.tenant, "github", delivery, {
        type: r.headers["x-github-event"],
        body: payload,
      });
    return { accepted: true };
  });
  api.post("/webhooks/slack", async (r) => {
    const raw = Buffer.isBuffer(r.body) ? r.body.toString("utf8") : "";
    if (
      !slackSignature(
        raw,
        String(r.headers["x-slack-signature"] ?? ""),
        String(r.headers["x-slack-request-timestamp"] ?? ""),
        process.env.SLACK_SIGNING_SECRET ?? "",
      )
    )
      throw new AppError("SIGNATURE", "Invalid Slack signature", 401);
    const input = JSON.parse(raw);
    if (input.type === "url_verification")
      return { challenge: input.challenge };
    if (await slack.accepts(input))
      await memory.ingest(
        options.tenant,
        "slack",
        input.event_id ?? hash(input),
        input,
      );
    return { accepted: true };
  });
  return api;
}
