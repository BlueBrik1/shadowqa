import { spawn } from "node:child_process";
import { AppError, sanitize } from "../core/security.js";
export type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};
export async function run(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    input?: string | Buffer;
    signal?: AbortSignal;
    maxOutput?: number;
  } = {},
): Promise<ProcessResult> {
  const start = Date.now(),
    max = options.maxOutput ?? 2_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      shell: false,
      stdio: "pipe",
    });
    let stdout = "",
      stderr = "",
      timedOut = false,
      overflow = false;
    const kill = () => {
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs ?? 60_000);
    const collect = (kind: "out" | "err", data: Buffer) => {
      if (kind === "out") stdout += data.toString();
      else stderr += data.toString();
      if (stdout.length + stderr.length > max) {
        overflow = true;
        kill();
      }
    };
    child.stdout.on("data", (d) => collect("out", d));
    child.stderr.on("data", (d) => collect("err", d));
    options.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (e) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
      if (overflow)
        reject(
          new AppError(
            "OUTPUT_CAP",
            "Process output exceeded its resource cap",
          ),
        );
      else
        resolve({
          code: code ?? -1,
          stdout,
          stderr,
          timedOut,
          durationMs: Date.now() - start,
        });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input);
    if (options.signal?.aborted) kill();
  });
}
export async function git(
  repo: string,
  args: string[],
  options: Parameters<typeof run>[2] = {},
) {
  const r = await run(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "protocol.file.allow=never",
      "-C",
      repo,
      ...args,
    ],
    {
      ...options,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        ...options.env,
      },
    },
  );
  if (r.code !== 0 || r.timedOut)
    throw new AppError(
      "GIT",
      sanitize(r.stderr).slice(0, 2000) || "Git command failed",
    );
  return r.stdout;
}
