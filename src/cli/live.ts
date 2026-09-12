/**
 * `shadowqa live …` — the runtime half of ShadowQA from the terminal.
 *
 * Live is a small Python bridge (live/backend) plus a browser SDK. This module starts it with
 * the right environment, links it to the ShadowQA service (so incidents are findings and the
 * project's automation mode applies) and exposes the day-to-day verbs: status, incidents,
 * approve, undo, pr, snippet.
 *
 * Both editions register the same group: the team CLI links Live to a project on the service;
 * the individual CLI runs it standalone with a local autonomy setting.
 */
import type { Command } from "commander";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { AppError, sanitize } from "../core/security.js";
import { GLYPH, bad, banner, dim, failure, good, ink, line, rule, soft, success, table } from "./ui.js";

export const LIVE_URL = () => process.env.SHADOWQA_LIVE_URL ?? "http://127.0.0.1:8001";
const repoRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const liveDir = () => path.join(repoRoot(), "live");
const stateDir = () => path.join(liveDir(), ".shadowqa");

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Shared secret between the browser SDK, the extension, the CLI and the bridge; created once. */
export async function bridgeToken(): Promise<string> {
  if (process.env.SHADOWQA_BRIDGE_TOKEN) return process.env.SHADOWQA_BRIDGE_TOKEN;
  const file = path.join(stateDir(), "bridge-token");
  if (await exists(file)) return (await readFile(file, "utf8")).trim();
  const token = randomBytes(24).toString("hex");
  await mkdir(stateDir(), { recursive: true });
  await writeFile(file, token, { mode: 0o600 });
  return token;
}

export class LiveClient {
  constructor(
    public url = LIVE_URL(),
    private token?: string,
  ) {}
  async call<T = any>(route: string, method = "GET", body?: unknown): Promise<T> {
    const token = this.token ?? (await bridgeToken());
    let response: Response;
    try {
      response = await fetch(this.url + "/api/shadowqa" + route, {
        method,
        headers: { "x-shadowqa-token": token, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new AppError("LIVE_OFFLINE", `ShadowQA Live is not running at ${this.url}. Start it with: shadowqa live start`, 503);
    }
    const text = await response.text();
    const data: any = text ? JSON.parse(text) : {};
    if (!response.ok)
      throw new AppError("LIVE", typeof data.detail === "string" ? data.detail : (data.detail?.message ?? `HTTP ${response.status}`), response.status);
    return data;
  }
}

function pythonCandidates() {
  return process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
}

async function runQuiet(cmd: string, args: string[], cwd: string, env = process.env): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "ignore", "inherit"], shell: false, windowsHide: true });
    child.once("error", () => resolve(127));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** Create live/backend/.venv on first run and install the bridge's requirements into it. */
export async function ensureVenv(backend: string): Promise<string> {
  const venv = path.join(backend, ".venv");
  const bin = process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
  if (await exists(bin)) return bin;
  line("SETUP", "Creating live/backend/.venv (first run)");
  let created = false;
  for (const py of pythonCandidates()) {
    const args = py === "py" ? ["-3", "-m", "venv", venv] : ["-m", "venv", venv];
    if ((await runQuiet(py, args, backend)) === 0) {
      created = true;
      break;
    }
  }
  if (!created || !(await exists(bin)))
    throw new AppError("PYTHON", "Python 3.11+ is required for ShadowQA Live (python -m venv failed)");
  line("SETUP", "Installing requirements");
  if ((await runQuiet(bin, ["-m", "pip", "install", "-q", "-r", "requirements.txt"], backend)) !== 0)
    throw new AppError("PIP", "pip install -r live/backend/requirements.txt failed");
  return bin;
}

export type LiveStartOptions = {
  port: string;
  project?: string;
  demo?: boolean;
  workspace?: string;
  autonomy?: string;
  /** Provided by the team edition: service URL + member token so Live links to a project. */
  link?: () => Promise<{ url: string; token: string }>;
  /** Provided by the individual edition: the project's mode, mapped to a local autonomy level. */
  autonomyForProject?: (project: string) => Promise<string>;
};

/** ShadowQA automation modes → what Live may do on its own (mirrors live/backend/shadowqa/config.py). */
export const MODE_TO_AUTONOMY: Record<string, string> = {
  observe: "observe",
  approval: "approve_all",
  "auto-fix": "auto_low",
  "full-auto": "auto_low",
};

