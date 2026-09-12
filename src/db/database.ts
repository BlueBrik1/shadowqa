import pg from "pg";
import { randomUUID } from "node:crypto";
import { schema } from "./schema.js";
import { AppError, hash, sanitize } from "../core/security.js";
import type { Principal, Project } from "../core/contracts.js";
export type Sql = {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
};
export class Database {
  constructor(
    public sql: Sql,
    private transact?: <T>(fn: (db: Database) => Promise<T>) => Promise<T>,
    private disconnect?: () => Promise<void>,
  ) {}
  static connect(url: string) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return new Database(
      pool,
      async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(new Database(client));
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
      () => pool.end(),
    );
  }
  async migrate() {
    await this.sql.query(schema);
  }
  async close() {
    await this.disconnect?.();
  }
  async tx<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    return this.transact ? this.transact(fn) : fn(this);
  }
  async rows<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return (await this.sql.query<T>(sql, params)).rows;
  }
  async one<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return (await this.rows<T>(sql, params))[0];
  }
  async get<T = any>(
    tenant: string,
    kind: string,
    id: string,
  ): Promise<T | undefined> {
    return (
      await this.one(
        "SELECT data FROM entities WHERE tenant=$1 AND kind=$2 AND id=$3",
        [tenant, kind, id],
      )
    )?.data;
  }
  async put(
    tenant: string,
    kind: string,
    id: string,
    data: unknown,
    project: string | null = null,
  ) {
    await this.rows(
      "INSERT INTO entities(tenant,kind,id,data,project_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,kind,id) DO UPDATE SET data=EXCLUDED.data,project_id=EXCLUDED.project_id,updated_at=now()",
      [tenant, kind, id, JSON.stringify(data), project],
    );
  }
  async list<T = any>(
    tenant: string,
    kind: string,
    project?: string,
  ): Promise<T[]> {
    return (
      await this.rows(
        "SELECT data FROM entities WHERE tenant=$1 AND kind=$2" +
          (project ? " AND project_id=$3" : "") +
          " ORDER BY updated_at DESC LIMIT 500",
        project ? [tenant, kind, project] : [tenant, kind],
      )
    ).map((x) => x.data);
  }
  async audit(
    tenant: string,
    actor: string,
    action: string,
    target: string,
    metadata: unknown = {},
  ) {
    await this.rows(
      "INSERT INTO audit_log(tenant,actor_id,action,target,metadata) VALUES($1,$2,$3,$4,$5)",
      [tenant, actor, action, target, JSON.stringify(metadata)],
    );
  }
  async project(tenant: string, id: string): Promise<Project> {
    const p = await this.get<Project>(tenant, "project", id);
    if (!p || !p.enabled)
      throw new AppError(
        "PROJECT_DISABLED",
        "Project is missing or revoked",
        404,
      );
    return p;
  }
  async identity(raw: string): Promise<Principal> {
    const r = await this.one(
      "SELECT * FROM credentials WHERE token_hash=$1 AND revoked=false",
      [hash(raw)],
    );
    if (!r)
      throw new AppError("UNAUTHORIZED", "Invalid or revoked credential", 401);
    return {
      tenant: r.tenant,
      id: r.actor_id,
      role: r.role,
      projects: r.projects,
    };
  }
  async enqueue(
    tenant: string,
    project: string,
    kind: string,
    key: string,
    data: unknown,
  ) {
    await this.rows(
      "INSERT INTO outbox(tenant,id,project_id,kind,action_key,data) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant,action_key) DO NOTHING",
      [tenant, randomUUID(), project, kind, key, JSON.stringify(data)],
    );
  }
  async failQueue(
    table: "source_events" | "outbox",
    tenant: string,
    key: string,
    error: unknown,
  ) {
    const column = table === "outbox" ? "id" : "delivery_id";
    await this.rows(
      `UPDATE ${table} SET attempts=attempts+1,state=CASE WHEN attempts>=4 THEN 'failed' ELSE 'queued' END,error=$3,available_at=now()+interval '30 seconds' * power(2,LEAST(attempts,6)) WHERE tenant=$1 AND ${column}=$2`,
      [tenant, key, sanitize(String(error)).slice(0, 2000)],
    );
  }
}
