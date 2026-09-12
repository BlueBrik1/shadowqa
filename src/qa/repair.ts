import type { Database } from "../db/database.js";
import type { Principal, Plan } from "../core/contracts.js";
import type { Model } from "../model/gemini.js";
import type { Finding } from "./findings.js";
import { AppError, authorize } from "../core/security.js";
import { Planner } from "../planner/planner.js";
import { Scheduler } from "../scheduler/jobs.js";
import { canAuto } from "../policy/engine.js";
import { enqueueAction, isLiveFinding } from "../live/bridge.js";
/** Only explicit CLI repair or a preauthorized standing QA policy enters this path. */
export async function repairFinding(
  db: Database,
  model: Model,
  actor: Principal,
  id: string,
  automatic = false,
) {
  // A Live finding already carries a diagnosed, risk-scored patch. Repairing it means letting
  // Live apply, validate and replay-verify that patch under the project mode — not compiling a
  // second plan for the same failure.
  const existing = await db.get<Finding>(actor.tenant, "finding", id);
  if (isLiveFinding(existing)) {
    authorize(actor, existing.projectId, ["admin", "developer"]);
    const p = await db.project(actor.tenant, existing.projectId);
    if (p.policy.mode === "observe")
      throw new AppError(
        "OBSERVE",
        "Project is in observe mode; Live may diagnose but not edit. Change the mode first.",
      );
    if (existing.live.status !== "diagnosed")
      throw new AppError(
        "LIVE_STATE",
        `Live incident is ${existing.live.status}; only a diagnosed incident can be applied`,
      );
    const action = await enqueueAction(db, actor, existing.projectId, id, "approve");
    await db.put(
      actor.tenant,
      "finding",
      id,
      { ...existing, repairAttempts: existing.repairAttempts + 1, lastRepair: action.createdAt },
      existing.projectId,
    );
    return {
      kind: "live",
      action,
      incident: existing.live,
      message: "Handed to ShadowQA Live: apply → validate → replay → verify (or roll back).",
    };
  }
  const finding = await db.tx(async (tx) => {
    const row = await tx.one(
      "SELECT data FROM entities WHERE tenant=$1 AND kind='finding' AND id=$2 FOR UPDATE",
      [actor.tenant, id],
    );
    if (!row) throw new AppError("NOT_FOUND", "Finding not found", 404);
    const f = row.data as Finding;
    authorize(actor, f.projectId, ["admin", "developer"]);
    const p = await tx.project(actor.tenant, f.projectId);
    if (f.repairAttempts >= p.policy.repairAttempts)
      throw new AppError(
        "REPAIR_CAP",
        "Two repair attempts reached; escalate to a human",
      );
    if (
      f.lastRepair &&
      Date.now() - Date.parse(f.lastRepair) < p.policy.cooldownMinutes * 60_000
    )
      throw new AppError("COOLDOWN", "This finding is in its repair cooldown");
    if (
      automatic &&
      (f.state === "suppressed" ||
        !["reproduced", "regression"].includes(f.classification) ||
        !["auto-fix", "full-auto"].includes(p.policy.mode))
    )
      throw new AppError(
        "UNVERIFIED",
        "Automatic repair requires a reproduced finding and an enabled automatic policy",
      );
    if ((f as any).planId) {
      const existing = await tx.get<Plan>(
        actor.tenant,
        "plan",
        (f as any).planId,
      );
      if (
        existing &&
        !["superseded", "failed", "rejected"].includes(existing.status)
      )
        throw new AppError(
          "EXISTING_REPAIR",
          "A repair plan already exists for this finding",
        );
    }
    const updated = {
      ...f,
      repairAttempts: f.repairAttempts + 1,
      lastRepair: new Date().toISOString(),
    };
    await tx.put(actor.tenant, "finding", id, updated, f.projectId);
    return updated;
  });
  try {
    const plan = await new Planner(db, model).compile(
      actor,
      finding.projectId,
      `Reproduce and repair finding ${finding.id} at SHA ${finding.sha}. Detector: ${finding.rule}. Classification: ${finding.classification}. Do not call it a regression without baseline evidence. Do not remove or weaken checks. Failure evidence: ${finding.output.slice(0, 1600)}`,
    );
    await db.put(
      actor.tenant,
      "finding",
      id,
      { ...finding, planId: plan.id },
      finding.projectId,
    );
    const p = await db.project(actor.tenant, finding.projectId);
    if (plan.status !== "blocked" && canAuto(plan, p)) {
      const job = await new Scheduler(db).queuePlan(
        actor.tenant,
        plan,
        actor.id,
        true,
      );
      await db.rows(
        "UPDATE jobs SET data=data || $3::jsonb WHERE tenant=$1 AND id=$2",
        [actor.tenant, job.id, JSON.stringify({ findingId: id })],
      );
      plan.status = "queued";
    }
    return plan;
  } catch (e: any) {
    await db.audit(actor.tenant, actor.id, "finding.repair-failed", id, {
      code: e.code ?? "FAILED",
    });
    throw e;
  }
}
