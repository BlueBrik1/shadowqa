#!/usr/bin/env node
/**
 * Headless entrypoint for the team edition's shared service — API, durable worker, Slack Socket
 * Mode, GitHub reconciliation. This is what a server (not a developer's desktop) runs so the whole
 * team's desktop apps have something to connect to; the desktop app itself runs the same
 * `src/api/server.ts` + `src/api/worker.ts` in-process for a single admin's machine
 * (`desktop/electron/team.ts`). No interactive setup here — configure via environment variables
 * and `shadowqa.config.example.json`, then run this.
 */
import "dotenv/config";
import { Database } from "../src/db/database.js";
import { environment, loadConfig } from "../src/core/config.js";
import { createServer } from "../src/api/server.js";
import { Worker } from "../src/api/worker.js";
import { SlackAdapter } from "../src/adapters/slack.js";
import { GitHub } from "../src/adapters/github.js";
import { bootstrapWorkspace } from "../src/core/bootstrap.js";
import { hash } from "../src/core/security.js";

const env = environment();
const db = Database.connect(env.database);
await db.migrate();

const alreadyBootstrapped = await db.one("SELECT 1 FROM credentials WHERE tenant=$1 LIMIT 1", [env.tenant]);
if (!alreadyBootstrapped) {
  const config = await loadConfig().catch(() => ({ projects: [] }));
  const raw = await bootstrapWorkspace(db, env.tenant, config.projects);
  console.log(`First run: administrator token (store it now, it will not be shown again):\n  ${raw}`);
  console.log(`(hash: ${hash(raw).slice(0, 12)}…)`);
}

const slack = new SlackAdapter(db, env.tenant),
  github = new GitHub(db, env.tenant);
const api = createServer(db, { tenant: env.tenant, slack, github }),
  worker = new Worker(db, env.tenant, github, slack);
await api.listen({ host: env.host, port: env.port });
try {
  await slack.start();
} catch (e) {
  console.error("Slack is degraded:", String(e));
}
worker.start();
console.log(`ShadowQA team service listening at ${env.url}`);

let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await slack.stop();
  await worker.stop();
  await api.close();
  await db.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
