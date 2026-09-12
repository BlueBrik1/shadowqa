import {
  NATIVE_HOST,
  conversationKey,
  type ContentMessage,
  type PageState,
  type PanelMessage,
  type PanelState,
  type Tracking,
} from "../shared/protocol.js";

/**
 * The service worker is the only place that talks to the companion. Content scripts cannot use
 * native messaging at all, and the side panel goes through here so one code path owns tracking
 * state, retries and error reporting.
 */

type Session = {
  pages: Record<number, PageState>;
  lastSync: string | null;
  lastError: string | null;
  paired: boolean;
  reachable: boolean;
};

const session: Session = {
  pages: {},
  lastSync: null,
  lastError: null,
  paired: false,
  reachable: false,
};

async function tracking(): Promise<Tracking> {
  const stored = await chrome.storage.local.get("tracking");
  return (stored.tracking as Tracking) ?? { conversations: {} };
}

async function saveTracking(next: Tracking) {
  await chrome.storage.local.set({ tracking: next });
}

/**
 * One long-lived port to the companion rather than one host process per request.
 * `sendNativeMessage` starts a fresh process every call, which the side panel's polling would
 * turn into several process launches a second; `connectNative` keeps a single host alive and
 * multiplexes requests over it by id.
 */
let port: chrome.runtime.Port | undefined;
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();

function failPending(reason: string) {
  for (const entry of pending.values()) entry.reject(new Error(reason));
  pending.clear();
}

function connect(): chrome.runtime.Port | undefined {
  if (port) return port;
  try {
    const opened = chrome.runtime.connectNative(NATIVE_HOST);
    opened.onMessage.addListener((response: any) => {
      const entry =
        response?.id !== undefined ? pending.get(response.id) : undefined;
      if (!entry) return;
      pending.delete(response.id);
      if (response.ok === false) {
        session.lastError = String(response.error ?? "Companion error");
        if (response.code === "NOT_PAIRED") session.paired = false;
        entry.reject(
          Object.assign(new Error(session.lastError), { code: response.code }),
        );
        return;
      }
      session.reachable = true;
      session.lastError = null;
      entry.resolve(response.result);
    });
    opened.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      port = undefined;
      session.reachable = false;
      session.lastError = describeNativeError(error?.message ?? "");
      failPending(session.lastError);
    });
    port = opened;
    return opened;
  } catch (e) {
    session.reachable = false;
    session.lastError = describeNativeError(String((e as Error).message));
    return undefined;
  }
}

/** One request to the companion. A missing host is a normal, reportable state, not a crash. */
function native<T = any>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = connect();
    if (!channel) {
      reject(new Error(session.lastError ?? "Could not reach the companion."));
      return;
    }
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    // A hung host must not leave the panel spinning forever.
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("The companion did not answer in time."));
    }, 30_000);
    try {
      channel.postMessage({ ...message, id, extensionId: chrome.runtime.id });
    } catch (e) {
      pending.delete(id);
      port = undefined;
      session.reachable = false;
      session.lastError = describeNativeError(String((e as Error).message));
      reject(new Error(session.lastError));
    }
  });
}

function describeNativeError(message: string) {
  if (/not found|Specified native messaging host not found/i.test(message))
    return "Companion not installed. Run: shadowqa-individual companion install <extension id>";
  if (/host has exited|Native host has exited/i.test(message))
    return "The companion exited. Is `shadowqa-individual serve` running?";
  if (
    /access to the specified native messaging host is forbidden/i.test(message)
  )
    return "The companion is registered for a different extension ID. Re-run companion install.";
  return message || "Could not reach the companion.";
}

async function refreshCompanion() {
  try {
    const ping = await native<{
      serviceReachable: boolean;
      paired: boolean;
      url?: string;
    }>({
      type: "ping",
    });
    session.reachable = !!ping.serviceReachable;
    session.paired = !!ping.paired;
    if (!ping.serviceReachable)
      session.lastError =
        "ShadowQA Individual is not running. Start it with: shadowqa-individual serve";
    return ping;
  } catch {
    session.reachable = false;
    return undefined;
  }
}

async function pushTrackingState(tabId: number, key: string | null) {
  const state = await tracking();
  const entry = key ? state.conversations[key] : undefined;
  chrome.tabs
    .sendMessage(tabId, {
      type: "trackingState",
      tracked: !!entry,
      paused: !!entry?.paused,
    })
    .catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(() => undefined);
  void refreshCompanion();
});

chrome.runtime.onStartup?.addListener(() => void refreshCompanion());

chrome.runtime.onMessage.addListener((message: any, sender, reply) => {
  void (async () => {
    try {
      if (sender.tab?.id !== undefined)
        reply(await handleContent(message, sender.tab.id));
      else reply(await handlePanel(message));
    } catch (e: any) {
      reply({ error: String(e?.message ?? e) });
    }
  })();
  return true;
});

