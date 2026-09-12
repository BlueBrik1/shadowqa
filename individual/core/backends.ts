import { randomUUID } from "node:crypto";
import { run } from "../../src/runner/process.js";
import { AppError, sanitize } from "../../src/core/security.js";
import type { Backend } from "./contracts.js";
import { resolveExecutable } from "./executable.js";

export type BackendStatus = {
  id: Backend;
  available: boolean;
  version?: string;
  reason?: string;
  /** Command the user can run to open the same session themselves. */
  attachHint?: string;
};

export type RunOptions = {
  workspace: string;
  prompt: string;
  timeoutSeconds: number;
  signal: AbortSignal;
  /** Gemini-compatible model id, used only by the OpenCode backend. */
  model?: string;
  onEvent?: (event: { kind: string; text: string }) => void;
};

export type RunResult = {
  sessionRef: string;
  ok: boolean;
  log: string;
  attach: string;
  /** Why the backend reported failure, when it said so itself. */
  error?: string;
};

export interface BackendAdapter {
  id: Backend;
  label: string;
  detect(): Promise<BackendStatus>;
  execute(options: RunOptions): Promise<RunResult>;
  /** The exact command that reopens this run in a terminal or IDE terminal. */
  attachCommand(workspace: string, sessionRef: string): string;
}

/**
 * The three CLIs print their version differently — `1.15.10`, `codex-cli 0.133.0`,
 * `2.1.269 (Claude Code)` — so the version number itself is extracted and the decoration dropped.
 */
export function versionNumber(output: string) {
  const first = output.trim().split("\n")[0].trim();
  return first.match(/\d+\.\d+\.\d+(?:[-+][\w.]+)?/)?.[0] ?? first ?? undefined;
}

async function version(name: string, args: string[]) {
  try {
    const exe = await resolveExecutable(name);
    const result = await run(exe.command, [...exe.prefix, ...args], {
      timeoutMs: 20_000,
    });
    if (result.code !== 0) return undefined;
    return versionNumber(result.stdout) || undefined;
  } catch {
    return undefined;
  }
}

/** OpenCode reports `{name, data:{message,...}}`; the message is what a user can act on. */
export function opencodeError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error.slice(0, 600);
  const record = error as Record<string, any>;
  const message = record.data?.message ?? record.message ?? record.name;
  return typeof message === "string" && message.trim()
    ? `${record.name && record.name !== message ? record.name + ": " : ""}${message}`.slice(
        0,
        600,
      )
    : JSON.stringify(error).slice(0, 600);
}

/** Codex nests a JSON API error inside the event's message string; unwrap it when it is there. */
export function codexError(message: unknown): string | undefined {
  if (typeof message !== "string" || !message.trim()) return undefined;
  try {
    const parsed = JSON.parse(message);
    const inner = parsed?.error?.message ?? parsed?.message;
    if (typeof inner === "string" && inner.trim()) return inner.slice(0, 600);
  } catch {
    /* not JSON; the raw message is the message */
  }
  return message.slice(0, 600);
}

