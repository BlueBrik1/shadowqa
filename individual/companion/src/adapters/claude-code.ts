import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sanitize } from "../../../../src/core/security.js";
import type { CapturedMessage } from "../../../core/contracts.js";

/**
 * Claude Code writes one JSONL transcript per session under its own home. This is the documented,
 * user-owned location; ShadowQA reads it and never reads a cloud session it has no access to.
 */
export function transcriptRoot() {
  return path.join(
    process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
    "projects",
  );
}

export function settingsFile() {
  return path.join(
    process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude"),
    "settings.json",
  );
}

/** Claude Code's project folder name: every non-alphanumeric character in the cwd becomes '-'. */
export function projectSlug(cwd: string) {
  return path.resolve(cwd).replace(/[^A-Za-z0-9]/g, "-");
}

export type TranscriptRef = {
  sessionId: string;
  file: string;
  slug: string;
  modifiedAt: string;
  bytes: number;
};

export async function listTranscripts(cwd?: string): Promise<TranscriptRef[]> {
  const root = transcriptRoot();
  let slugs: string[];
  try {
    slugs = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  if (cwd) {
    const wanted = projectSlug(cwd);
    slugs = slugs.filter((s) => s === wanted);
  }
  const out: TranscriptRef[] = [];
  for (const slug of slugs) {
    let files: string[];
    try {
      files = (await readdir(path.join(root, slug))).filter((f) =>
        f.endsWith(".jsonl"),
      );
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(root, slug, file);
      const info = await stat(full).catch(() => undefined);
      if (!info) continue;
      out.push({
        sessionId: file.replace(/\.jsonl$/, ""),
        file: full,
        slug,
        modifiedAt: info.mtime.toISOString(),
        bytes: info.size,
      });
    }
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: any) => {
      if (typeof block === "string") return block;
      if (block?.type === "text" && typeof block.text === "string")
        return block.text;
      if (block?.type === "tool_use")
        return `[tool: ${block.name ?? "unknown"}]`;
      if (block?.type === "tool_result") return "";
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Parses a transcript into capture records. Meta lines, sidechain (subagent) turns and tool
 * traffic are skipped: they are not the developer's conversation.
 */
export async function readTranscript(
  file: string,
  options: { fromByte?: number } = {},
): Promise<{ messages: CapturedMessage[]; cwd?: string; bytes: number }> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { messages: [], bytes: 0 };
  }
  const bytes = Buffer.byteLength(raw, "utf8");
  const sessionId = path.basename(file).replace(/\.jsonl$/, "");
  const now = new Date().toISOString();
  const messages: CapturedMessage[] = [];
  let cwd: string | undefined;
  let order = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.cwd && !cwd) cwd = record.cwd;
    if (record.type !== "user" && record.type !== "assistant") continue;
    if (record.isMeta || record.isSidechain) continue;
    const text = sanitize(textOf(record.message?.content)).trim();
    if (!text) continue;
    order += 1;
    messages.push({
      origin: "claude-code",
      conversationId: sessionId,
      externalId: record.uuid,
      role: record.type,
      text: text.slice(0, 200_000),
      order,
      url: "file://" + file.replaceAll("\\", "/"),
      timestamp:
        typeof record.timestamp === "string" ? record.timestamp : undefined,
      capturedAt: now,
      complete: true,
      meta: {
        gitBranch: record.gitBranch ?? null,
        model: record.message?.model ?? null,
        cwd: record.cwd ?? null,
      },
    });
  }
  if (options.fromByte && options.fromByte >= bytes)
    return { messages: [], cwd, bytes };
  return { messages, cwd, bytes };
}

export type HookInstall = {
  installed: boolean;
  settingsFile: string;
  events: string[];
  note: string;
};

/**
 * Installs SessionStart/Stop hooks that tell the companion a session moved. Claude Code requires
 * the user to review hook changes in `/hooks` before they take effect, which is stated back to
 * the user rather than worked around.
 */
export async function installHooks(
  command: string,
  file = settingsFile(),
): Promise<HookInstall> {
  let settings: any = {};
  try {
    settings = JSON.parse(await readFile(file, "utf8"));
  } catch {
    settings = {};
  }
  const events = ["SessionStart", "Stop", "SessionEnd"];
  settings.hooks = settings.hooks ?? {};
  for (const event of events) {
    const entries: any[] = Array.isArray(settings.hooks[event])
      ? settings.hooks[event]
      : [];
    const already = entries.some((entry) =>
      (entry.hooks ?? []).some((hook: any) =>
        String(hook.command ?? "").includes("shadowqa-individual"),
      ),
    );
    if (already) continue;
    entries.push({
      matcher: "*",
      hooks: [{ type: "command", command, timeout: 20 }],
    });
    settings.hooks[event] = entries;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  return {
    installed: true,
    settingsFile: file,
    events,
    note: "Claude Code asks you to review changed hooks in /hooks before they run.",
  };
}

export async function removeHooks(file = settingsFile()) {
  let settings: any;
  try {
    settings = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { removed: 0, settingsFile: file };
  }
  let removed = 0;
  for (const event of Object.keys(settings.hooks ?? {})) {
    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter(
      (entry: any) =>
        !(entry.hooks ?? []).some((hook: any) =>
          String(hook.command ?? "").includes("shadowqa-individual"),
        ),
    );
    removed += before - settings.hooks[event].length;
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  await writeFile(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  return { removed, settingsFile: file };
}

export async function detect() {
  const root = transcriptRoot();
  try {
    const info = await stat(root);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    return {
      available: false,
      root,
      reason:
        "No Claude Code home found. Run `claude` once, or set CLAUDE_CONFIG_DIR.",
      sessions: 0,
    };
  }
  const transcripts = await listTranscripts();
  return {
    available: true,
    root,
    sessions: transcripts.length,
    reason: undefined as string | undefined,
  };
}
