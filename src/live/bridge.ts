/**
 * ShadowQA Live ↔ ShadowQA service.
 *
 * Live (live/backend) watches an application while it runs and turns a failing click into a
 * verified patch. The service owns projects, automation modes, findings and approvals. This
 * module is the seam between the two:
 *
 *   GET  /live/policy/:project                 mode that governs what Live may do on its own
 *   POST /live/projects/:id/incidents          Live reports an incident → it becomes a finding
 *   GET  /live/projects/:id/incidents          live findings for a project
 *   POST /live/projects/:id/actions            CLI asks Live to approve / undo / open a PR
 *   POST /live/projects/:id/actions/lease      Live picks those requests up
 *
 * A Live finding has `detector: "live"` and `rule: "live:<route>"`; its id is the incident id,
 * so `shadowqa repair <finding>` on it delegates to Live instead of compiling a Gemini plan.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/database.js";
import type { Principal } from "../core/contracts.js";
import { AppError, authorize, sanitize } from "../core/security.js";
import type { Finding } from "../qa/findings.js";

export const LIVE_PREFIX = "live:";
export const LiveStatus = z.enum([
  "captured",
  "diagnosing",
  "diagnosed",
  "applying",
  "validating",
  "validation_failed",
  "awaiting_replay",
  "replaying",
  "verified",
  "replay_failed",
  "rolled_back",
  "committed",
  "dismissed",
  "failed",
]);
export const LiveIncident = z.object({
  incidentId: z.string().min(1).max(80),
  status: LiveStatus,
  title: z.string().max(200),
  fingerprint: z.string().max(200).nullish(),
  regression: z.boolean().default(false),
  route: z.string().max(400).nullish(),
  failure: z
    .object({
      type: z.string().max(80).nullish(),
      message: z.string().max(400).nullish(),
    })
    .default({}),
  location: z
    .object({
      file: z.string().max(400).nullish(),
      line: z.number().int().nullish(),
      side: z.string().max(20).nullish(),
    })
    .default({}),
  chain: z.array(z.string().max(80)).max(10).default([]),
  rootCause: z.string().max(400).default(""),
  confidence: z.number().nullish(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).nullish(),
  files: z.array(z.string().max(400)).max(20).default([]),
  lines: z.number().int().nullish(),
  verified: z.boolean().default(false),
  telemetry: z.record(z.string(), z.any()).default({}),
  git: z
    .object({
      branch: z.string().max(200).nullish(),
      pr: z.string().max(400).nullish(),
    })
    .default({}),
  source: z.string().max(20).default("runtime"),
});
export type LiveIncident = z.infer<typeof LiveIncident>;
export const LiveActionKind = z.enum(["approve", "undo", "pr", "dismiss"]);
export type LiveAction = {
  id: string;
  projectId: string;
  incidentId: string;
  kind: z.infer<typeof LiveActionKind>;
  actor: string;
  state: "queued" | "leased";
  createdAt: string;
  leasedAt?: string;
};
export type LiveFinding = Finding & {
  detector: "live";
  live: LiveIncident & { reportedAt: string };
};

export const isLiveFinding = (f: Finding | undefined): f is LiveFinding =>
  !!f && (f as any).detector === "live";

/** Live states → the finding vocabulary the CLI already prints. */
export function classifyLive(inc: LiveIncident): {
  state: string;
  classification: string;
  severity: string;
} {
  const resolved = inc.status === "verified" || inc.status === "committed";
  const dismissed = inc.status === "dismissed";
  return {
    state: resolved ? "resolved" : dismissed ? "suppressed" : "open",
    classification: resolved
      ? "repaired"
      : inc.status === "diagnosed"
        ? "patch-ready"
        : [
              "validation_failed",
              "replay_failed",
              "rolled_back",
              "failed",
            ].includes(inc.status)
          ? "repair-failed"
          : inc.regression
            ? "regression"
            : "observed",
    severity:
      inc.risk === "HIGH" ? "high" : inc.risk === "LOW" ? "low" : "medium",
  };
}

