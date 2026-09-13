import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { AsyncEntry } from "@napi-rs/keyring";
import { openDatabase, databaseLabel } from "../../individual/core/db.js";
import { Store } from "../../individual/core/store.js";
import { createService, type ServiceOptions } from "../../individual/service/server.js";
import { ownerToken } from "../../individual/service/auth.js";
import { detectAll } from "../../individual/core/backends.js";
import { startCallbackServer } from "./loopback.js";
import { writeManifestForm } from "./githubManifest.js";
import {
  convertManifest,
  verifyGithub,
  githubRepositories,
  verifyClone,
  verifySlack,
  slackChannels,
} from "../../src/core/connect.js";
import { startTeamService, stopTeamService, teamRunning, dockerComposeUp, getTeamProject } from "./team.js";
import { installHost, uninstallHost, hostStatus } from "../../individual/companion/src/install.js";
import { startLiveProcess, LiveClient, snippet as liveSnippet } from "../../src/live/local.js";
import { watchSavedFiles, type WatchEvent } from "../../src/runner/watch.js";
import type { ChildProcess } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER_URL = process.env.SHADOWQA_DESKTOP_DEV_URL;

/**
 * Solo edition runs the same local service `shadowqa-individual serve` ran, in-process, for as
 * long as the window is open — there is no separate terminal step to remember. Team edition
 * (`team.ts`) does the same for `src/api/server.ts` + the durable worker, once an admin starts it.
 */
let solo: Awaited<ReturnType<typeof bootSolo>> | undefined;
let ownerCredential = "";
let liveProcess: ChildProcess | undefined;
const teamWatchers = new Map<string, { handle: { stop(): Promise<void> }; events: WatchEvent[] }>();

async function bootSolo() {
  const db = await openDatabase();
  const store = new Store(db);
  const options: ServiceOptions = { store, ownerToken: await ownerToken() };
  const service = await createService(options);
  const url = await service.listen();
  ownerCredential = options.ownerToken;
  return { service, db, url };
}

/** Every provider credential (Gemini, Anthropic, OpenAI, GitHub App key, Slack tokens) lives in the
 * OS keychain, never in a project `.env` file. */
const keyEntry = (id: string) => new AsyncEntry("ShadowQA Desktop", id);

/** Provider keys stored so far restore into `process.env` on every launch, before the service that
 * reads them is constructed. */
const PROVIDER_ENV: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  github: "GITHUB_TOKEN",
};

async function restoreProviderKeys() {
  for (const [id, envVar] of Object.entries(PROVIDER_ENV)) {
    const value = await keyEntry(id).getPassword().catch(() => undefined);
    if (value) process.env[envVar] = value;
  }
}

