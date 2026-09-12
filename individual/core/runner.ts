import { randomUUID } from "node:crypto";
import { AppError, sanitize } from "../../src/core/security.js";
import { backendFor, detectAll } from "./backends.js";
import { checksPassed, discardWorkspace, executePlan } from "./execute.js";
import { commitToBranch } from "./publish.js";
import { planIsFresh } from "./plan.js";
import { record } from "./qa.js";
import type { Backend, Plan, Task } from "./contracts.js";
import type { Store } from "./store.js";

export type RunnerEvent = {
  taskId: string;
  state: Task["state"];
  message: string;
  at: string;
};

/**
 * One task at a time per project. The loop is deliberately small: everything that decides
 * whether work may proceed lives in plan freshness, the patch review and the check verdict.
 */
export class Runner {
  private active = new Map<string, AbortController>();
  private timer?: ReturnType<typeof setInterval>;
  private events: RunnerEvent[] = [];
  private stopped = false;

  constructor(
    private store: Store,
    private onEvent: (event: RunnerEvent) => void = () => {},
  ) {}

  recent(taskId?: string) {
    return this.events
      .filter((e) => !taskId || e.taskId === taskId)
      .slice(-200);
  }

  private emit(taskId: string, state: Task["state"], message: string) {
    const event = {
      taskId,
      state,
      message: sanitize(message).slice(0, 2000),
      at: new Date().toISOString(),
    };
    this.events.push(event);
    if (this.events.length > 800) this.events.splice(0, 200);
    this.onEvent(event);
  }

  start(intervalMs = 2000) {
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  cancel(taskId: string) {
    const controller = this.active.get(taskId);
    if (controller) controller.abort();
    return !!controller;
  }

  async enqueue(plan: Plan, backend?: Backend): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      projectId: plan.projectId,
      planId: plan.id,
      kind: "plan",
      state: "queued",
      backend: backend ?? plan.backend,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.putTask(task);
    this.emit(task.id, "queued", `Queued for ${task.backend}.`);
    return task;
  }

  /** When a backend is missing, retry slowly instead of probing it every tick. */
  private retryAfter = new Map<string, number>();
  private static readonly WAIT_BACKOFF_MS = 30_000;

  private async tick() {
    if (this.stopped) return;
    const tasks = await this.store.tasks();
    const busy = new Set(
      tasks.filter((t) => this.active.has(t.id)).map((t) => t.projectId),
    );
    const now = Date.now();
    const next = tasks
      .filter((t) => t.state === "queued" || t.state === "waiting_for_runner")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .find(
        (t) =>
          !busy.has(t.projectId) && (this.retryAfter.get(t.id) ?? 0) <= now,
      );
    if (!next) return;
    const controller = new AbortController();
    this.active.set(next.id, controller);
    try {
      await this.execute(next, controller.signal);
    } catch (e: any) {
      const cancelled = controller.signal.aborted;
      await this.store.patchTask(next.id, {
        state: cancelled ? "cancelled" : "failed",
        error: sanitize(String(e?.message ?? e)).slice(0, 2000),
      });
      this.emit(
        next.id,
        cancelled ? "cancelled" : "failed",
        String(e?.message ?? e),
      );
    } finally {
      this.active.delete(next.id);
    }
  }

  private async execute(task: Task, signal: AbortSignal) {
    const project = await this.store.project(task.projectId);
    const plan = task.planId ? await this.store.plan(task.planId) : undefined;
    if (!plan) throw new AppError("NO_PLAN", "Task has no plan");

    const available = (await detectAll()).find((b) => b.id === task.backend);
    if (!available?.available) {
      this.retryAfter.set(task.id, Date.now() + Runner.WAIT_BACKOFF_MS);
      const reason = available?.reason ?? `${task.backend} is not installed.`;
      if (task.state !== "waiting_for_runner") {
        await this.store.patchTask(task.id, {
          state: "waiting_for_runner",
          error: reason,
        });
        this.emit(
          task.id,
          "waiting_for_runner",
          reason + " Waiting for it to become available.",
        );
      }
      return;
    }
    this.retryAfter.delete(task.id);

    if (plan.status !== "approved")
      throw new AppError("NOT_APPROVED", "Plan is not approved");
    const freshness = await planIsFresh(this.store, plan);
    if (!freshness.fresh) {
      await this.store.putPlan({ ...plan, status: "superseded" });
      throw new AppError("STALE_PLAN", freshness.reason);
    }

    await this.store.patchTask(task.id, {
      state: "preparing",
      attempts: task.attempts + 1,
    });
    this.emit(
      task.id,
      "preparing",
      "Building an isolated copy of the base commit.",
    );

    const result = await executePlan(
      this.store,
      project,
      plan,
      task,
      signal,
      (kind, text) => this.emit(task.id, "running", `${kind}: ${text}`),
    );

    // The agent's own verdict is recorded, never trusted: the check verdict decides.
    this.emit(
      task.id,
      "verifying",
      `Agent reported ${result.agentReportedSuccess ? "success" : "failure"}; checks decide.`,
    );
    for (const check of result.checks)
      this.emit(
        task.id,
        "verifying",
        `${check.id}: exit ${check.exitCode}${check.timedOut ? " (timed out)" : ""} in ${check.durationMs} ms`,
      );

    await record(
      this.store,
      project,
      plan.baseSha,
      result.checks,
      "agent-changes",
    );

    const verdict = checksPassed(project, result.checks);
    const clean = verdict.ok && !result.unexpected.length;
    let branch: string | undefined;
    let commit: string | undefined;
    if (clean) {
      const published = await commitToBranch(
        project,
        plan,
        task,
        result.verifyDir,
        result.review.files,
      );
      branch = published.branch;
      commit = published.commit;
      this.emit(
        task.id,
        "ready",
        `Committed to local branch ${branch} (${commit.slice(0, 8)}).`,
      );
    } else {
      this.emit(
        task.id,
        "needs_review",
        verdict.missing.length
          ? "Required checks did not run: " + verdict.missing.join(", ")
          : verdict.failed.length
            ? "Required checks failed: " +
              verdict.failed.map((c) => c.id).join(", ")
            : "Files changed outside the plan: " + result.unexpected.join(", "),
      );
    }

    await this.store.patchTask(task.id, {
      state: clean ? "ready" : "needs_review",
      diff: result.diff,
      checks: result.checks,
      sessionRef: result.sessionRef,
      workspace: result.workspace,
      error: clean
        ? undefined
        : "Verification did not pass; the diff is kept for review.",
    });
    await this.store.putPlan({ ...plan, status: "executed" });
    await this.store.setControl("last-result:" + task.id, {
      attach: result.attach,
      branch,
      commit,
      verifyDir: result.verifyDir,
      risks: result.review.risks,
      unexpected: result.unexpected,
      agentReportedSuccess: result.agentReportedSuccess,
    });
    if (clean) await discardWorkspace(result.verifyDir);
  }
}

export const backendLabel = (id: Backend) => backendFor(id).label;
