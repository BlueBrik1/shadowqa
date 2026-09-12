import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { AppError, sanitize } from "../../src/core/security.js";
import { Gemini, type Model } from "../../src/model/gemini.js";
import { Store } from "../core/store.js";
import { databaseLabel } from "../core/db.js";
import { Runner } from "../core/runner.js";
import { detectAll } from "../core/backends.js";
import { discardWorkspace } from "../core/execute.js";
import { compilePlan, planIsFresh } from "../core/plan.js";
import { extractItems } from "../core/extract.js";
import {
  findings,
  finding,
  repairAllowed,
  noteRepairAttempt,
  scanHead,
  record,
  watchSavedFiles,
  type WatchHandle,
} from "../core/qa.js";
import { githubStatus, openPullRequest, safeSummary } from "../core/publish.js";
import {
  CaptureBatch,
  IndividualProject,
  Backend,
  Mode,
  type Plan,
} from "../core/contracts.js";
import {
  createPairingCode,
  identify,
  redeemPairingCode,
  requireOwner,
  revokeClients,
  writeEndpoint,
  type Caller,
} from "./auth.js";
import { observers, type ObserverState } from "./observers.js";

export type ServiceOptions = {
  store: Store;
  ownerToken: string;
  model?: Model;
  host?: string;
  port?: number;
};