function registerIpc() {
  ipcMain.handle("get-config", async () => ({
    apiUrl: solo?.url,
    token: ownerCredential,
    database: databaseLabel(),
    backends: await detectAll(),
  }));

  ipcMain.handle("pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Choose a repository folder",
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle("open-external", async (_event, url: string) => {
    if (!/^https:\/\//.test(url)) throw new Error("Only https links may be opened");
    await shell.openExternal(url);
  });

  ipcMain.handle("keychain-get", async (_event, id: string) => {
    try {
      return (await keyEntry(id).getPassword()) ?? undefined;
    } catch {
      return undefined;
    }
  });
  ipcMain.handle("keychain-set", async (_event, id: string, value: string) => {
    await keyEntry(id).setPassword(value);
    const envVar = PROVIDER_ENV[id];
    if (!envVar) return;
    process.env[envVar] = value;
    // Gemini's key is read once when the service constructs its model client; every other
    // provider key (Anthropic/OpenAI for Live, GitHub for pull requests) is read live per call.
    if (id === "gemini" && solo) {
      await solo.service.close();
      await solo.db.close();
      solo = await bootSolo();
    }
  });
  ipcMain.handle("keychain-delete", async (_event, id: string) => {
    await keyEntry(id).deletePassword().catch(() => undefined);
    const envVar = PROVIDER_ENV[id];
    if (envVar) delete process.env[envVar];
  });

  // ---- GitHub: App Manifest flow — zero copy-paste, verified with GitHub's own API -------------

  ipcMain.handle("github-connect", async () => {
    const state = randomUUID();
    const { port, query } = await startCallbackServer();
    const file = await writeManifestForm(`http://127.0.0.1:${port}/callback`, state);
    await shell.openExternal("file://" + file.replace(/\\/g, "/"));
    const params = await query;
    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code || returnedState !== state)
      throw new Error("GitHub redirected without a valid code");
    const app = await convertManifest(code);
    await keyEntry("github_app_id").setPassword(app.appId);
    await keyEntry("github_app_key").setPassword(app.privateKey);
    await keyEntry("github_app_slug").setPassword(app.slug);
    if (app.webhookSecret) await keyEntry("github_webhook_secret").setPassword(app.webhookSecret);
    return { appId: app.appId, slug: app.slug, htmlUrl: app.htmlUrl };
  });

  ipcMain.handle("github-installations", async () => {
    const appId = await keyEntry("github_app_id").getPassword();
    const key = await keyEntry("github_app_key").getPassword();
    if (!appId || !key) throw new Error("Connect GitHub first");
    const { slug, installations } = await verifyGithub(appId, key);
    return { slug, installations };
  });

  ipcMain.handle("github-repositories", async (_event, installationId: number) => {
    const appId = await keyEntry("github_app_id").getPassword();
    const key = await keyEntry("github_app_key").getPassword();
    if (!appId || !key) throw new Error("Connect GitHub first");
    const { jwt } = await verifyGithub(appId, key);
    return githubRepositories(jwt, installationId);
  });

  ipcMain.handle(
    "github-verify-clone",
    async (_event, folder: string, owner: string, name: string) => verifyClone(folder, owner, name),
  );

  // ---- Slack: manifest copy-paste + two validated token pastes (Socket Mode has no OAuth
  // redirect to automate against) ----------------------------------------------------------------

  ipcMain.handle("slack-verify", async (_event, botToken: string, appToken: string) => {
    const identity = await verifySlack(botToken, appToken);
    await keyEntry("slack_bot_token").setPassword(botToken);
    if (appToken) await keyEntry("slack_app_token").setPassword(appToken);
    return identity;
  });

  ipcMain.handle("slack-channels", async () => {
    const bot = await keyEntry("slack_bot_token").getPassword();
    if (!bot) throw new Error("Connect Slack first");
    return slackChannels(bot);
  });

  // ---- Team service: the admin's machine runs the shared API + worker in-process, the same way
  // Solo runs its own service. A teammate who is only joining never hits any of this — they just
  // paste the service URL they were given and sign in (see the /connect/team screen). -------------

  ipcMain.handle("docker-compose-up", async () => dockerComposeUp());

  ipcMain.handle("team-status", async () => ({ running: teamRunning() }));

  ipcMain.handle("team-start", async (_event, databaseUrl?: string) => startTeamService(databaseUrl));

  /** Joining an existing team service needs nothing but the URL and token the admin already
   * generated for this person (`shadowqa` used to call this `login`) — no local service to boot. */
  ipcMain.handle("team-join", async (_event, url: string, memberToken: string) => {
    const response = await fetch(url.replace(/\/$/, "") + "/me", {
      headers: { authorization: "Bearer " + memberToken },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("That URL or token was rejected");
    const me = await response.json();
    await keyEntry("team_remote_url").setPassword(url);
    await keyEntry("team_remote_token").setPassword(memberToken);
    return me;
  });

  // ---- ShadowQA Live: the Python bridge, started and supervised the way `shadowqa live start`
  // used to from a second terminal — here it just starts when the Live tab is opened. -------------

  ipcMain.handle("live-start", async (_event, autonomy = "approve_all") => {
    if (liveProcess) return { alreadyRunning: true };
    const started = await startLiveProcess({ port: "8001", autonomy });
    liveProcess = started.child;
    started.child.once("exit", () => (liveProcess = undefined));
    return { alreadyRunning: false };
  });
  ipcMain.handle("live-stop", async () => {
    liveProcess?.kill();
    liveProcess = undefined;
  });
  ipcMain.handle("live-running", async () => !!liveProcess);
  ipcMain.handle("live-call", async (_event, route: string, method = "GET", body?: unknown) =>
    new LiveClient().call(route, method, body),
  );
  ipcMain.handle("live-snippet", async () => liveSnippet());

  // ---- Solo: browser extension companion (native messaging host) -------------------------------

  ipcMain.handle("companion-status", async () => hostStatus());
  ipcMain.handle("companion-install", async (_event, extensionId: string) => installHost(extensionId));
  ipcMain.handle("companion-uninstall", async () => uninstallHost());

  // ---- Team: saved-file watching in the same Docker sandbox a real job uses ---------------------

  ipcMain.handle("team-watch-start", async (_event, projectId: string, folder: string) => {
    if (teamWatchers.has(projectId)) return { alreadyWatching: true };
    const project = await getTeamProject(projectId);
    const events: WatchEvent[] = [];
    const handle = await watchSavedFiles(project, folder, (event) => {
      events.push(event);
      if (events.length > 100) events.splice(0, 50);
    });
    teamWatchers.set(projectId, { handle, events });
    return { alreadyWatching: false };
  });
  ipcMain.handle("team-watch-stop", async (_event, projectId: string) => {
    const entry = teamWatchers.get(projectId);
    if (!entry) return;
    await entry.handle.stop();
    teamWatchers.delete(projectId);
  });
  ipcMain.handle("team-watch-events", async (_event, projectId: string) => ({
    watching: teamWatchers.has(projectId),
    events: teamWatchers.get(projectId)?.events.slice(-30) ?? [],
  }));

  ipcMain.handle("get-team-config", async () => {
    if (teamRunning()) {
      const result = await startTeamService();
      return { apiUrl: result.url, token: result.token };
    }
    const [url, memberToken] = await Promise.all([
      keyEntry("team_remote_url").getPassword().catch(() => undefined),
      keyEntry("team_remote_token").getPassword().catch(() => undefined),
    ]);
    return url && memberToken ? { apiUrl: url, token: memberToken } : undefined;
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#1C1C1C",
    webPreferences: {
      preload: path.join(here, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Always launched with the repo root as cwd (see the desktop:dev / desktop:build scripts).
  if (DEV_SERVER_URL) await win.loadURL(DEV_SERVER_URL);
  else await win.loadFile(path.join(process.cwd(), "desktop", "renderer", "dist", "index.html"));
}

app.whenReady().then(async () => {
  registerIpc();
  await restoreProviderKeys();
  solo = await bootSolo();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", async () => {
  liveProcess?.kill();
  for (const entry of teamWatchers.values()) await entry.handle.stop();
  teamWatchers.clear();
  await solo?.service.close();
  await solo?.db.close();
  await stopTeamService();
  if (process.platform !== "darwin") app.quit();
});