export async function startLive(opts: LiveStartOptions) {
  const backend = path.join(liveDir(), "backend");
  if (!(await exists(path.join(backend, "server.py"))))
    throw new AppError("LIVE_MISSING", "live/backend is not present in this checkout");
  const python = await ensureVenv(backend);
  const token = await bridgeToken();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SHADOWQA_BRIDGE_TOKEN: token,
    SHADOWQA_DEMO: opts.demo ? "1" : "0",
    SHADOWQA_LIVE_DATA: process.env.SHADOWQA_LIVE_DATA ?? path.join(stateDir(), "live"),
    PYTHONUNBUFFERED: "1",
  };
  if (opts.workspace) env.SHADOWQA_WORKSPACE = path.resolve(opts.workspace);
  if (opts.autonomy) env.SHADOWQA_AUTONOMY = opts.autonomy;
  let modeLabel = (opts.autonomy ?? "approve_all") + " (local)";
  if (opts.project && opts.link) {
    const link = await opts.link();
    env.SHADOWQA_URL = link.url;
    env.SHADOWQA_TOKEN = link.token;
    env.SHADOWQA_PROJECT = opts.project;
    modeLabel = `${opts.project} (project automation mode from the service)`;
  } else if (opts.project && opts.autonomyForProject) {
    env.SHADOWQA_AUTONOMY = await opts.autonomyForProject(opts.project);
    modeLabel = `${env.SHADOWQA_AUTONOMY} (from project ${opts.project})`;
  }
  if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && !env.EMERGENT_LLM_KEY)
    line("NOTE", soft("No ANTHROPIC_API_KEY / OPENAI_API_KEY set; Live will capture and correlate but cannot diagnose."));
  banner("live");
  line("WATCHING", opts.workspace ? path.resolve(opts.workspace) : path.join(liveDir(), "shadowqa.workspace.json"));
  line("MODE", modeLabel);
  line("MODELS", "Claude → GPT for diagnosis");
  line("BRIDGE", `${LIVE_URL()}  token in live/.shadowqa/bridge-token`);
  line("SNIPPET", "shadowqa live snippet   → paste into the app you are watching");
  rule();
  const child = spawn(
    python,
    ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", opts.port, "--reload", "--reload-dir", ".", "--log-level", "warning"],
    { cwd: backend, env, stdio: "inherit", shell: false, windowsHide: false },
  );
  const stop = () => child.kill();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

const STATUS_GLYPH: Record<string, string> = {
  verified: good(GLYPH.ok),
  committed: good(GLYPH.ok),
  diagnosed: ink(GLYPH.step),
  captured: soft(GLYPH.watch),
  diagnosing: soft(GLYPH.watch),
  applying: soft(GLYPH.live),
  validating: soft(GLYPH.live),
  awaiting_replay: soft(GLYPH.live),
  replaying: soft(GLYPH.live),
  validation_failed: bad(GLYPH.err),
  replay_failed: bad(GLYPH.err),
  rolled_back: bad(GLYPH.err),
  failed: bad(GLYPH.err),
  dismissed: dim(GLYPH.err),
};

export function renderIncident(inc: any) {
  const status = inc.status ?? "unknown";
  console.log(`\n  ${STATUS_GLYPH[status] ?? soft(GLYPH.step)} ${ink(inc.title ?? "Runtime failure")}  ${dim(inc.id ?? "")}`);
  line("STATUS", status);
  if (inc.app?.route) line("ROUTE", inc.app.route);
  const f = inc.failure ?? {};
  if (f.message) line("FAILURE", sanitize(`${f.type ?? f.name ?? ""} ${f.message}`.trim()).slice(0, 300));
  const loc = inc.source_location ?? {};
  if (loc.file) line("AT", `${loc.file}:${loc.line ?? "?"} (${loc.side ?? "app"})`);
  const d = inc.diagnosis ?? {};
  if (d.root_cause) line("ROOT CAUSE", sanitize(String(d.root_cause)).slice(0, 400));
  if (d.confidence !== undefined) line("CONFIDENCE", String(d.confidence));
  if (inc.risk?.level) line("RISK", `${inc.risk.level}${inc.risk.autonomous_eligible ? "  (eligible for auto-fix)" : ""}`);
  if (inc.patch?.files?.length) line("PATCH", inc.patch.files.map((x: any) => x.path).join(", "));
  if (inc.policy?.mode || inc.policy?.autonomy) line("POLICY", inc.policy.mode ?? inc.policy.autonomy);
  if (inc.git?.pr?.url) line("PR", inc.git.pr.url);
  if (inc.error) failure(inc.error);
  if (status === "diagnosed") line("NEXT", `shadowqa live approve ${inc.id}`);
  if (status === "verified") line("NEXT", `shadowqa live pr ${inc.id}   ·   shadowqa live undo ${inc.id}`);
}

export function renderIncidents(list: any[]) {
  if (!list.length) return line("EMPTY", "No incidents yet. Live is watching.");
  table(
    list.map((i) => ({
      "": STATUS_GLYPH[i.status] ?? soft(GLYPH.step),
      id: i.id,
      status: i.status,
      route: i.app?.route ?? i.live?.route ?? "",
      title: String(i.title ?? "").slice(0, 60),
      risk: i.risk?.level ?? i.live?.risk ?? "",
    })),
    ["", "id", "status", "route", "title", "risk"],
  );
}

