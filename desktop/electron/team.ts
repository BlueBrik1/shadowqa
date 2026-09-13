import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { AsyncEntry } from "@napi-rs/keyring";
import { Database } from "../../src/db/database.js";
import { createServer } from "../../src/api/server.js";
import { Worker } from "../../src/api/worker.js";
import { SlackAdapter } from "../../src/adapters/slack.js";
import { GitHub } from "../../src/adapters/github.js";
import { bootstrapWorkspace } from "../../src/core/bootstrap.js";
import { AppError } from "../../src/core/security.js";

const execAsync = promisify(exec);
const keyEntry = (id: string) => new AsyncEntry("ShadowQA Desktop", id);
const DEFAULT_DATABASE_URL = "postgresql://shadowqa:shadowqa@127.0.0.1:5432/shadowqa";
const TENANT = "local";

/** Team credentials connected through the desktop app's GitHub/Slack flows live in the OS
 * keychain under these ids; this restores them into `process.env` for the adapters that read
 * them there (`src/adapters/github.ts`, `src/adapters/slack.ts`), exactly like Solo's provider
 * keys, so no code in those adapters needs to change. */
async function restoreTeamEnv() {
  const [appId, privateKey, webhookSecret, botToken, appToken] = await Promise.all([
    keyEntry("github_app_id").getPassword().catch(() => undefined),
    keyEntry("github_app_key").getPassword().catch(() => undefined),
    keyEntry("github_webhook_secret").getPassword().catch(() => undefined),
    keyEntry("slack_bot_token").getPassword().catch(() => undefined),
    keyEntry("slack_app_token").getPassword().catch(() => undefined),
  ]);
  if (appId) process.env.GITHUB_APP_ID = appId;
  if (webhookSecret) process.env.GITHUB_WEBHOOK_SECRET = webhookSecret;
  if (privateKey) {
    const dir = path.join(os.homedir(), ".shadowqa-desktop");
    await mkdir(dir, { recursive: true });
    const keyPath = path.join(dir, "github-app.pem");
    await writeFile(keyPath, privateKey, { mode: 0o600 });
    process.env.GITHUB_PRIVATE_KEY_PATH = keyPath;
  }
  if (botToken) process.env.SLACK_BOT_TOKEN = botToken;
  if (appToken) process.env.SLACK_APP_TOKEN = appToken;
}

export async function dockerComposeUp() {
  await execAsync("docker compose up -d", { cwd: path.resolve(process.cwd()) });
}

let running: {
  db: Database;
  api: Awaited<ReturnType<typeof createServer>>;
  worker: Worker;
  slack: SlackAdapter;
  url: string;
} | undefined;

export function teamRunning() {
  return !!running;
}

export async function getTeamProject(id: string) {
  if (!running) throw new AppError("NOT_RUNNING", "Team service is not running");
  return running.db.project(TENANT, id);
}

export async function startTeamService(databaseUrl = DEFAULT_DATABASE_URL) {
  if (running) return { url: running.url, token: await keyEntry("team_token").getPassword() };
  await restoreTeamEnv();
  const db = Database.connect(databaseUrl);
  await db.migrate();
  const slack = new SlackAdapter(db, TENANT),
    github = new GitHub(db, TENANT);
  const api = createServer(db, { tenant: TENANT, slack, github });
  const port = Number(process.env.SHADOWQA_PORT ?? 4380);
  const host = "127.0.0.1";
  await api.listen({ host, port });
  const worker = new Worker(db, TENANT, github, slack);
  try {
    await slack.start();
  } catch {
    // Slack is optional at boot — the dashboard's connection health card shows it as degraded.
  }
  worker.start();

  let adminToken = await keyEntry("team_token").getPassword().catch(() => undefined);
  if (!adminToken) {
    try {
      adminToken = await bootstrapWorkspace(db, TENANT, []);
      await keyEntry("team_token").setPassword(adminToken);
    } catch (e) {
      if (!(e instanceof AppError && e.code === "BOOTSTRAPPED")) throw e;
      throw new AppError(
        "NO_ADMIN_TOKEN",
        "This database was already initialized outside this app, and its admin credential isn't in this machine's keychain.",
      );
    }
  }

  const url = `http://${host}:${port}`;
  running = { db, api, worker, slack, url };
  await keyEntry("team_database_url").setPassword(databaseUrl);
  return { url, token: adminToken };
}

export async function stopTeamService() {
  if (!running) return;
  await running.slack.stop().catch(() => undefined);
  await running.worker.stop();
  await running.api.close();
  await running.db.close();
  running = undefined;
}
