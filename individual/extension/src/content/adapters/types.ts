/** A turn as the page exposes it, before it becomes a CapturedMessage. */
export type DomMessage = {
  externalId?: string;
  role: "user" | "assistant";
  text: string;
  order: number;
  /** False while the site is still streaming this turn. */
  complete: boolean;
  /** Only set when the page itself exposes a time; never the capture time. */
  timestamp?: string;
};

export type ReadResult = {
  messages: DomMessage[];
  /** True when the adapter is confident it saw every turn currently in the thread. */
  sawWholeThread: boolean;
  /** True while any turn is still being written. */
  streaming: boolean;
  /** Populated when the page shape is unrecognised, so the panel can say so honestly. */
  warning?: string;
};

export type SiteAdapter = {
  id: "chatgpt" | "claude";
  label: string;
  hosts: string[];
  /** Extracts the site's own conversation id from a URL, or undefined on a non-conversation page. */
  conversationId(url: string): string | undefined;
  title(doc: Document): string;
  read(doc: Document): ReadResult;
};

/** Collapses a node's rendered text without pulling in button labels or hidden helper text. */
export function visibleText(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  for (const junk of Array.from(
    clone.querySelectorAll(
      "button, svg, script, style, [aria-hidden='true'], .sr-only, [data-state='closed'] > svg",
    ),
  ))
    junk.remove();
  return (clone.textContent ?? "")
    .replace(/ /g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Tries each selector in order and returns the first that matches anything. */
export function firstMatching(
  root: ParentNode,
  selectors: string[],
): Element[] {
  for (const selector of selectors) {
    const found = Array.from(root.querySelectorAll(selector));
    if (found.length) return found;
  }
  return [];
}

export function closestAttribute(
  element: Element,
  attribute: string,
): string | undefined {
  let current: Element | null = element;
  while (current) {
    const value = current.getAttribute(attribute);
    if (value) return value;
    current = current.parentElement;
  }
  return undefined;
}