export function snippet(): string {
  return [
    `<!-- ShadowQA Live: paste before </body> of the app you are developing (localhost only) -->`,
    `<script src="${LIVE_URL()}/shadowqa.js"`,
    `        data-bridge-url="${LIVE_URL()}/api/shadowqa"`,
    `        data-token="<contents of live/.shadowqa/bridge-token>"></script>`,
    ``,
    `# or install the Chrome extension from live/extension and set the same token in its options.`,
  ].join("\n");
}

export function registerLiveCommands(
  cli: Command,
  options: {
    json: () => boolean;
    output: (data: any) => void;
    /** Team edition only: returns the service URL + token for linking a project. */
    link?: () => Promise<{ url: string; token: string }>;
    /** Individual edition: derive a local autonomy level from the project's mode. */
    autonomyForProject?: (project: string) => Promise<string>;
    /** Team edition only: incidents recorded as findings on the service. */
    serviceIncidents?: (project: string) => Promise<any[]>;
    /** Team edition only: request an action through the service when Live is not reachable directly. */
    serviceAction?: (project: string, incidentId: string, kind: string) => Promise<any>;
  },
) {
  const live = cli
    .command("live")
    .description(`${GLYPH.live} Watch a running web app; diagnose, fix, replay-verify runtime failures`);
  live
    .command("start")
    .description("Start the ShadowQA Live bridge for the app you are developing")
    .option("--port <port>", "Bridge port", "8001")
    .option("--project <id>", "Link to a ShadowQA project so its automation mode governs Live")
    .option("--workspace <file>", "shadowqa.workspace.json describing the app to watch")
    .option("--autonomy <level>", "observe | approve_all | auto_low (when not linked to a project)")
    .option("--demo", "Also serve the Lumen Supply Co. demo store")
    .action(async (opts) => startLive({ ...opts, link: options.link, autonomyForProject: options.autonomyForProject }));
  live
    .command("status")
    .description("Bridge health, workspace, mode and model providers")
    .action(async () => {
      const h = await new LiveClient().call("/health");
      if (options.json()) return options.output(h);
      banner("live");
      line("WORKSPACE", `${h.workspace}  ${dim(h.root)}`);
      line("WRITE ROOTS", (h.write_roots ?? []).join(", "));
      line("MODE", `${h.mode ?? h.autonomy}  ${dim("(" + h.policy_source + ")")}`);
      line("MODELS", `${h.models?.primary} → ${h.models?.fallback}`);
      line("STORE", h.store);
      line("SERVICE", h.shadowqa?.linked ? (h.shadowqa.reachable ? good(`linked · ${h.shadowqa.project}`) : bad("linked, unreachable")) : soft("standalone"));
      if (h.git) line("GIT", `${h.git.branch ?? "?"}${h.git.dirty ? "  (dirty)" : ""}`);
    });
  live
    .command("incidents [project]")
    .description("Runtime incidents Live has captured (from the service when a project is given)")
    .action(async (project?: string) => {
      const list = project && options.serviceIncidents ? await options.serviceIncidents(project) : await new LiveClient().call("/incidents?limit=50");
      if (options.json()) return options.output(list);
      renderIncidents(list);
    });
  live
    .command("incident <id>")
    .description("Full detail: failure, chain, diagnosis, patch, verification")
    .action(async (id: string) => {
      const inc = await new LiveClient().call(`/incidents/${id}`);
      if (options.json()) return options.output(inc);
      renderIncident(inc);
    });
  const act = (kind: "approve" | "undo" | "pr" | "dismiss", route: string, done: string) =>
    async (id: string, opts: { project?: string }) => {
      try {
        const result = await new LiveClient().call(route.replace(":id", id), "POST", {});
        if (options.json()) return options.output(result);
        success(done);
        if (kind === "approve") line("WATCH", `shadowqa live incident ${id}`);
      } catch (e: any) {
        if (e.code !== "LIVE_OFFLINE" || !opts.project || !options.serviceAction) throw e;
        const action = await options.serviceAction(opts.project, id, kind);
        if (options.json()) return options.output(action);
        success(`Queued for Live through the service (${action.id}).`);
      }
    };
  for (const [kind, route, desc, done] of [
    ["approve", "/incidents/:id/fix", "Apply the diagnosed patch: validate → replay → verify, or roll back", "Applying. Live will validate, replay the original interaction and verify."],
    ["undo", "/incidents/:id/rollback", "Restore the pre-patch checkpoint", "Rolled back to the checkpoint."],
    ["pr", "/incidents/:id/git/pr", "Commit the verified fix on a branch and open a pull request", "Branch pushed; PR requested."],
    ["dismiss", "/incidents/:id/dismiss", "Close an incident without changes", "Dismissed."],
  ] as const)
    live
      .command(`${kind} <incident>`)
      .description(desc)
      .option("--project <id>", "Route through the service if Live is not reachable from here")
      .action(act(kind, route, done));
  live
    .command("snippet")
    .description("Print the <script> tag (or extension note) that connects an app to Live")
    .action(() => console.log(snippet()));
  return live;
}
