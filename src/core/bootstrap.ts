import type { Database } from "../db/database.js";
import type { Project } from "./contracts.js";
import { AppError, hash, token } from "./security.js";

/**
 * First-run workspace initialization: registers the configured projects and mints the first
 * administrator credential. Idempotent per tenant — a second call throws `BOOTSTRAPPED` rather
 * than minting a second admin, matching the CLI's original `shadowqa bootstrap` behavior.
 */
export async function bootstrapWorkspace(
  db: Database,
  tenant: string,
  projects: Project[],
) {
  return db.tx(async (tx) => {
    await tx.rows(
      "INSERT INTO entities(tenant,kind,id,data) VALUES($1,'control','bootstrap','{}') ON CONFLICT DO NOTHING",
      [tenant],
    );
    await tx.rows(
      "SELECT id FROM entities WHERE tenant=$1 AND kind='control' AND id='bootstrap' FOR UPDATE",
      [tenant],
    );
    const exists = await tx.one("SELECT 1 FROM credentials WHERE tenant=$1 LIMIT 1", [tenant]);
    if (exists)
      throw new AppError(
        "BOOTSTRAPPED",
        "Already initialized. Use project import and member commands through the authenticated API.",
      );
    for (const p of projects) {
      await tx.put(tenant, "project", p.id, p, p.id);
      await tx.put(tenant, "policy-grant", p.id, { actorId: "admin", version: p.policy.version }, p.id);
    }
    const raw = token();
    await tx.rows(
      "INSERT INTO credentials(token_hash,tenant,actor_id,role,projects) VALUES($1,$2,'admin','admin','[]')",
      [hash(raw), tenant],
    );
    await tx.audit(tenant, "admin", "workspace.bootstrap", tenant);
    return raw;
  });
}
