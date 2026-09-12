import { randomUUID } from "node:crypto";
import type { Database } from "../db/database.js";
import type {
  CheckResult,
  Job,
  JobState,
  Plan,
  Principal,
} from "../core/contracts.js";
import {
  AppError,
  authorize,
  hash,
  token,
  sanitize,
} from "../core/security.js";
import { canAuto, fresh, validatePatch } from "../policy/engine.js";
const active = ["leased", "preparing", "running", "verifying"];
const transitions: Partial<Record<JobState, JobState[]>> = {
  leased: ["preparing", "failed", "blocked"],
  preparing: ["running", "verifying", "failed", "blocked"],
  running: ["verifying", "failed", "quota_paused", "blocked"],
  verifying: ["running", "failed", "blocked", "ready_to_publish", "resolved"],
};
export class Scheduler {
  constructor(private db: Database) {}
  async challenge(actor: Principal, planId: string) {
    const plan = await this.db.get<Plan>(actor.tenant, "plan", planId);
    if (!plan) throw new AppError("NOT_FOUND", "Plan not found", 404);
    authorize(actor, plan.projectId, ["admin", "developer"]);
    const project = await this.db.project(actor.tenant, plan.projectId);
    await fresh(this.db, actor.tenant, plan, project);
    const nonce = token(),
      id = randomUUID(),
      expiry = new Date(Date.now() + 10 * 60_000).toISOString();
    await this.db.rows(
      "INSERT INTO approvals(tenant,id,project_id,plan_id,plan_digest,base_sha,policy_version,actor_id,nonce_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        actor.tenant,
        id,
        plan.projectId,
        plan.id,
        plan.digest,
        plan.baseSha,
        plan.policyVersion,
        actor.id,
        hash(nonce),
        expiry,
      ],
    );
    return { id, nonce, expiresAt: expiry, digest: plan.digest, plan };
  }
  async approve(
    actor: Principal,
    approvalId: string,
    nonce: string,
    digest: string,
    decision: "approve" | "reject",
  ) {
    return this.db.tx(async (db) => {
      const a = await db.one(
        "SELECT * FROM approvals WHERE tenant=$1 AND id=$2 FOR UPDATE",
        [actor.tenant, approvalId],
      );
      if (
        !a ||
        a.actor_id !== actor.id ||
        a.nonce_hash !== hash(nonce) ||
        a.consumed_at ||
        new Date(a.expires_at) <= new Date() ||
        a.plan_digest !== digest
      )
        throw new AppError(
          "APPROVAL_REPLAY",
          "Approval is invalid, expired, or already used",
        );
      authorize(actor, a.project_id, ["admin", "developer"]);
      const plan = await db.get<Plan>(actor.tenant, "plan", a.plan_id);
      if (!plan || plan.digest !== digest)
        throw new AppError("STALE_PLAN", "Plan changed");
      const project = await db.project(actor.tenant, a.project_id);
      await fresh(db, actor.tenant, plan, project);
      await db.rows(
        "UPDATE approvals SET consumed_at=now(),decision=$3 WHERE tenant=$1 AND id=$2",
        [actor.tenant, a.id, decision],
      );
      await db.audit(actor.tenant, actor.id, `plan.${decision}`, plan.id, {
        digest,
      });
      if (decision === "reject") {
        await db.put(
          actor.tenant,
          "plan",
          plan.id,
          { ...plan, status: "rejected" },
          plan.projectId,
        );
        return { state: "rejected" };
      }
      if (project.policy.mode === "observe")
        throw new AppError(
          "OBSERVE_ONLY",
          "Observation mode does not permit code changes",
        );
      return new Scheduler(db).queuePlan(actor.tenant, plan, actor.id, false);
    });
  }
  async queuePlan(
    tenant: string,
    plan: Plan,
    actor: string,
    automatic = true,
  ): Promise<Job> {
    return this.db.tx(async (db) => {
      await db.rows(
        "SELECT id FROM entities WHERE tenant=$1 AND kind='project' AND id=$2 FOR UPDATE",
        [tenant, plan.projectId],
      );
      const project = await db.project(tenant, plan.projectId);
      await fresh(db, tenant, plan, project);
      if (automatic && !canAuto(plan, project))
        throw new AppError(
          "REVIEW_REQUIRED",
          "This plan requires explicit approval",
        );
      const existing = await db.one<Job>(
        "SELECT * FROM jobs WHERE tenant=$1 AND action_key=$2",
        [tenant, `plan:${plan.digest}`],
      );
      if (existing) return existing;
      const count = await db.one(
        "SELECT count(*)::int AS n FROM jobs WHERE tenant=$1 AND project_id=$2 AND kind='repair' AND created_at>=CURRENT_DATE",
        [tenant, project.id],
      );
      if (count.n >= project.policy.dailyJobCap)
        throw new AppError("JOB_CAP", "Daily repair job cap reached");
      const id = randomUUID();
      const job = await db.one<Job>(
        "INSERT INTO jobs(tenant,id,project_id,plan_id,kind,action_key,data) VALUES($1,$2,$3,$4,'repair',$5,$6) RETURNING *",
        [
          tenant,
          id,
          project.id,
          plan.id,
          `plan:${plan.digest}`,
          JSON.stringify({
            baseSha: plan.baseSha,
            digest: plan.digest,
            policyVersion: plan.policyVersion,
            authorizedBy: actor,
            automatic,
          }),
        ],
      );
      await db.put(
        tenant,
        "plan",
        plan.id,
        { ...plan, status: "queued" },
        plan.projectId,
      );
      await db.audit(tenant, actor, "job.queue", id, {
        plan: plan.id,
        automatic,
      });
      return job!;
    });
  }
  async scan(tenant: string, project: string, sha: string, trigger: string) {
    if (await this.db.get(tenant, "control", "kill")) return;
    const p = await this.db.project(tenant, project);
    if (!p.profile.reviewed) return;
    const id = randomUUID();
    return this.db.one<Job>(
      "INSERT INTO jobs(tenant,id,project_id,kind,action_key,data) VALUES($1,$2,$3,'scan',$4,$5) ON CONFLICT(tenant,action_key) DO NOTHING RETURNING *",
      [
        tenant,
        id,
        project,
        `scan:${sha}:${trigger}`,
        JSON.stringify({
          baseSha: sha,
          trigger,
          policyVersion: p.policy.version,
        }),
      ],
    );
  }
  async lease(actor: Principal): Promise<Job | undefined> {
    authorize(actor, undefined, ["runner"]);
    if (await this.db.get(actor.tenant, "control", "kill")) return;
    return this.db.tx(async (db) => {
      const jobs = await db.rows<Job>(
        `SELECT * FROM jobs j WHERE tenant=$1 AND state='queued' AND project_id=ANY($2::text[])
        AND NOT EXISTS(SELECT 1 FROM jobs a WHERE a.tenant=j.tenant AND a.project_id=j.project_id AND a.state IN ('leased','preparing','running','verifying','quarantined'))
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [actor.tenant, actor.projects],
      );
      const job = jobs[0];
      if (!job) return;
      const lock = await db.one(
        "SELECT id FROM entities WHERE tenant=$1 AND kind='project' AND id=$2 FOR UPDATE SKIP LOCKED",
        [actor.tenant, job.project_id],
      );
      if (!lock) return;
      if (
        await db.one(
          "SELECT id FROM jobs WHERE tenant=$1 AND project_id=$2 AND state IN ('leased','preparing','running','verifying','quarantined') LIMIT 1",
          [actor.tenant, job.project_id],
        )
      )
        return;
      const project = await db.project(actor.tenant, job.project_id);
      if (job.kind === "repair") {
        const plan = await db.get<Plan>(actor.tenant, "plan", job.plan_id!);
        if (!plan) throw new AppError("PLAN_MISSING", "Plan missing");
        try {
          await fresh(db, actor.tenant, plan, project);
        } catch {
          await db.rows(
            "UPDATE jobs SET state='superseded' WHERE tenant=$1 AND id=$2",
            [actor.tenant, job.id],
          );
          return;
        }
      }
      return db.one<Job>(
        "UPDATE jobs SET state='leased',runner_id=$3,fence=fence+1,lease_until=now()+interval '60 seconds',attempts=attempts+1,updated_at=now() WHERE tenant=$1 AND id=$2 RETURNING *",
        [actor.tenant, job.id, actor.id],
      );
    });
  }
  async owned(
    db: Database,
    actor: Principal,
    id: string,
    fence: number,
  ): Promise<Job> {
    authorize(actor, undefined, ["runner"]);
    const job = await db.one<Job>(
      "SELECT * FROM jobs WHERE tenant=$1 AND id=$2 FOR UPDATE",
      [actor.tenant, id],
    );
    if (
      !job ||
      job.runner_id !== actor.id ||
      job.fence !== fence ||
      !job.lease_until ||
      Date.parse(job.lease_until) <= Date.now() ||
      !active.includes(job.state)
    )
      throw new AppError(
        "FENCED",
        "Lease expired, cancelled, or belongs to another executor",
        409,
      );
    authorize(actor, job.project_id, ["runner"]);
    await db.project(actor.tenant, job.project_id);
    if (await db.get(actor.tenant, "control", "kill"))
      throw new AppError("KILL_SWITCH", "Workspace is paused", 409);
    return job;
  }
  async heartbeat(actor: Principal, id: string, fence: number) {
    return this.db.tx(async (db) => {
      await this.owned(db, actor, id, fence);
      await db.rows(
        "UPDATE jobs SET lease_until=now()+interval '60 seconds',updated_at=now() WHERE tenant=$1 AND id=$2",
        [actor.tenant, id],
      );
      return { leaseSeconds: 60 };
    });
  }
  async event(
    actor: Principal,
    id: string,
    fence: number,
    event: { state?: JobState; message?: string; session?: unknown },
  ) {
    if (event.message) event = { ...event, message: sanitize(event.message) };
    return this.db.tx(async (db) => {
      const job = await this.owned(db, actor, id, fence);
      if (
        event.state &&
        event.state !== job.state &&
        !transitions[job.state]?.includes(event.state)
      )
        throw new AppError(
          "STATE_TRANSITION",
          `Invalid ${job.state} → ${event.state}`,
        );
      const n = await db.one(
        "SELECT COALESCE(MAX(sequence),0)+1 AS n FROM job_events WHERE tenant=$1 AND job_id=$2",
        [actor.tenant, id],
      );
      await db.rows(
        "INSERT INTO job_events(tenant,job_id,sequence,fence,event) VALUES($1,$2,$3,$4,$5)",
        [actor.tenant, id, n.n, fence, JSON.stringify(event)],
      );
      await db.rows(
        "UPDATE jobs SET state=$3,data=data || $4::jsonb,updated_at=now() WHERE tenant=$1 AND id=$2",
        [
          actor.tenant,
          id,
          event.state ?? job.state,
          JSON.stringify(event.session ? { session: event.session } : {}),
        ],
      );
      return { sequence: n.n };
    });
  }
  async complete(
    actor: Principal,
    id: string,
    fence: number,
    result: {
      diff: string;
      checks: CheckResult[];
      baseline: CheckResult[];
      baseSha: string;
      attempts: number;
    },
  ) {
    result = {
      ...result,
      checks: result.checks.map((c) => ({ ...c, output: sanitize(c.output) })),
      baseline: result.baseline.map((c) => ({
        ...c,
        output: sanitize(c.output),
      })),
    };
    if (result.diff && sanitize(result.diff) !== result.diff)
      throw new AppError("PATCH_SECRET", "Patch contains a possible secret");
    return this.db.tx(async (db) => {
      const job = await this.owned(db, actor, id, fence);
      const project = await db.project(actor.tenant, job.project_id);
      if (job.state !== "verifying")
        throw new AppError(
          "STATE_TRANSITION",
          "Only an independently verified job can complete",
        );
      if (
        result.baseSha !== job.data.baseSha ||
        !result.checks.length ||
        result.attempts > project.policy.repairAttempts
      )
        throw new AppError(
          "RESULT_SCOPE",
          "Wrong base, missing checks, or exceeded repair budget",
        );
      const passing = project.profile.requiredChecks.every((id) =>
        result.checks.some(
          (c) => c.id === id && c.exitCode === 0 && !c.timedOut,
        ),
      );
      const failed = result.checks.some((c) => c.exitCode !== 0 || c.timedOut);
      let state: JobState =
        job.kind === "scan" ? "resolved" : "ready_to_publish";
      if (!passing || failed) state = "failed";
      if (job.kind === "repair" && state !== "failed") {
        const plan = await db.get<Plan>(actor.tenant, "plan", job.plan_id!);
        await fresh(db, actor.tenant, plan!, project);
        const patch = validatePatch(result.diff, plan!, project);
        if (job.data.automatic && patch.risks.length)
          throw new AppError(
            "REVIEW_REQUIRED",
            "Actual patch requires human review",
          );
        await db.enqueue(actor.tenant, project.id, "publish", `publish:${id}`, {
          jobId: id,
        });
      }
      const artifactId = randomUUID();
      await db.put(
        actor.tenant,
        "artifact",
        artifactId,
        { id: artifactId, jobId: id, ...result, diffDigest: hash(result.diff) },
        project.id,
      );
      await db.rows(
        "UPDATE jobs SET state=$3,lease_until=NULL,data=data || $4::jsonb,updated_at=now() WHERE tenant=$1 AND id=$2",
        [
          actor.tenant,
          id,
          state,
          JSON.stringify({
            artifactId,
            verified: state !== "failed",
            diffDigest: hash(result.diff),
          }),
        ],
      );
      await db.audit(actor.tenant, actor.id, "job.complete", id, {
        state,
        fence,
      });
      return { state, artifactId };
    });
  }
  async cancel(actor: Principal, id: string) {
    const job = await this.db.one<Job>(
      "SELECT * FROM jobs WHERE tenant=$1 AND id=$2",
      [actor.tenant, id],
    );
    if (!job) throw new AppError("NOT_FOUND", "Job not found", 404);
    authorize(actor, job.project_id, ["admin", "developer"]);
    await this.db.tx(async (db) => {
      await db.rows(
        "UPDATE jobs SET state='cancelled',fence=fence+1,lease_until=NULL WHERE tenant=$1 AND id=$2 AND state NOT IN ('merged','resolved','pr_open')",
        [actor.tenant, id],
      );
      await db.audit(actor.tenant, actor.id, "job.cancel", id);
    });
  }
  async reap(tenant: string) {
    // Never automatically reassign a potentially live code executor.
    return this.db.rows(
      "UPDATE jobs SET state='quarantined',fence=fence+1,lease_until=NULL,updated_at=now() WHERE tenant=$1 AND state IN ('leased','preparing','running','verifying') AND lease_until<now() RETURNING id",
      [tenant],
    );
  }
  async kill(actor: Principal, enabled: boolean) {
    authorize(actor, undefined, ["admin"]);
    await this.db.tx(async (db) => {
      if (enabled) {
        await db.put(actor.tenant, "control", "kill", { enabled: true });
        await db.rows(
          "UPDATE jobs SET state='cancelled',fence=fence+1,lease_until=NULL WHERE tenant=$1 AND state IN ('queued','leased','preparing','running','verifying','ready_to_publish')",
          [actor.tenant],
        );
      } else
        await db.rows(
          "DELETE FROM entities WHERE tenant=$1 AND kind='control' AND id='kill'",
          [actor.tenant],
        );
      await db.audit(
        actor.tenant,
        actor.id,
        "workspace.kill-switch",
        actor.tenant,
        { enabled },
      );
    });
  }
}
