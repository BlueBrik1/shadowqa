import { chatgpt } from "./adapters/chatgpt.js";
import { claude } from "./adapters/claude.js";
import type { SiteAdapter } from "./adapters/types.js";
import type { ContentMessage, PageState } from "../shared/protocol.js";

const ADAPTERS: SiteAdapter[] = [chatgpt, claude];

function adapterFor(url: string) {
  for (const adapter of ADAPTERS)
    if (adapter.conversationId(url)) return adapter;
  try {
    const host = new URL(url).hostname;
    return ADAPTERS.find((a) =>
      a.hosts.some((h) => host === h || host.endsWith("." + h)),
    );
  } catch {
    return undefined;
  }
}

let lastUrl = location.href;
let lastSignature = "";
let scheduled: ReturnType<typeof setTimeout> | undefined;
let tracked = false;

function describe(): {
  adapter?: SiteAdapter;
  state: PageState;
  messages: any[];
} {
  const adapter = adapterFor(location.href);
  if (!adapter)
    return {
      state: {
        origin: null,
        conversationId: null,
        url: location.href,
        title: document.title,
        messageCount: 0,
        streaming: false,
        sawWholeThread: false,
      },
      messages: [],
    };
  const conversationId = adapter.conversationId(location.href) ?? null;
  const result = conversationId
    ? adapter.read(document)
    : {
        messages: [],
        sawWholeThread: false,
        streaming: false,
        warning: undefined,
      };
  return {
    adapter,
    state: {
      origin: adapter.id,
      conversationId,
      url: location.href,
      title: adapter.title(document),
      messageCount: result.messages.length,
      streaming: result.streaming,
      sawWholeThread: result.sawWholeThread,
      warning: result.warning,
    },
    messages: result.messages,
  };
}

function send(message: ContentMessage) {
  try {
    chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
  } catch {
    // The extension was reloaded; the next mutation re-sends.
  }
}

/**
 * Cheap content fingerprint. Comparing lengths alone would miss an edit that happens to keep the
 * same length, which is exactly the case the store's revision handling exists for.
 */
function fingerprint(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * One pass. The page is read, and a capture is only sent when the visible content actually
 * changed — so a re-render, a scroll, or a streaming frame that adds nothing produces no traffic.
 */
function scan(force = false) {
  const { state, messages } = describe();
  send({ type: "page", state });
  if (!tracked || !state.conversationId) return;
  const settled = messages.filter((m) => m.complete);
  const signature = `${state.conversationId}|${settled.length}|${settled
    .map((m) => m.role + fingerprint(m.text))
    .join(",")}`;
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  if (!settled.length) return;
  send({ type: "capture", state, messages: settled });
}

function schedule(delay = 900) {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => scan(), delay);
}

const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    // A client-side navigation: treat it as a different conversation, not more of this one.
    lastUrl = location.href;
    lastSignature = "";
    schedule(400);
    return;
  }
  schedule();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

// History API navigations do not always mutate the DOM before we need to notice them.
for (const method of ["pushState", "replaceState"] as const) {
  const original = history[method];
  history[method] = function (this: History, ...args: any[]) {
    const result = original.apply(this, args as any);
    queueMicrotask(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastSignature = "";
        schedule(400);
      }
    });
    return result;
  } as typeof history.pushState;
}
window.addEventListener("popstate", () => {
  lastUrl = location.href;
  lastSignature = "";
  schedule(400);
});

chrome.runtime.onMessage.addListener((message: any, _sender, reply) => {
  if (message?.type === "trackingState") {
    const wasTracked = tracked;
    tracked = !!message.tracked && !message.paused;
    if (tracked && !wasTracked) {
      lastSignature = "";
      scan(true);
    }
    reply?.({ ok: true });
    return;
  }
  if (message?.type === "rescan") {
    lastSignature = "";
    scan(true);
    reply?.({ ok: true });
    return;
  }
  if (message?.type === "describe") {
    reply?.(describe().state);
    return;
  }
});

scan(true);
setInterval(() => scan(), 15_000);
