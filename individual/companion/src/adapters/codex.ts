import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sanitize } from "../../../../src/core/security.js";
import type { CapturedMessage } from "../../../core/contracts.js";

/**
 * Codex writes one JSONL rollout per session under CODEX_HOME/sessions/YYYY/MM/DD. That local
 * file is the only Codex history ShadowQA reads; cloud threads the CLI never wrote here are not
 * visible and are reported as such.
 */
export function sessionRoot() {
  return path.join(
    process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
    "sessions",
  );
}

export type RolloutRef = {
  sessionId: string;
  file: string;
  startedAt: string;
  modifiedAt: string;
  bytes: number;
};

const ROLLOUT = /^rollout-(\d{4}-\d{2}-\d{2}T[\d-]+)-([0-9a-f-]{36})\.jsonl$/i;

export async function listRollouts(limit = 200): Promise<RolloutRef[]> {
  const root = sessionRoot();
  const found: RolloutRef[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) await walk(full, depth + 1);
      else if (entry.isFile()) {
        const match = ROLLOUT.exec(entry.name);
        if (!match) continue;
        const info = await stat(full).catch(() => undefined);
        if (!info) continue;
        found.push({
          sessionId: match[2],
          file: full,
          startedAt: match[1].replace(
            /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/,
            "$1T$2:$3:$4Z",
          ),
          modifiedAt: info.mtime.toISOString(),
          bytes: info.size,
        });
      }
    }
  };
  await walk(root, 0);
  return found
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, limit);
}

const textOf = (content: unknown) =>
  Array.isArray(content)
    ? content
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim()
    : typeof content === "string"
      ? content
      : "";

/**
 * Turns a rollout into capture records. Only `response_item` messages with a user or assistant
 * role are kept: developer-role preambles are Codex's own instructions, and reasoning,
 * function calls and token counters are not conversation.
 */
export async function readRollout(file: string): Promise<{
  messages: CapturedMessage[];
  cwd?: string;
  model?: string;
  cli?: string;
}> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { messages: [] };
  }
  const sessionId =
    ROLLOUT.exec(path.basename(file))?.[2] ?? path.basename(file);
  const now = new Date().toISOString();
  const messages: CapturedMessage[] = [];
  let cwd: string | undefined;
  let model: string | undefined;
  let cli: string | undefined;
  let order = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = record.payload ?? {};
    if (record.type === "session_meta") {
      cwd = payload.cwd ?? cwd;
      model = payload.model ?? payload.model_provider ?? model;
      cli = payload.cli_version ?? cli;
      continue;
    }
    if (record.type !== "response_item" || payload.type !== "message") continue;
    if (payload.role !== "user" && payload.role !== "assistant") continue;
    const text = sanitize(textOf(payload.content)).trim();
    if (!text) continue;
    // Codex injects an <environment_context> block as a user turn; it is machine preamble.
    if (
      payload.role === "user" &&
      /^<(environment_context|user_instructions)>/.test(text)
    )
      continue;
    order += 1;
    messages.push({
      origin: "codex",
      conversationId: sessionId,
      externalId: `${sessionId}:${record.ordinal ?? order}`,
      role: payload.role,
      text: text.slice(0, 200_000),
      order,
      url: "file://" + file.replaceAll("\\", "/"),
      timestamp:
        typeof record.timestamp === "string" ? record.timestamp : undefined,
      capturedAt: now,
      complete: true,
      meta: { cwd: cwd ?? null, cliVersion: cli ?? null },
    });
  }
  return { messages, cwd, model, cli };
}

export async function detect() {
  const root = sessionRoot();
  try {
    const info = await stat(root);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    return {
      available: false,
      root,
      reason:
        "No Codex session history found. Run `codex` once, or set CODEX_HOME.",
      sessions: 0,
    };
  }
  const rollouts = await listRollouts();
  return {
    available: true,
    root,
    sessions: rollouts.length,
    reason: undefined as string | undefined,
  };
}