export async function createService(options: ServiceOptions) {
  const { store, ownerToken } = options;
  const model = options.model ?? new Gemini(store.db);
  // A caller-supplied model is configured by definition; otherwise Gemini needs its key.
  const modelConfigured = () => !!options.model || !!process.env.GEMINI_API_KEY;
  const app = Fastify({ bodyLimit: 8_000_000, logger: false });
  const runner = new Runner(store);
  const observerState: ObserverState = {
    claudeCode: undefined,
    codex: undefined,
  };

  const caller = async (request: any): Promise<Caller> =>
    identify(store, ownerToken, request.headers.authorization);

  app.setErrorHandler((error: any, _request, reply) => {
    const status =
      error instanceof AppError ? error.status : (error.statusCode ?? 500);
    reply.code(status).send({
      code: error.code ?? "ERROR",
      message: sanitize(String(error.message ?? "Request failed")),
    });
  });

  app.get("/health", async () => ({
    ok: true,
    product: "shadowqa-individual",
    database: databaseLabel(),
    model: model.name,
    modelConfigured: modelConfigured(),
  }));

  app.get("/backends", async () => detectAll());

  app.get("/status", async (request) => {
    await caller(request);
    const projects = await store.projects();
    const conversations = await store.conversations();
    const tasks = await store.tasks();
    return {
      database: databaseLabel(),
      model: { name: model.name, configured: modelConfigured() },
      backends: await detectAll(),
      projects: await Promise.all(
        projects.map(async (p) => ({
          id: p.id,
          name: p.name,
          mode: p.mode,
          backend: p.backend,
          repo: p.repo?.path ?? null,
          messages: (await store.context(p.id, "", 1000)).length,
          items: (await store.items(p.id)).length,
          github: githubStatus(p),
        })),
      ),
      conversations: conversations.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        origin: c.origin,
        title: c.title,
        coverage: c.coverage,
        tracked: c.tracked,
        paused: c.paused,
        messageCount: c.messageCount,
        lastSync: c.lastSync,
        lastError: c.lastError ?? null,
      })),
      observers: observerState,
      tasks: tasks.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        state: t.state,
        backend: t.backend,
        updatedAt: t.updatedAt,
      })),
      findings: (await findings(store)).filter((f) => f.state === "open")
        .length,
    };
  });

  // ---- projects -------------------------------------------------------------

  app.get("/projects", async (request) => {
    await caller(request);
    return store.projects();
  });

  app.post("/projects", async (request) => {
    requireOwner(await caller(request));
    const body = request.body as any;
    const project = IndividualProject.parse({
      ...body,
      id: String(body.id ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9_.:-]/g, "-"),
      createdAt: new Date().toISOString(),
      checks: body.checks ?? [],
      requiredChecks: body.requiredChecks ?? [],
    });
    return store.putProject(project);
  });

  app.patch("/projects/:id", async (request) => {
    requireOwner(await caller(request));
    const { id } = request.params as any;
    const body = request.body as any;
    const patch: any = {};
    if (body.mode) patch.mode = Mode.parse(body.mode);
    if (body.backend) patch.backend = Backend.parse(body.backend);
    if (body.name) patch.name = String(body.name).slice(0, 200);
    if (body.repo) patch.repo = body.repo;
    if (body.checks) patch.checks = body.checks;
    if (body.requiredChecks) patch.requiredChecks = body.requiredChecks;
    if (body.allowedPaths) patch.allowedPaths = body.allowedPaths;
    if (body.protectedPaths) patch.protectedPaths = body.protectedPaths;
    return store.updateProject(id, patch);
  });

  // ---- capture (extension via companion) ------------------------------------

  app.post("/capture", async (request) => {
    await caller(request);
    const batch = CaptureBatch.parse(request.body);
    return store.capture(batch);
  });

  app.get("/conversations", async (request) => {
    await caller(request);
    const { projectId } = request.query as any;
    return store.conversations(projectId || undefined);
  });

  app.post("/conversations/:id/pause", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    const { paused } = (request.body ?? {}) as any;
    return store.pauseConversation(decodeURIComponent(id), paused !== false);
  });

  app.post("/conversations/:id/untrack", async (request) => {
    await caller(request);
    return store.untrackConversation(
      decodeURIComponent((request.params as any).id),
    );
  });

  app.delete("/conversations/:id", async (request) => {
    await caller(request);
    return store.forgetConversation(
      decodeURIComponent((request.params as any).id),
    );
  });

  app.post("/conversations/:id/error", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    await store.setConversationError(
      decodeURIComponent(id),
      String((request.body as any)?.error ?? "unknown"),
    );
    return { ok: true };
  });

  // ---- context --------------------------------------------------------------

  app.get("/projects/:id/context", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    const { q } = request.query as any;
    const messages = await store.context(id, q ?? "");
    return messages.map((m) => ({
      id: m.id,
      origin: m.provider,
      role: m.metadata?.role,
      url: m.url,
      revision: m.revision,
      time: m.source_time,
      timestampObserved: !!m.metadata?.timestampObserved,
      text: m.text.slice(0, 4000),
    }));
  });

  app.post("/projects/:id/extract", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    const { query } = (request.body ?? {}) as any;
    if (!modelConfigured())
      throw new AppError(
        "MODEL_SETUP",
        "No model is configured. Set GEMINI_API_KEY in your environment before extracting context.",
        503,
      );
    return extractItems(store, model, id, query ?? "");
  });

  app.get("/projects/:id/items", async (request) => {
    await caller(request);
    return store.items((request.params as any).id);
  });

  app.patch("/items/:id", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    return store.reviseItem(id, (request.body ?? {}) as any);
  });

  // ---- plans ----------------------------------------------------------------

  app.post("/projects/:id/plan", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    const body = (request.body ?? {}) as any;
    if (!modelConfigured())
      throw new AppError(
        "MODEL_SETUP",
        "No model is configured. Set GEMINI_API_KEY before generating a plan.",
        503,
      );
    const project = await store.project(id);
    return compilePlan(store, model, project, {
      objective: body.objective,
      query: body.query,
      backend: body.backend ? Backend.parse(body.backend) : undefined,
    });
  });

  app.get("/plans", async (request) => {
    await caller(request);
    const { projectId } = request.query as any;
    return store.plans(projectId || undefined);
  });

  app.get("/plans/:id", async (request) => {
    await caller(request);
    const plan = await store.plan((request.params as any).id);
    return { ...plan, freshness: await planIsFresh(store, plan) };
  });

  app.post("/plans/:id/approve", async (request) => {
    requireOwner(await caller(request));
    const { id } = request.params as any;
    const body = (request.body ?? {}) as any;
    const plan = await store.plan(id);
    if (plan.status !== "awaiting_approval")
      throw new AppError("PLAN_STATE", `Plan is ${plan.status}`, 409);
    if (body.digest && body.digest !== plan.digest)
      throw new AppError(
        "DIGEST",
        "The plan changed since it was displayed",
        409,
      );
    const freshness = await planIsFresh(store, plan);
    if (!freshness.fresh) {
      await store.putPlan({ ...plan, status: "superseded" });
      throw new AppError("STALE_PLAN", freshness.reason, 409);
    }
    if (body.decision === "reject") {
      await store.putPlan({ ...plan, status: "rejected" });
      await store.db.audit(store.tenant, "owner", "plan.reject", plan.id);
      return { status: "rejected" };
    }
    const approved: Plan = { ...plan, status: "approved" };
    await store.putPlan(approved);
    await store.db.audit(store.tenant, "owner", "plan.approve", plan.id, {
      digest: plan.digest,
      backend: plan.backend,
    });
    const task = await runner.enqueue(
      approved,
      body.backend ? Backend.parse(body.backend) : undefined,
    );
    return { status: "approved", task };
  });

  // ---- tasks ----------------------------------------------------------------

  app.get("/tasks", async (request) => {
    await caller(request);
    const { projectId } = request.query as any;
    return store.tasks(projectId || undefined);
  });

  app.get("/tasks/:id", async (request) => {
    await caller(request);
    const { id } = request.params as any;
    const task = await store.task(id);
    return {
      ...task,
      events: runner.recent(id),
      result: await store.control("last-result:" + id),
    };
  });

  /** States a task can still be stopped from. Anything else is finished and keeps its result. */
  const CANCELLABLE = new Set([
    "queued",
    "waiting_for_runner",
    "preparing",
    "running",
    "verifying",
  ]);

  app.post("/tasks/:id/cancel", async (request) => {
    requireOwner(await caller(request));
    const { id } = request.params as any;
    const task = await store.task(id);
    if (!CANCELLABLE.has(task.state))
      throw new AppError(
        "TASK_FINISHED",
        `Task is already ${task.state}; cancelling would discard its result.`,
        409,
      );
    const wasRunning = runner.cancel(id);
    // A running task is aborted and records its own cancellation; a waiting one is marked here.
    if (!wasRunning) await store.patchTask(id, { state: "cancelled" });
    return { cancelled: true, wasRunning, previousState: task.state };
  });

  app.post("/tasks/:id/pull-request", async (request) => {
    requireOwner(await caller(request));
    const { id } = request.params as any;
    const task = await store.task(id);
    if (task.state !== "ready")
      throw new AppError(
        "TASK_STATE",
        "Only a verified task can open a pull request",
        409,
      );
    const plan = await store.plan(task.planId!);
    const project = await store.project(task.projectId);
    const result = await store.control<any>("last-result:" + id);
    if (!result?.branch)
      throw new AppError("NO_BRANCH", "No local branch for this task", 409);
    return openPullRequest(
      project,
      plan,
      result.branch,
      safeSummary(plan, task, task.checks ?? []),
    );
  });

  // ---- QA -------------------------------------------------------------------

  app.get("/findings", async (request) => {
    await caller(request);
    const { projectId } = request.query as any;
    return findings(store, projectId || undefined);
  });

  app.post("/projects/:id/scan", async (request) => {
    requireOwner(await caller(request));
    const project = await store.project((request.params as any).id);
    const scan = await scanHead(project);
    try {
      const recorded = await record(
        store,
        project,
        scan.sha,
        scan.checks,
        "manual",
      );
      return { sha: scan.sha, checks: scan.checks, findings: recorded };
    } finally {
      // The scan copy exists only to run the checks; keeping it would grow without bound.
      await discardWorkspace(scan.dir);
    }
  });

  // ---- saved-file watching --------------------------------------------------
  //
  // The watcher lives in the service because the embedded database is single-process: a second
  // CLI process opening it directly would fight the running service for the same files.

  const watchers = new Map<string, { handle: WatchHandle; results: any[] }>();

  app.get("/watchers", async (request) => {
    await caller(request);
    return [...watchers.entries()].map(([projectId, entry]) => ({
      projectId,
      results: entry.results.slice(-20),
    }));
  });

  app.post("/projects/:id/watch", async (request) => {
    requireOwner(await caller(request));
    const { id } = request.params as any;
    const enabled = (request.body as any)?.enabled !== false;
    const existing = watchers.get(id);
    if (!enabled) {
      await existing?.handle.stop();
      watchers.delete(id);
      return { watching: false };
    }
    if (existing) return { watching: true, alreadyRunning: true };
    const project = await store.project(id);
    const entry: { handle: WatchHandle; results: any[] } = {
      handle: null as any,
      results: [],
    };
    entry.handle = await watchSavedFiles(store, project, (info) => {
      entry.results.push({ ...info, at: new Date().toISOString() });
      if (entry.results.length > 60) entry.results.splice(0, 20);
    });
    watchers.set(id, entry);
    void entry.handle.scanNow();
    return { watching: true, folder: project.repo?.path };
  });

  app.post("/findings/:id/repair", async (request) => {
    requireOwner(await caller(request));
    const { id } = request.params as any;
    const found = await finding(store, id);
    const project = await store.project(found.projectId);
    const allowed = repairAllowed(project, found);
    if (!allowed.ok) throw new AppError("REPAIR_BLOCKED", allowed.reason, 409);
    if (!modelConfigured())
      throw new AppError(
        "MODEL_SETUP",
        "Set GEMINI_API_KEY before compiling a repair plan",
        503,
      );
    await noteRepairAttempt(store, id);
    const plan = await compilePlan(store, model, project, {
      objective: `Repair finding ${found.id}: check '${found.rule}' fails with: ${found.output.slice(0, 1500)}`,
      query: found.rule,
    });
    if (project.mode === "observe" || project.mode === "approval")
      return { plan, autoQueued: false };
    // Bounded automatic repair: only inside the configured automatic paths.
    const inAutoScope = plan.affectedPaths.every((p) =>
      project.autoPaths.some((prefix) =>
        prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix,
      ),
    );
    if (!inAutoScope)
      return {
        plan,
        autoQueued: false,
        reason: "Outside the automatic path scope.",
      };
    const approved: Plan = { ...plan, status: "approved" };
    await store.putPlan(approved);
    const task = await runner.enqueue(approved);
    return { plan: approved, autoQueued: true, task };
  });

  // ---- pairing --------------------------------------------------------------

  app.post("/pair/start", async (request) => {
    requireOwner(await caller(request));
    return createPairingCode(store);
  });

  app.post("/pair/redeem", async (request) => {
    // Deliberately unauthenticated: the short-lived code the user typed is the credential.
    const { code, extensionId } = (request.body ?? {}) as any;
    const issued = await redeemPairingCode(
      store,
      String(code ?? ""),
      String(extensionId ?? "unknown"),
    );
    return { token: issued };
  });

  app.post("/pair/revoke", async (request) => {
    requireOwner(await caller(request));
    await revokeClients(store);
    return { ok: true };
  });

  // ---- coding-session observers --------------------------------------------

  app.get("/observers", async (request) => {
    await caller(request);
    return {
      state: observerState,
      subscriptions: await observers.subscriptions(store),
    };
  });

  app.get("/observers/sessions", async (request) => {
    await caller(request);
    const [claude, codexSessions] = await Promise.all([
      observers.claudeCode.listTranscripts(),
      observers.codex.listRollouts(),
    ]);
    return {
      "claude-code": claude.map((t) => ({
        sessionId: t.sessionId,
        file: t.file,
        slug: t.slug,
        modifiedAt: t.modifiedAt,
        bytes: t.bytes,
      })),
      codex: codexSessions.map((r) => ({
        sessionId: r.sessionId,
        file: r.file,
        startedAt: r.startedAt,
        modifiedAt: r.modifiedAt,
        bytes: r.bytes,
      })),
    };
  });

  app.post("/observers/subscribe", async (request) => {
    requireOwner(await caller(request));
    const body = (request.body ?? {}) as any;
    await store.project(String(body.projectId));
    const list = await observers.subscribe(store, {
      projectId: String(body.projectId),
      origin: body.origin === "codex" ? "codex" : "claude-code",
      sessionId: String(body.sessionId),
      file: String(body.file),
    });
    const result = await observers.sweep(store, observerState);
    return { subscriptions: list, captured: result.captured };
  });

  app.post("/observers/unsubscribe", async (request) => {
    requireOwner(await caller(request));
    const body = (request.body ?? {}) as any;
    return observers.unsubscribe(
      store,
      String(body.origin),
      String(body.sessionId),
    );
  });

  app.post("/observers/sweep", async (request) => {
    await caller(request);
    return observers.sweep(store, observerState);
  });

  const host = options.host ?? "127.0.0.1";
  const port =
    options.port ?? Number(process.env.SHADOWQA_INDIVIDUAL_PORT ?? 4390);

  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  return {
    app,
    runner,
    observerState,
    store,
    async listen() {
      await app.listen({ host, port });
      const url = `http://${host}:${port}`;
      await writeEndpoint(url);
      runner.start();
      await observers.sweep(store, observerState).catch(() => undefined);
      sweepTimer = setInterval(
        () => void observers.sweep(store, observerState).catch(() => undefined),
        Number(process.env.SHADOWQA_INDIVIDUAL_SWEEP_MS ?? 15_000),
      );
      return url;
    },
    async close() {
      clearInterval(sweepTimer);
      for (const entry of watchers.values()) await entry.handle.stop();
      watchers.clear();
      await runner.stop();
      await app.close();
    },
  };
}

export const newTaskId = randomUUID;
export { observers };
