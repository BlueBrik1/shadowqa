import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Database } from "../../src/db/database.js";
import { workRoot } from "./execute.js";

/**
 * ShadowQA Individual defaults to an embedded PostgreSQL engine (PGlite) so a developer needs
 * no Docker and no database server. The schema, SQL and full-text index are the business
 * version's; set DATABASE_URL to point the individual tenant at a real PostgreSQL instead.
 */
export async function openDatabase(): Promise<Database> {
  const url =
    process.env.SHADOWQA_INDIVIDUAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url) {
    const db = Database.connect(url);
    await db.migrate();
    return db;
  }
  const dir = path.join(workRoot(), "db");
  await mkdir(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dir);
  const adapter = {
    query: async (sql: string, params?: any[]) =>
      sql.includes("CREATE TABLE")
        ? { rows: (await pg.exec(sql)) as any[] }
        : ((await pg.query(sql, params)) as any),
  };
  const db = new Database(
    adapter as any,
    (fn) => pg.transaction((tx) => fn(new Database(tx as any))),
    () => pg.close(),
  );
  await db.migrate();
  return db;
}

export const databaseLabel = () =>
  (process.env.SHADOWQA_INDIVIDUAL_DATABASE_URL ?? process.env.DATABASE_URL)
    ? "postgresql (configured)"
    : "embedded postgresql (pglite)";