function jsonLines(text: string) {
  const out: any[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      /* partial or non-JSON progress line */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// OpenCode — the default backend, as in the business version.
// ---------------------------------------------------------------------------

export const opencodeBackend: BackendAdapter = {
  id: "opencode",
  label: "OpenCode",
  async detect() {
    const found = await version("opencode", ["--version"]);
    return {
      id: "opencode",
      available: !!found,
      version: found,
      reason: found ? undefined : "Install opencode-ai (npm i -g opencode-ai).",
      attachHint: "opencode <workspace>",
    };
  },
  attachCommand(workspace, sessionRef) {
    return sessionRef && sessionRef !== "unknown"
      ? `opencode run --dir "${workspace}" -s ${sessionRef} -c`
      : `opencode "${workspace}"`;
  },
  async execute({ workspace, prompt, timeoutSeconds, signal, model, onEvent }) {
    const args = ["run", "--format", "json", "--dir", workspace];
    if (model) args.push("-m", "google/" + model);
    args.push(prompt);
    const exe = await resolveExecutable("opencode");
    const result = await run(exe.command, [...exe.prefix, ...args], {
      cwd: workspace,
      timeoutMs: timeoutSeconds * 1000,
      signal,
      maxOutput: 8_000_000,
    });
    const events = jsonLines(result.stdout);
    let sessionRef = "unknown";
    let error: string | undefined;
    for (const event of events) {
      const id =
        event?.sessionID ??
        event?.sessionId ??
        event?.info?.sessionID ??
        event?.session?.id;
      if (typeof id === "string" && id) sessionRef = id;
      // OpenCode exits 0 even when the session failed, so the events are the real verdict.
      if (event?.type === "error" || event?.error)
        error ??= opencodeError(event.error ?? event);
      const text = event?.text ?? event?.part?.text;
      if (typeof text === "string" && text.trim())
        onEvent?.({ kind: "text", text: text.slice(0, 2000) });
    }
    if (error) onEvent?.({ kind: "error", text: error });
    return {
      sessionRef,
      ok: result.code === 0 && !result.timedOut && !error,
      log: sanitize(result.stdout + result.stderr).slice(-200_000),
      attach: this.attachCommand(workspace, sessionRef),
      error,
    };
  },
};

// ---------------------------------------------------------------------------
// Claude Code — `claude -p` with a caller-supplied session id so the same session
// can be reopened with `claude --resume`.
// ---------------------------------------------------------------------------

export const claudeCodeBackend: BackendAdapter = {
  id: "claude-code",
  label: "Claude Code",
  async detect() {
    const found = await version("claude", ["--version"]);
    return {
      id: "claude-code",
      available: !!found,
      version: found,
      reason: found
        ? undefined
        : "Install Claude Code (npm i -g @anthropic-ai/claude-code) and sign in with `claude`.",
      attachHint: "claude --resume <session-id>",
    };
  },
  attachCommand(_workspace, sessionRef) {
    return `claude --resume ${sessionRef}`;
  },
  async execute({ workspace, prompt, timeoutSeconds, signal, onEvent }) {
    const sessionId = randomUUID();
    const args = [
      "-p",
      prompt,
      "--session-id",
      sessionId,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
      "--add-dir",
      workspace,
    ];
    const exe = await resolveExecutable("claude");
    const result = await run(exe.command, [...exe.prefix, ...args], {
      cwd: workspace,
      timeoutMs: timeoutSeconds * 1000,
      signal,
      maxOutput: 8_000_000,
    });
    let ok = result.code === 0 && !result.timedOut;
    for (const event of jsonLines(result.stdout)) {
      if (event?.type === "assistant") {
        const blocks = event?.message?.content ?? [];
        for (const block of blocks)
          if (block?.type === "text" && block.text?.trim())
            onEvent?.({
              kind: "text",
              text: String(block.text).slice(0, 2000),
            });
      }
      if (event?.type === "result") {
        if (event.is_error || event.subtype === "error_during_execution")
          ok = false;
        if (typeof event.result === "string")
          onEvent?.({ kind: "result", text: event.result.slice(0, 2000) });
      }
    }
    return {
      sessionRef: sessionId,
      ok,
      log: sanitize(result.stdout + result.stderr).slice(-200_000),
      attach: this.attachCommand(workspace, sessionId),
    };
  },
};

// ---------------------------------------------------------------------------
// Codex — `codex exec --json`. The session id comes from the emitted events; the
// rollout file under CODEX_HOME/sessions carries the same id.
// ---------------------------------------------------------------------------

export const codexBackend: BackendAdapter = {
  id: "codex",
  label: "Codex",
  async detect() {
    const found = await version("codex", ["--version"]);
    return {
      id: "codex",
      available: !!found,
      version: found,
      reason: found
        ? undefined
        : "Install the Codex CLI (npm i -g @openai/codex) and sign in with `codex`.",
      attachHint: "codex resume <session-id>",
    };
  },
  attachCommand(workspace, sessionRef) {
    return sessionRef && sessionRef !== "unknown"
      ? `codex resume ${sessionRef}`
      : `codex --cd "${workspace}"`;
  },
  async execute({ workspace, prompt, timeoutSeconds, signal, onEvent }) {
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "-C",
      workspace,
      "-s",
      "workspace-write",
      prompt,
    ];
    const exe = await resolveExecutable("codex");
    const result = await run(exe.command, [...exe.prefix, ...args], {
      cwd: workspace,
      timeoutMs: timeoutSeconds * 1000,
      signal,
      maxOutput: 8_000_000,
    });
    let sessionRef = "unknown";
    let error: string | undefined;
    for (const event of jsonLines(result.stdout)) {
      const payload = event?.payload ?? event?.msg ?? event;
      const id =
        payload?.session_id ??
        payload?.thread_id ??
        payload?.threadId ??
        event?.session_id ??
        event?.thread_id;
      if (typeof id === "string" && id) sessionRef = id;

      // Codex reports its own failures as events; the exit code alone would lose the reason.
      if (
        event?.type === "error" ||
        event?.type === "turn.failed" ||
        payload?.type === "error"
      )
        error ??= codexError(
          event?.message ?? event?.error?.message ?? payload?.message,
        );

      if (
        payload?.type === "agent_message" &&
        typeof payload.message === "string"
      )
        onEvent?.({ kind: "text", text: payload.message.slice(0, 2000) });
      if (payload?.role === "assistant" && Array.isArray(payload.content))
        for (const part of payload.content)
          if (typeof part?.text === "string" && part.text.trim())
            onEvent?.({ kind: "text", text: part.text.slice(0, 2000) });
      // Newer `codex exec --json` emits completed items rather than raw response items.
      const item = payload?.item ?? event?.item;
      if (item?.type === "AgentMessage" && Array.isArray(item.content))
        for (const part of item.content)
          if (typeof part?.text === "string" && part.text.trim())
            onEvent?.({ kind: "text", text: part.text.slice(0, 2000) });
    }
    if (error) onEvent?.({ kind: "error", text: error });
    return {
      sessionRef,
      ok: result.code === 0 && !result.timedOut && !error,
      log: sanitize(result.stdout + result.stderr).slice(-200_000),
      attach: this.attachCommand(workspace, sessionRef),
      error,
    };
  },
};

export const backends: Record<Backend, BackendAdapter> = {
  opencode: opencodeBackend,
  "claude-code": claudeCodeBackend,
  codex: codexBackend,
};

export function backendFor(id: Backend) {
  const adapter = backends[id];
  if (!adapter)
    throw new AppError("BACKEND", "Unknown execution backend " + sanitize(id));
  return adapter;
}

export async function detectAll(): Promise<BackendStatus[]> {
  return Promise.all(Object.values(backends).map((b) => b.detect()));
}
