import {
  closestAttribute,
  visibleText,
  type DomMessage,
  type ReadResult,
  type SiteAdapter,
} from "./types.js";

/**
 * Claude Chat adapter.
 *
 * Claude marks the two roles with different hooks, so turns are collected per role and then
 * ordered by their position in the document rather than assumed to alternate.
 */
const USER_SELECTORS = [
  "[data-testid='user-message']",
  "[data-test-render-count] [data-testid='user-message']",
  ".font-user-message",
];

const ASSISTANT_SELECTORS = [
  "[data-testid='assistant-message']",
  ".font-claude-response",
  ".font-claude-message",
];

const STREAMING_SELECTORS = [
  "[data-is-streaming='true']",
  "button[aria-label='Stop response']",
  "[data-testid='stop-response']",
];

/**
 * One query over the union of both role selectors. `querySelectorAll` returns nodes in document
 * order, which is the only ordering signal that survives Claude re-rendering a thread — turns do
 * not carry an index and the two roles are not guaranteed to alternate.
 */
function collect(doc: Document) {
  const union = [...USER_SELECTORS, ...ASSISTANT_SELECTORS].join(",");
  const accepted: { element: Element; role: "user" | "assistant" }[] = [];
  for (const element of Array.from(doc.querySelectorAll(union))) {
    // A looser selector may match an ancestor or descendant of a turn already taken.
    if (accepted.some((entry) => entry.element.contains(element))) continue;
    const role = USER_SELECTORS.some((selector) => element.matches(selector))
      ? ("user" as const)
      : ("assistant" as const);
    accepted.push({ element, role });
  }
  return accepted;
}

export const claude: SiteAdapter = {
  id: "claude",
  label: "Claude",
  hosts: ["claude.ai"],
  conversationId(url: string) {
    try {
      const parsed = new URL(url);
      if (
        !claude.hosts.some(
          (h) => parsed.hostname === h || parsed.hostname.endsWith("." + h),
        )
      )
        return undefined;
      const match = parsed.pathname.match(/\/chat\/([0-9a-fA-F-]{8,})/);
      return match?.[1];
    } catch {
      return undefined;
    }
  },
  title(doc: Document) {
    const heading =
      doc
        .querySelector("[data-testid='chat-menu-trigger']")
        ?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim();
    return (heading || doc.title || "Claude conversation")
      .replace(/\s*[-|]\s*Claude\s*$/i, "")
      .trim();
  },
  read(doc: Document): ReadResult {
    const streaming = STREAMING_SELECTORS.some((s) => !!doc.querySelector(s));
    const ordered = collect(doc);
    if (!ordered.length)
      return {
        messages: [],
        sawWholeThread: false,
        streaming,
        warning:
          "No Claude turns matched. The page may still be loading, or its markup changed.",
      };
    const messages: DomMessage[] = [];
    let order = 0;
    ordered.forEach((entry, index) => {
      const text = visibleText(entry.element);
      if (!text) return;
      order += 1;
      messages.push({
        externalId:
          closestAttribute(entry.element, "data-message-uuid") ??
          closestAttribute(entry.element, "data-message-id") ??
          undefined,
        role: entry.role,
        text,
        order,
        complete: !(
          streaming &&
          index === ordered.length - 1 &&
          entry.role === "assistant"
        ),
      });
    });
    return { messages, sawWholeThread: false, streaming };
  },
};