export function toFinding(
  projectId: string,
  input: LiveIncident,
  old?: Finding,
): LiveFinding {
  const inc = LiveIncident.parse(input); // fills defaults for callers with partial objects
  const now = new Date().toISOString();
  const { state, classification, severity } = classifyLive(inc);
  const output = sanitize(
    [
      `${inc.failure.type ?? "Failure"}: ${inc.failure.message ?? ""}`.trim(),
      inc.location.file
        ? `at ${inc.location.file}:${inc.location.line ?? "?"} (${inc.location.side ?? "app"})`
        : "",
      inc.chain.length ? `chain: ${inc.chain.join(" → ")}` : "",
      inc.rootCause ? `root cause: ${inc.rootCause}` : "",
      inc.files.length
        ? `patch: ${inc.files.join(", ")} (${inc.lines ?? "?"} lines, ${inc.risk ?? "?"} risk)`
        : "",
      inc.git.pr ? `pr: ${inc.git.pr}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return {
    ...(old as Finding | undefined),
    id: inc.incidentId,
    projectId,
    fingerprint: inc.fingerprint ?? inc.incidentId,
    rule: LIVE_PREFIX + (inc.route ?? inc.failure.type ?? "runtime"),
    sha: old?.sha ?? "live",
    severity,
    state,
    classification,
    output,
    occurrences: (old?.occurrences ?? 0) + (old ? 0 : 1),
    firstSeen: old?.firstSeen ?? now,
    lastSeen: now,
    repairAttempts: old?.repairAttempts ?? 0,
    lastRepair: old?.lastRepair,
    suppressedUntil: old?.suppressedUntil,
    detector: "live",
    live: { ...inc, reportedAt: now },
  };
}

const params = (r: FastifyRequest) => r.params as Record<string, string>;
const actor = (r: FastifyRequest) => (r as any).principal as Principal;

export async function enqueueAction(
  db: Database,
  a: Principal,
  projectId: string,
  incidentId: string,
  kind: LiveAction["kind"],
): Promise<LiveAction> {
  authorize(a, projectId, ["admin", "developer"]);
  const action: LiveAction = {
    id: randomUUID(),
    projectId,
    incidentId,
    kind,
    actor: a.id,
    state: "queued",
    createdAt: new Date().toISOString(),
  };
  await db.put(a.tenant, "live-action", action.id, action, projectId);
  await db.audit(a.tenant, a.id, `live.${kind}`, incidentId, { projectId });
  return action;
}

export function registerLiveRoutes(
  api: FastifyInstance,
  db: Database,
  body: (r: FastifyRequest) => any,
) {
  api.get("/live/policy/:project", async (r) => {
    const a = actor(r),
      id = params(r).project;
    authorize(a, id, ["admin", "developer", "viewer", "runner"]);
    const p = await db.project(a.tenant, id);
    return {
      project: id,
      mode: p.policy.mode,
      version: p.policy.version,
      paused: !!(await db.get(a.tenant, "control", "kill")),
    };
  });
  api.post("/live/projects/:id/incidents", async (r) => {
    const a = actor(r),
      projectId = params(r).id;
    authorize(a, projectId, ["admin", "developer", "runner"]);
    await db.project(a.tenant, projectId);
    const inc = LiveIncident.parse(body(r));
    const finding = await db.tx(async (tx) => {
      const old = await tx.get<Finding>(a.tenant, "finding", inc.incidentId);
      if (old && old.projectId !== projectId)
        throw new AppError("PROJECT", "Incident belongs to another project");
      const next = toFinding(projectId, inc, old);
      await tx.put(a.tenant, "finding", next.id, next, projectId);
      await tx.put(
        a.tenant,
        "occurrence",
        randomUUID(),
        {
          fingerprint: next.fingerprint,
          sha: "live",
          checkId: next.rule,
          time: next.lastSeen,
          status: inc.status,
        },
        projectId,
      );
      await tx.audit(a.tenant, a.id, "live.incident", next.id, {
        status: inc.status,
        risk: inc.risk ?? null,
        verified: inc.verified,
      });
      return next;
    });
    return {
      findingId: finding.id,
      state: finding.state,
      classification: finding.classification,
    };
  });
  api.get("/live/projects/:id/incidents", async (r) => {
    const a = actor(r),
      projectId = params(r).id;
    authorize(a, projectId);
    return (await db.list<Finding>(a.tenant, "finding", projectId)).filter(
      isLiveFinding,
    );
  });
  api.post("/live/projects/:id/actions", async (r) => {
    const a = actor(r),
      projectId = params(r).id;
    const input = z
      .object({ incidentId: z.string().min(1).max(80), kind: LiveActionKind })
      .parse(body(r));
    const f = await db.get<Finding>(a.tenant, "finding", input.incidentId);
    if (!f || !isLiveFinding(f) || f.projectId !== projectId)
      throw new AppError(
        "NOT_FOUND",
        "Live incident not found for this project",
        404,
      );
    return enqueueAction(db, a, projectId, input.incidentId, input.kind);
  });
  api.post("/live/projects/:id/actions/lease", async (r) => {
    const a = actor(r),
      projectId = params(r).id;
    authorize(a, projectId, ["admin", "developer", "runner"]);
    const queued = (
      await db.list<LiveAction>(a.tenant, "live-action", projectId)
    )
      .filter((x) => x.state === "queued")
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
      .slice(0, 10);
    const leasedAt = new Date().toISOString();
    for (const action of queued)
      await db.put(
        a.tenant,
        "live-action",
        action.id,
        { ...action, state: "leased", leasedAt },
        projectId,
      );
    return { actions: queued };
  });
}