async function handleContent(message: ContentMessage, tabId: number) {
  if (message.type === "page") {
    session.pages[tabId] = message.state;
    const key =
      message.state.origin && message.state.conversationId
        ? conversationKey(message.state.origin, message.state.conversationId)
        : null;
    await pushTrackingState(tabId, key);
    return { ok: true };
  }

  if (message.type === "capture") {
    const { state, messages } = message;
    if (!state.origin || !state.conversationId)
      return { ok: false, reason: "not a conversation" };
    const key = conversationKey(state.origin, state.conversationId);
    const entry = (await tracking()).conversations[key];
    if (!entry || entry.paused) return { ok: false, reason: "not tracked" };
    const now = new Date().toISOString();
    try {
      const result = await native({
        type: "capture",
        payload: {
          projectId: entry.projectId,
          conversation: {
            origin: state.origin,
            conversationId: state.conversationId,
            title: state.title,
            url: state.url,
            // The extension only ever sees what the page rendered.
            coverage: "partial",
          },
          messages: messages.map((m) => ({
            origin: state.origin,
            conversationId: state.conversationId,
            externalId: m.externalId,
            role: m.role,
            text: m.text,
            order: m.order,
            url: state.url,
            timestamp: m.timestamp,
            capturedAt: now,
            complete: m.complete,
            meta: {},
          })),
        },
      });
      session.lastSync = now;
      session.lastError = null;
      return { ok: true, result };
    } catch (e: any) {
      session.lastError = String(e?.message ?? e);
      await native({
        type: "reportError",
        conversationId: key,
        payload: { error: session.lastError },
      }).catch(() => undefined);
      return { ok: false, error: session.lastError };
    }
  }
  return { ok: false };
}

async function activeConversation() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id)
    return { tabId: undefined, page: null as PageState | null, key: null };
  // Ask the content script directly so the extension needs no "tabs" permission to read URLs.
  const page = await chrome.tabs
    .sendMessage(tab.id, { type: "describe" })
    .catch(() => session.pages[tab.id!] ?? null);
  const key =
    page?.origin && page?.conversationId
      ? conversationKey(page.origin, page.conversationId)
      : null;
  return { tabId: tab.id, page: (page as PageState) ?? null, key };
}

async function handlePanel(message: PanelMessage): Promise<any> {
  if (message.type === "pair") {
    await native({ type: "pair", code: message.code });
    session.paired = true;
    return buildState();
  }
  if (message.type === "unpair") {
    await native({ type: "unpair" }).catch(() => undefined);
    session.paired = false;
    return buildState();
  }
  if (message.type === "track") {
    const { tabId, page, key } = await activeConversation();
    if (!key || !page?.origin)
      throw new Error("Open a ChatGPT or Claude conversation first.");
    const state = await tracking();
    state.conversations[key] = {
      projectId: message.projectId,
      paused: false,
      title: page.title,
      origin: page.origin,
    };
    await saveTracking(state);
    if (tabId !== undefined) {
      await pushTrackingState(tabId, key);
      await chrome.tabs
        .sendMessage(tabId, { type: "rescan" })
        .catch(() => undefined);
    }
    return buildState();
  }
  if (message.type === "untrack" || message.type === "pause") {
    const { tabId, key } = await activeConversation();
    if (!key) throw new Error("Open a tracked conversation first.");
    const state = await tracking();
    if (message.type === "untrack") {
      delete state.conversations[key];
      await native({ type: "untrack", conversationId: key }).catch(
        () => undefined,
      );
    } else if (state.conversations[key])
      state.conversations[key].paused = message.paused;
    await saveTracking(state);
    if (tabId !== undefined) await pushTrackingState(tabId, key);
    return buildState();
  }
  if (message.type === "forget") {
    const { tabId, key } = await activeConversation();
    if (!key) throw new Error("Open a tracked conversation first.");
    await native({ type: "forget", conversationId: key });
    const state = await tracking();
    delete state.conversations[key];
    await saveTracking(state);
    if (tabId !== undefined) await pushTrackingState(tabId, key);
    return buildState();
  }
  if (message.type === "detail") {
    return native({ type: message.view, projectId: message.projectId });
  }
  if (message.type === "refresh") await refreshCompanion();
  return buildState();
}

async function buildState(): Promise<PanelState> {
  await refreshCompanion();
  const { page, key } = await activeConversation();
  const state = await tracking();
  const entry = key ? state.conversations[key] : undefined;
  let projects: PanelState["projects"] = [];
  let conversations: PanelState["conversations"] = [];
  if (session.paired && session.reachable) {
    projects = await native<any[]>({ type: "projects" }).catch(() => []);
    conversations = await native<any[]>({ type: "conversations" }).catch(
      () => [],
    );
  }
  return {
    companion: {
      reachable: session.reachable,
      paired: session.paired,
      error: session.lastError ?? undefined,
    },
    page,
    tracked: entry
      ? { projectId: entry.projectId, paused: entry.paused }
      : null,
    projects: projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      mode: p.mode,
      backend: p.backend,
    })),
    conversations: conversations.map((c: any) => ({
      id: c.id,
      origin: c.origin,
      title: c.title,
      messageCount: c.messageCount,
      coverage: c.coverage,
      tracked: c.tracked,
      paused: c.paused,
      lastSync: c.lastSync,
      lastError: c.lastError ?? null,
      projectId: c.projectId,
    })),
    lastSync: session.lastSync,
    lastError: session.lastError,
  };
}
