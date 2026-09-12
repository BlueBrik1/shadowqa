import { createHash } from "node:crypto";
import type { CapturedMessage } from "./contracts.js";

/**
 * Stable identity for one captured turn.
 *
 * When the site exposes its own message id, that id *is* the identity: an edited message keeps
 * the same key and therefore replaces the stored revision instead of appending a duplicate.
 * Without a site id — ChatGPT and Claude do not always render one — identity falls back to
 * (conversation, role, order), which is stable across re-renders of the same thread and still
 * lets an edit at that position update in place.
 */
export function messageKey(message: CapturedMessage) {
  const suffix = message.externalId
    ? "id:" + message.externalId
    : `pos:${message.role}:${message.order}`;
  return `${message.origin}:${message.conversationId}:${suffix}`;
}

export const contentHash = (text: string) =>
  createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");

/** Revision label for a captured turn; changing text yields a new revision for the same key. */
export const revisionOf = (message: CapturedMessage) =>
  contentHash(message.text).slice(0, 16);

/**
 * Collapses a capture batch: later observations of the same key win, incomplete (still
 * streaming) turns never overwrite a completed one, and the result is ordered.
 */
export function collapse(messages: CapturedMessage[]) {
  const byKey = new Map<string, CapturedMessage>();
  for (const message of messages) {
    const key = messageKey(message);
    const previous = byKey.get(key);
    if (previous && previous.complete && !message.complete) continue;
    if (previous && previous.text === message.text && previous.complete)
      continue;
    byKey.set(key, message);
  }
  return [...byKey.entries()]
    .map(([key, message]) => ({ key, message }))
    .sort((a, b) => a.message.order - b.message.order);
}

/**
 * True when an incoming turn is a strict continuation of what is stored — the streaming case.
 * Used so a partially streamed assistant reply is replaced, not duplicated, when it finishes.
 */
export function isContinuation(stored: string, incoming: string) {
  return (
    incoming.length > stored.length &&
    incoming.startsWith(stored.slice(0, Math.min(stored.length, 400)))
  );
}

/**
 * An unseen message is not a deleted message. A stored turn is only marked missing when the
 * adapter reported that it observed the whole conversation and that turn was absent from it.
 */
export function missingAfterFullSweep(
  storedKeys: string[],
  observedKeys: string[],
  sweepWasComplete: boolean,
) {
  if (!sweepWasComplete) return [];
  const seen = new Set(observedKeys);
  return storedKeys.filter((key) => !seen.has(key));
}
