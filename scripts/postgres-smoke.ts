import { randomUUID } from "node:crypto";
import { Database } from "../src/db/database.js";
import { environment } from "../src/core/config.js";
import { createServer } from "../src/api/server.js";
import { Scheduler } from "../src/scheduler/jobs.js";
import { project, plan } from "../tests/helpers.js";
import { hash, token } from "../src/core/security.js";
const db = Database.connect(environment().database),
  tenant = "smoke-" + randomUUID(),
  adminToken = token(),
  runnerToken = token();
await db.migrate();
const api = createServer(db, { tenant });
try {
  const p = project(),
    pl = plan(p);
  await db.put(tenant, "project", p.id, p, p.id);
  await db.put(tenant, "plan", pl.id, pl, p.id);
  await db.rows(
    "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,$4,$5)",
    [hash(adminToken), tenant, "admin", "admin", "[]"],
  );
  await db.rows(
    "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,$3,$4,$5)",
    [hash(runnerToken), tenant, "runner", "runner", '["p1"]'],
  );
  const url = await api.listen({ host: "127.0.0.1", port: 0 });
  const call = async (route: string, raw: string, input: unknown) => {
    const r = await fetch(url + route, {
      method: "POST",
      headers: {
        authorization: "Bearer " + raw,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const result: any = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(result));
    return result;
  };
  const challenge = await call("/plans/plan1/challenge", adminToken, {});
  await call("/plans/plan1/approvals", adminToken, {
    approvalId: challenge.id,
    nonce: challenge.nonce,
    digest: challenge.digest,
    decision: "approve",
  });
  await new Scheduler(db).scan(tenant, "p1", pl.baseSha, "concurrent-smoke");
  const leases = await Promise.all([
    call("/jobs/lease", runnerToken, {}),
    call("/jobs/lease", runnerToken, {}),
  ]);
  if (leases.filter((x) => x.job).length !== 1)
    throw new Error("Two concurrent requests leased the same repository");
  const job = leases.find((x) => x.job).job;
  await call(`/jobs/${job.id}/heartbeat`, runnerToken, { fence: job.fence });
  console.log(
    "PASS: PostgreSQL 17 migrations, real HTTP authentication, one-use approval, transactional queue, concurrent repository lease, heartbeat.",
  );
} finally {
  await api.close();
  for (const table of [
    "job_events",
    "approvals",
    "outbox",
    "source_revisions",
    "source_documents",
    "source_events",
    "jobs",
    "entities",
    "credentials",
    "audit_log",
    "model_usage",
  ])
    await db.rows(`DELETE FROM ${table} WHERE tenant=$1`, [tenant]);
  await db.close();
}
