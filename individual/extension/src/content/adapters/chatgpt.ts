import {
  closestAttribute,
  firstMatching,
  visibleText,
  type DomMessage,
  type ReadResult,
  type SiteAdapter,
} from "./types.js";

/**
 * ChatGPT adapter.
 *
 * Selectors are ordered from the most specific contract the page offers
 * (`[data-message-id]` + `data-message-author-role`) down to structural fallbacks, so a
 * cosmetic markup change degrades capture rather than stopping it. When nothing matches, the
 * adapter says so instead of reporting an empty conversation.
 */
const TURN_SELECTORS = [
  "[data-message-id][data-message-author-role]",
  "[data-testid^='conversation-turn'] [data-message-author-role]",
  "article [data-message-author-role]",
  "[data-message-author-role]",
];

const STREAMING_SELECTORS = [
  "button[data-testid='stop-button']",
  "[data-testid='stop-button']",
  ".result-streaming",
  "[data-is-streaming='true']",
];

export const chatgpt: SiteAdapter = {
  id: "chatgpt",
  label: "ChatGPT",
  hosts: ["chatgpt.com", "chat.openai.com"],
  conversationId(url: string) {
    try {
      const parsed = new URL(url);
      if (
        !chatgpt.hosts.some(
          (h) => parsed.hostname === h || parsed.hostname.endsWith("." + h),
        )
      )
        return undefined;
      const match = parsed.pathname.match(
        /\/(?:c|g\/[^/]+\/c)\/([0-9a-fA-F-]{8,})/,
      );
      return match?.[1];
    } catch {
      return undefined;
    }
  },
  title(doc: Document) {
    const heading =
      doc.querySelector("h1")?.textContent?.trim() ||
      doc
        .querySelector("[data-testid='conversation-title']")
        ?.textContent?.trim();
    return (heading || doc.title || "ChatGPT conversation")
      .replace(/\s*[-|]\s*ChatGPT\s*$/i, "")
      .trim();
  },
  read(doc: Document): ReadResult {
    const turns = firstMatching(doc, TURN_SELECTORS);
    const streaming = STREAMING_SELECTORS.some((s) => !!doc.querySelector(s));
    if (!turns.length)
      return {
        messages: [],
        sawWholeThread: false,
        streaming,
        warning:
          "No ChatGPT turns matched. The page may still be loading, or its markup changed.",
      };
    const messages: DomMessage[] = [];
    let order = 0;
    for (const turn of turns) {
      const role = turn.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") continue;
      const text = visibleText(turn);
      if (!text) continue;
      order += 1;
      const last = order === turns.length;
      messages.push({
        externalId:
          turn.getAttribute("data-message-id") ??
          closestAttribute(turn, "data-message-id") ??
          undefined,
        role,
        text,
        order,
        // Only the final assistant turn can be mid-stream.
        complete: !(streaming && last && role === "assistant"),
      });
    }
    return {
      messages,
      // ChatGPT virtualises long threads: what is in the DOM is what was scrolled into view.
      sawWholeThread: false,
      streaming,
    };
  },
};
