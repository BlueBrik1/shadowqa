/**
 * ShadowQA Live's local half: the Python bridge (live/backend) plus the browser SDK snippet.
 * Shared by every interface that starts and talks to Live — desktop app included — so there is
 * exactly one place that knows how to find Python, create the venv, and speak the bridge's token
 * protocol.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { AppError } from "../core/security.js";

export const LIVE_URL = () => process.env.SHADOWQA_LIVE_URL ?? "http://127.0.0.1:8001";
const repoRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const liveDir = () => path.join(repoRoot(), "live");
const stateDir = () => path.join(liveDir(), ".shadowqa");

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Shared secret between the browser SDK, the extension, the desktop app and the bridge; created once. */
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
      throw new AppError(
        "LIVE_OFFLINE",
        `ShadowQA Live is not running at ${this.url}.`,
        503,
      );
    }
    const text = await response.text();
    const data: any = text ? JSON.parse(text) : {};
    if (!response.ok)
      throw new AppError(
        "LIVE",
        typeof data.detail === "string" ? data.detail : (data.detail?.message ?? `HTTP ${response.status}`),
        response.status,
      );
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
export async function ensureVenv(backend: string, onProgress?: (message: string) => void): Promise<string> {
  const venv = path.join(backend, ".venv");
  const bin = process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
  if (await exists(bin)) return bin;
  onProgress?.("Creating live/backend/.venv (first run)");
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
  onProgress?.("Installing requirements");
  if ((await runQuiet(bin, ["-m", "pip", "install", "-q", "-r", "requirements.txt"], backend)) !== 0)
    throw new AppError("PIP", "pip install -r live/backend/requirements.txt failed");
  return bin;
}

/** ShadowQA automation modes → what Live may do on its own (mirrors live/backend/shadowqa/config.py). */
export const MODE_TO_AUTONOMY: Record<string, string> = {
  observe: "observe",
  approval: "approve_all",
  "auto-fix": "auto_low",
  "full-auto": "auto_low",
};

export type LiveStartOptions = {
  port: string;
  project?: string;
  demo?: boolean;
  workspace?: string;
  autonomy?: string;
  /** Team edition: service URL + token so Live links to a project and reads its automation mode. */
  link?: { url: string; token: string };
  onProgress?: (message: string) => void;
};

/**
 * Starts the bridge and resolves as soon as it is spawned — unlike a terminal foreground process,
 * a caller here (the desktop app) wants a handle back immediately, not a promise that only
 * resolves when the bridge exits.
 */
export async function startLiveProcess(opts: LiveStartOptions): Promise<{ child: ChildProcess; stop: () => void }> {
  const backend = path.join(liveDir(), "backend");
  if (!(await exists(path.join(backend, "server.py"))))
    throw new AppError("LIVE_MISSING", "live/backend is not present in this checkout");
  const python = await ensureVenv(backend, opts.onProgress);
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
  if (opts.project && opts.link) {
    env.SHADOWQA_URL = opts.link.url;
    env.SHADOWQA_TOKEN = opts.link.token;
    env.SHADOWQA_PROJECT = opts.project;
  }
  const child = spawn(
    python,
    ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", opts.port, "--log-level", "warning"],
    { cwd: backend, env, stdio: "ignore", shell: false, windowsHide: true },
  );
  return { child, stop: () => child.kill() };
}

export function snippet(): string {
  return [
    `<!-- ShadowQA Live: paste before </body> of the app you are developing (localhost only) -->`,
    `<script src="${LIVE_URL()}/shadowqa.js"`,
    `        data-bridge-url="${LIVE_URL()}/api/shadowqa"`,
    `        data-token="<contents of live/.shadowqa/bridge-token>"></script>`,
  ].join("\n");
}
