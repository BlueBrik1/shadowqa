import { randomUUID } from "node:crypto";
import type { Database } from "../db/database.js";
import type { CheckResult, Principal } from "../core/contracts.js";
import { authorize, hash, sanitize } from "../core/security.js";
export type Finding = {
  id: string;
  projectId: string;
  fingerprint: string;
  rule: string;
  sha: string;
  severity: string;
  state: string;
  classification: string;
  output: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  suppressedUntil?: string;
  repairAttempts: number;
  lastRepair?: string;
};
export function classify(result: CheckResult, baseline?: CheckResult) {
  if (result.exitCode === 0 && !result.timedOut) return "passing";
  if (
    result.timedOut ||
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Cannot find module|command not found|ENOENT|ENOSPC|out of memory/i.test(
      result.output,
    )
  )
    return "environment";
  if (baseline && baseline.exitCode !== 0) return "pre-existing";
  return baseline?.exitCode === 0 ? "regression" : "unverified";
}
export class QA {
  constructor(private db: Database) {}
  async record(
    tenant: string,
    projectId: string,
    sha: string,
    checks: CheckResult[],
    baseline: CheckResult[] = [],
    repeated = false,
  ) {
    const results: Finding[] = [];
    for (let check of checks) {
      const previous = baseline.find((c) => c.id === check.id);
      const flaky =
        repeated &&
        check.exitCode === 0 &&
        !!previous &&
        previous.exitCode !== 0;
      if (check.exitCode === 0 && !check.timedOut && !flaky) continue;
      if (flaky) check = previous!;
      const signature = sanitize(check.output)
        .replace(/[a-f0-9]{40,64}/g, "<sha>")
        .replace(/\b\d+(?:\.\d+)?(?:ms|s)\b/g, "<duration>")
        .replace(/:\d+:\d+/g, ":<line>")
        .slice(-8000);
      const fingerprint = hash({ projectId, rule: check.id, signature });
      await this.db.tx(async (db) => {
        await db.rows(
          "SELECT id FROM entities WHERE tenant=$1 AND kind='project' AND id=$2 FOR UPDATE",
          [tenant, projectId],
        );
        const old = await db.get<Finding>(tenant, "finding", fingerprint);
        const now = new Date().toISOString();
        const classification = flaky
          ? "flaky"
          : classify(
              check,
              baseline.find((c) => c.id === check.id),
            );
        const finding: Finding = {
          ...old,
          id: fingerprint,
          projectId,
          fingerprint,
          rule: check.id,
          sha,
          severity: "medium",
          state:
            old?.state === "suppressed" &&
            Date.parse(old.suppressedUntil ?? "") > Date.now()
              ? "suppressed"
              : "open",
          classification:
            repeated && classification === "pre-existing"
              ? "reproduced"
              : classification,
          output: signature,
          occurrences: (old?.occurrences ?? 0) + 1,
          firstSeen: old?.firstSeen ?? now,
          lastSeen: now,
          repairAttempts: old?.repairAttempts ?? 0,
          lastRepair: old?.lastRepair,
          suppressedUntil: old?.suppressedUntil,
        };
        await db.put(tenant, "finding", fingerprint, finding, projectId);
        await db.put(
          tenant,
          "occurrence",
          randomUUID(),
          { fingerprint, sha, checkId: check.id, time: now },
          projectId,
        );
        results.push(finding);
      });
    }
    return results;
  }
  async suppress(actor: Principal, id: string, reason: string, hours: number) {
    const f = await this.db.get<Finding>(actor.tenant, "finding", id);
    if (!f) throw new Error("Finding not found");
    authorize(actor, f.projectId, ["admin", "developer"]);
    await this.db.put(
      actor.tenant,
      "finding",
      id,
      {
        ...f,
        state: "suppressed",
        suppressedUntil: new Date(Date.now() + hours * 3600_000).toISOString(),
      },
      f.projectId,
    );
    await this.db.audit(actor.tenant, actor.id, "finding.suppress", id, {
      reason: sanitize(reason),
      hours,
    });
  }
}
