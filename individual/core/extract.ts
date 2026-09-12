import { randomUUID } from "node:crypto";
import { AppError, hash, sanitize } from "../../src/core/security.js";
import type { Model } from "../../src/model/gemini.js";
import { ExtractedItem, ExtractionOutput, type ItemKind } from "./contracts.js";
import type { Store, StoredMessage } from "./store.js";

/**
 * The extraction contract. It is deliberately blunt about the distinction the product depends on:
 * an assistant proposing something is not the user deciding it.
 */
export const EXTRACTION_SYSTEM = [
  "You read excerpts from a developer's AI conversations and list what they imply for one project.",
  "Each excerpt is numbered and labelled with its speaker: USER is the developer, ASSISTANT is an AI.",
  "Classify only what the excerpts support:",
  "  requirement  the developer asked for this outcome",
  "  constraint   the developer ruled something out or fixed a boundary",
  "  decision     the developer accepted or chose an option",
  "  suggestion   an assistant proposed it and the developer has not accepted it",
  "  question     something was asked and no excerpt answers it",
  "  conflict     two excerpts give incompatible instructions; describe both sides",
  "Never record an assistant proposal as a requirement or a decision.",
  "Every item must cite the excerpt numbers it came from. Invent nothing.",
].join("\n");

const EXCERPT_CHARS = 2400;
const MAX_EXCERPTS = 60;

export function excerpt(message: StoredMessage, index: number) {
  const role = String(message.metadata?.role ?? "user").toUpperCase();
  const origin = String(message.metadata?.origin ?? message.provider);
  return `[${index}] ${role} · ${origin}\n${sanitize(message.text).slice(0, EXCERPT_CHARS)}`;
}

export type ExtractionResult = {
  items: ExtractedItem[];
  excerpts: number;
  skipped: string[];
};

/**
 * Runs one bounded extraction over the project's captured context. Existing user-edited items are
 * never overwritten; a re-extraction adds and updates model-owned items only.
 */
export async function extractItems(
  store: Store,
  model: Model,
  projectId: string,
  query = "",
): Promise<ExtractionResult> {
  const messages = (await store.context(projectId, query, MAX_EXCERPTS)).filter(
    (m) => m.text.trim().length > 0,
  );
  if (!messages.length)
    throw new AppError(
      "NO_CONTEXT",
      "No captured messages for this project yet. Track a conversation in the extension first.",
      409,
    );

  const numbered = messages.map((m, i) => excerpt(m, i));
  const output = await model.generate(
    store.tenant,
    projectId,
    EXTRACTION_SYSTEM,
    { excerpts: numbered },
    ExtractionOutput,
  );

  const now = new Date().toISOString();
  const existing = await store.items(projectId);
  const byText = new Map(existing.map((item) => [normalise(item.text), item]));
  const items: ExtractedItem[] = [];
  const skipped: string[] = [];

  for (const raw of output.items) {
    const sources = raw.sourceIndexes
      .filter((i) => i >= 0 && i < messages.length)
      .map((i) => messages[i].id);
    if (raw.sourceIndexes.some((i) => i < 0 || i >= messages.length)) {
      // A citation outside the excerpt list is a fabrication; the item is dropped, not repaired.
      skipped.push(raw.text.slice(0, 120));
      continue;
    }
    if (!sources.length) {
      skipped.push(raw.text.slice(0, 120));
      continue;
    }
    const previous = byText.get(normalise(raw.text));
    if (previous?.editedByUser) continue;
    const item = ExtractedItem.parse({
      id:
        previous?.id ??
        "item_" + hash({ projectId, text: normalise(raw.text) }).slice(0, 16),
      projectId,
      kind: raw.kind as ItemKind,
      text: raw.text.trim(),
      status: previous?.status ?? "proposed",
      sources,
      conflictsWith: raw.conflictsWithIndexes
        .filter((i) => i >= 0 && i < messages.length)
        .map((i) => messages[i].id),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      editedByUser: false,
    });
    items.push(await store.putItem(item));
  }

  await store.db.audit(store.tenant, "owner", "context.extract", projectId, {
    excerpts: messages.length,
    items: items.length,
    skipped: skipped.length,
  });
  return { items, excerpts: messages.length, skipped };
}

const normalise = (text: string) =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

/** Groups items for display and for the planner prompt. */
export function groupItems(items: ExtractedItem[]) {
  const group = (kind: ItemKind | ItemKind[]) => {
    const kinds = Array.isArray(kind) ? kind : [kind];
    return items.filter(
      (i) => kinds.includes(i.kind) && i.status !== "rejected",
    );
  };
  return {
    requirements: group(["requirement", "constraint"]),
    confirmed: items.filter((i) => i.status === "confirmed"),
    decisions: group("decision"),
    suggestions: group("suggestion"),
    questions: group("question").filter((i) => i.status !== "answered"),
    conflicts: group("conflict"),
  };
}

export const newId = () => randomUUID();
