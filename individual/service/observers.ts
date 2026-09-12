import * as claudeCode from "../companion/src/adapters/claude-code.js";
import * as codex from "../companion/src/adapters/codex.js";
import { sanitize } from "../../src/core/security.js";
import type { Origin } from "../core/contracts.js";
import type { Store } from "../core/store.js";

export type ObserverReport = {
  available: boolean;
  root: string;
  sessions: number;
  reason?: string;
  tracked: number;
  lastSweep?: string;
  lastError?: string;
};

export type ObserverState = {
  claudeCode?: ObserverReport;
  codex?: ObserverReport;
};

/**
 * Which local coding sessions a project follows. A session is only read after the user opts it
 * in: ShadowQA does not sweep every transcript on the machine into a project.
 */
export type Subscription = {
  projectId: string;
  origin: Extract<Origin, "claude-code" | "codex">;
  sessionId: string;
  file: string;
  addedAt: string;
  lastBytes: number;
};

const KEY = "coding-sessions";

export async function subscriptions(store: Store): Promise<Subscription[]> {
  return (await store.control<Subscription[]>(KEY)) ?? [];
}

export async function subscribe(
  store: Store,
  subscription: Omit<Subscription, "addedAt" | "lastBytes">,
) {
  const current = await subscriptions(store);
  const next = [
    ...current.filter(
      (s) =>
        !(
          s.origin === subscription.origin &&
          s.sessionId === subscription.sessionId
        ),
    ),
    { ...subscription, addedAt: new Date().toISOString(), lastBytes: 0 },
  ];
  await store.setControl(KEY, next);
  return next;
}

export async function unsubscribe(
  store: Store,
  origin: string,
  sessionId: string,
) {
  const next = (await subscriptions(store)).filter(
    (s) => !(s.origin === origin && s.sessionId === sessionId),
  );
  await store.setControl(KEY, next);
  return next;
}

/** One sweep of every subscribed local coding session. Re-reading is safe: capture deduplicates. */
export async function sweep(store: Store, state: ObserverState) {
  const now = new Date().toISOString();
  const [claudeStatus, codexStatus] = await Promise.all([
    claudeCode.detect(),
    codex.detect(),
  ]);
  const subs = await subscriptions(store);

  state.claudeCode = {
    ...claudeStatus,
    tracked: subs.filter((s) => s.origin === "claude-code").length,
    lastSweep: now,
  };
  state.codex = {
    ...codexStatus,
    tracked: subs.filter((s) => s.origin === "codex").length,
    lastSweep: now,
  };

  let captured = 0;
  const updated: Subscription[] = [];
  for (const sub of subs) {
    try {
      const parsed =
        sub.origin === "claude-code"
          ? await claudeCode.readTranscript(sub.file)
          : await codex.readRollout(sub.file);
      const messages = parsed.messages;
      if (messages.length) {
        const result = await store.capture({
          projectId: sub.projectId,
          conversation: {
            origin: sub.origin,
            conversationId: sub.sessionId,
            title: `${sub.origin === "claude-code" ? "Claude Code" : "Codex"} · ${sub.sessionId.slice(0, 8)}`,
            url: "file://" + sub.file.replaceAll("\\", "/"),
            // Local transcripts are the whole session that the CLI wrote to disk.
            coverage: "session",
          },
          messages,
        });
        captured += result.stored + result.updated;
      }
      updated.push({ ...sub, lastBytes: messages.length });
    } catch (e) {
      const report =
        sub.origin === "claude-code" ? state.claudeCode : state.codex;
      if (report) report.lastError = sanitize(String(e)).slice(0, 300);
      updated.push(sub);
    }
  }
  await store.setControl(KEY, updated);
  return { captured, subscriptions: updated.length };
}

export const observers = {
  claudeCode,
  codex,
  sweep,
  subscribe,
  unsubscribe,
  subscriptions,
};
