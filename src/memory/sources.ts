import { randomUUID } from "node:crypto";
import type { Database } from "../db/database.js";
import type { Principal, SourceDocument } from "../core/contracts.js";
import { authorize, hash, sanitize } from "../core/security.js";

export class Memory {
  constructor(private db: Database) {}
  async ingest(
    tenant: string,
    provider: string,
    delivery: string,
    payload: unknown,
  ) {
    // Durable inbox is the processing queue: acknowledgement occurs only after this commit.
    const row = await this.db.one(
      "INSERT INTO source_events(tenant,provider,delivery_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING delivery_id",
      [tenant, provider, delivery, JSON.stringify(payload)],
    );
    return !!row;
  }
  async upsert(
    input: Omit<SourceDocument, "id" | "confirmed"> & {
      id?: string;
      confirmed?: boolean;
    },
  ) {
    return this.db.tx(async (db) => {
      await db.rows(
        "SELECT id FROM entities WHERE tenant=$1 AND kind='project' AND id=$2 FOR UPDATE",
        [input.tenant, input.project_id],
      );
      const row = await db.one<SourceDocument>(
        "SELECT * FROM source_documents WHERE tenant=$1 AND provider=$2 AND source_key=$3 FOR UPDATE",
        [input.tenant, input.provider, input.source_key],
      );
      if (
        row &&
        (new Date(row.source_time) > new Date(input.source_time) ||
          row.revision === input.revision ||
          (row.deleted &&
            new Date(row.source_time) >= new Date(input.source_time)))
      )
        return row;
      const id = row?.id ?? input.id ?? randomUUID();
      const text = input.deleted ? "" : sanitize(input.text).slice(0, 100_000);
      await db.rows(
        `INSERT INTO source_documents(id,tenant,project_id,provider,source_key,revision,source_time,text,url,visibility,deleted,confirmed,metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(tenant,provider,source_key) DO UPDATE SET revision=EXCLUDED.revision,source_time=EXCLUDED.source_time,text=EXCLUDED.text,url=EXCLUDED.url,visibility=EXCLUDED.visibility,deleted=EXCLUDED.deleted,confirmed=false,metadata=EXCLUDED.metadata,updated_at=now()`,
        [
          id,
          input.tenant,
          input.project_id,
          input.provider,
          input.source_key,
          input.revision,
          input.source_time,
          text,
          input.url,
          input.visibility,
          input.deleted,
          input.confirmed ?? false,
          JSON.stringify(input.metadata),
        ],
      );
      await db.rows(
        "INSERT INTO source_revisions(tenant,document_id,revision,content_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [input.tenant, id, input.revision, hash(text)],
      );
      if (row) await invalidate(db, input.tenant, input.project_id, id);
      return {
        ...input,
        id,
        text,
        confirmed: row ? false : (input.confirmed ?? false),
      };
    });
  }
  async retrieve(
    actor: Principal,
    project: string,
    query = "",
  ): Promise<SourceDocument[]> {
    authorize(actor, project);
    await this.db.project(actor.tenant, project);
    return this.db.rows(
      `SELECT * FROM source_documents WHERE tenant=$1 AND project_id=$2 AND deleted=false
      ${query ? "AND (search @@ websearch_to_tsquery('english',$3) OR url=$3)" : ""}
      ORDER BY confirmed DESC,source_time DESC LIMIT 80`,
      query ? [actor.tenant, project, query] : [actor.tenant, project],
    );
  }
  async confirm(actor: Principal, id: string, confirmed = true) {
    const source = await this.db.one<SourceDocument>(
      "SELECT * FROM source_documents WHERE tenant=$1 AND id=$2 AND deleted=false",
      [actor.tenant, id],
    );
    if (!source) throw new Error("Source not found");
    authorize(actor, source.project_id, ["admin", "developer"]);
    await this.db.tx(async (db) => {
      await db.rows(
        "UPDATE source_documents SET confirmed=$3 WHERE tenant=$1 AND id=$2",
        [actor.tenant, id, confirmed],
      );
      await invalidate(db, actor.tenant, source.project_id, id);
      await db.audit(actor.tenant, actor.id, "source.confirm", id, {
        confirmed,
        revision: source.revision,
      });
    });
  }
  async revoke(
    tenant: string,
    project: string,
    provider?: string,
    channel?: string,
  ) {
    await this.db.tx(async (db) => {
      await db.rows(
        `UPDATE source_documents SET text='',deleted=true,confirmed=false,metadata='{}' WHERE tenant=$1 AND project_id=$2 ${provider ? "AND provider=$3" : ""} ${channel ? "AND metadata->>'channel'=$4" : ""}`,
        [
          tenant,
          project,
          ...(provider ? [provider] : []),
          ...(channel ? [channel] : []),
        ],
      );
      await invalidate(db, tenant, project);
      await db.rows(
        "UPDATE source_events SET payload='{}',state='done' WHERE tenant=$1 AND state='done'",
        [tenant],
      );
      await db.audit(tenant, "system", "source.revoke", project, {
        provider,
        channel,
      });
    });
  }
  async retention(tenant: string, days = 30) {
    const expired = await this.db.rows(
      "SELECT DISTINCT project_id FROM source_documents WHERE tenant=$1 AND source_time<now()-$2::int*interval '1 day' AND deleted=false",
      [tenant, days],
    );
    for (const p of expired)
      await this.db.tx(async (db) => {
        await db.rows(
          "UPDATE source_documents SET text='',metadata='{}',deleted=true,confirmed=false WHERE tenant=$1 AND project_id=$2 AND source_time<now()-$3::int*interval '1 day'",
          [tenant, p.project_id, days],
        );
        await invalidate(db, tenant, p.project_id);
      });
    await this.db.rows(
      "DELETE FROM source_events WHERE tenant=$1 AND received_at<now()-$2::int*interval '1 day'",
      [tenant, days],
    );
    await this.db.rows(
      "DELETE FROM entities WHERE tenant=$1 AND kind IN ('artifact','model-cache') AND updated_at<now()-interval '90 days'",
      [tenant],
    );
    await this.db.rows(
      "DELETE FROM job_events WHERE tenant=$1 AND created_at<now()-interval '90 days'",
      [tenant],
    );
  }
}
export async function invalidate(
  db: Database,
  tenant: string,
  project: string,
  source?: string,
) {
  const plans = await db.list<any>(tenant, "plan", project);
  for (const plan of plans) {
    if (source && !plan.sources?.some((s: any) => s.id === source)) continue;
    await db.put(
      tenant,
      "plan",
      plan.id,
      {
        ...plan,
        status: "superseded",
        objective: "Source context changed or was removed. Compile again.",
        steps: [],
        sources: [],
        acceptanceCriteria: [],
        assumptions: [],
        unansweredQuestions: [],
        regressionStrategy: "",
        rollback: "",
      },
      project,
    );
    await db.rows(
      "UPDATE jobs SET state='superseded',fence=fence+1,lease_until=NULL WHERE tenant=$1 AND plan_id=$2 AND state NOT IN ('resolved','merged','pr_open','cancelled','failed')",
      [tenant, plan.id],
    );
    await db.rows("DELETE FROM approvals WHERE tenant=$1 AND plan_id=$2", [
      tenant,
      plan.id,
    ]);
    await db.put(
      tenant,
      "task",
      plan.taskId,
      {
        id: plan.taskId,
        projectId: project,
        status: "superseded",
        objective: "Source context changed or was removed. Compile again.",
      },
      project,
    );
    await db.rows(
      "DELETE FROM entities WHERE tenant=$1 AND ((kind='snapshot' AND id=$2) OR (kind='knowledge' AND id=$3) OR (kind='artifact' AND data->>'jobId' IN (SELECT id FROM jobs WHERE tenant=$1 AND plan_id=$2)))",
      [tenant, plan.id, plan.taskId],
    );
    await db.rows(
      "DELETE FROM job_events WHERE tenant=$1 AND job_id IN (SELECT id FROM jobs WHERE tenant=$1 AND plan_id=$2)",
      [tenant, plan.id],
    );
  }
  await db.rows(
    "DELETE FROM entities WHERE tenant=$1 AND project_id=$2 AND kind='model-cache'",
    [tenant, project],
  );
}
