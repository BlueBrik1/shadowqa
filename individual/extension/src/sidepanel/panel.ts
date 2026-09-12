import type { PanelMessage, PanelState } from "../shared/protocol.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const show = (element: HTMLElement, visible: boolean) =>
  element.classList.toggle("hidden", !visible);

function send<T = PanelState>(message: PanelMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: any) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (response?.error) return reject(new Error(response.error));
      resolve(response as T);
    });
  });
}

let current: PanelState | null = null;
let view: "items" | "plans" | "tasks" | "findings" = "items";

function text(element: HTMLElement, value: string) {
  element.textContent = value;
}

function render(state: PanelState) {
  current = state;
  const paired = state.companion.paired && state.companion.reachable;

  $("dot").className =
    "dot " + (paired ? "on" : state.companion.reachable ? "" : "off");
  text(
    $("companion-state"),
    paired
      ? "paired"
      : state.companion.reachable
        ? "not paired"
        : "unreachable",
  );
  text(
    $("last-sync"),
    state.lastSync ? new Date(state.lastSync).toLocaleTimeString() : "never",
  );

  const error = state.companion.error ?? state.lastError;
  show($("sync-error"), !!error);
  if (error) text($("sync-error"), error);

  show($("pair"), !paired);

  const page = state.page;
  const onConversation = !!page?.conversationId;
  show($("page"), true);
  text($("page-origin"), page?.origin ?? "not a supported page");
  text($("page-title"), page?.title || "—");
  text($("page-count"), String(page?.messageCount ?? 0));
  text(
    $("page-status"),
    !onConversation
      ? "open a conversation"
      : page?.streaming
        ? "response still streaming"
        : state.tracked
          ? state.tracked.paused
            ? "tracking paused"
            : "tracking"
          : "not tracked",
  );
  show($("page-warning"), !!page?.warning);
  if (page?.warning) text($("page-warning"), page.warning);

  const select = $<HTMLSelectElement>("project");
  const previous = select.value;
  select.innerHTML = "";
  for (const project of state.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} · ${project.mode} · ${project.backend}`;
    select.append(option);
  }
  if (!state.projects.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No projects — create one in the CLI";
    select.append(option);
  }
  if (previous && state.projects.some((p) => p.id === previous))
    select.value = previous;

  show($("track-row"), paired && onConversation && !state.tracked);
  show($("tracked-row"), paired && onConversation && !!state.tracked);
  $<HTMLButtonElement>("track").disabled = !state.projects.length;
  text($("pause"), state.tracked?.paused ? "Resume" : "Pause");

  const list = $("conversation-list");
  list.innerHTML = "";
  const tracked = state.conversations.filter((c) => c.tracked);
  show($("conversations-empty"), !tracked.length);
  for (const conversation of tracked) {
    const item = document.createElement("li");
    const title = document.createElement("div");
    title.textContent = conversation.title || conversation.id;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [
      conversation.origin,
      conversation.projectId,
      `${conversation.messageCount} turns`,
      conversation.coverage === "partial" ? "partial capture" : "full session",
      conversation.paused ? "paused" : "live",
      conversation.lastSync
        ? new Date(conversation.lastSync).toLocaleTimeString()
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    item.append(title, meta);
    if (conversation.lastError) {
      const error = document.createElement("div");
      error.className = "error";
      error.textContent = conversation.lastError;
      item.append(error);
    }
    list.append(item);
  }

  void renderView();
}

async function renderView() {
  const container = $("view");
  const projectId =
    $<HTMLSelectElement>("project").value || current?.projects[0]?.id;
  if (!current?.companion.paired || !projectId) {
    container.innerHTML =
      '<p class="dim small">Pair and create a project to see data here.</p>';
    return;
  }
  container.innerHTML = '<p class="dim small">Loading…</p>';
  try {
    const rows = await send<any[]>({ type: "detail", view, projectId });
    container.innerHTML = "";
    if (!Array.isArray(rows) || !rows.length) {
      container.innerHTML = `<p class="dim small">${emptyMessage()}</p>`;
      return;
    }
    for (const row of rows.slice(0, 60)) container.append(entry(row));
  } catch (e: any) {
    container.innerHTML = "";
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = String(e?.message ?? e);
    container.append(error);
  }
}

function emptyMessage() {
  return {
    items:
      "No context extracted yet. Run: shadowqa-individual extract &lt;project&gt;",
    plans: "No plans yet. Run: shadowqa-individual plan &lt;project&gt;",
    tasks: "No work has run yet.",
    findings: "No findings.",
  }[view];
}

function entry(row: any) {
  const element = document.createElement("div");
  element.className = "entry";
  const label = document.createElement("div");
  label.className = "label";
  const body = document.createElement("div");

  if (view === "items") {
    label.textContent = `${row.kind} · ${row.status}${row.editedByUser ? " · edited by you" : ""}`;
    body.textContent = row.text;
  } else if (view === "plans") {
    label.textContent = `${row.id} · ${row.status} · ${row.backend}`;
    body.textContent = row.objective;
  } else if (view === "tasks") {
    label.textContent = `${String(row.id).slice(0, 8)} · ${row.state} · ${row.backend}`;
    body.textContent = row.error ?? "";
  } else {
    label.textContent = `${String(row.id).slice(0, 10)} · ${row.classification} · seen ${row.occurrences}×`;
    body.textContent = String(row.rule ?? "");
  }
  element.append(label);
  if (body.textContent) element.append(body);
  return element;
}

async function refresh() {
  try {
    render(await send({ type: "refresh" }));
  } catch (e: any) {
    const error = $("sync-error");
    show(error, true);
    text(error, String(e?.message ?? e));
    $("dot").className = "dot off";
  }
}

$("pair-submit").addEventListener("click", async () => {
  const input = $<HTMLInputElement>("code");
  const error = $("pair-error");
  show(error, false);
  try {
    render(
      await send({ type: "pair", code: input.value.trim().toUpperCase() }),
    );
    input.value = "";
  } catch (e: any) {
    show(error, true);
    text(error, String(e?.message ?? e));
  }
});

$("track").addEventListener("click", async () => {
  const projectId = $<HTMLSelectElement>("project").value;
  if (!projectId) return;
  render(await send({ type: "track", projectId }));
});

$("pause").addEventListener("click", async () =>
  render(await send({ type: "pause", paused: !current?.tracked?.paused })),
);

$("untrack").addEventListener("click", async () =>
  render(await send({ type: "untrack" })),
);

$("forget").addEventListener("click", async () => {
  if (
    !confirm(
      "Delete every captured message from this conversation? This cannot be undone.",
    )
  )
    return;
  render(await send({ type: "forget" }));
});

$<HTMLSelectElement>("project").addEventListener(
  "change",
  () => void renderView(),
);

for (const tab of Array.from(
  document.querySelectorAll<HTMLButtonElement>(".tab"),
))
  tab.addEventListener("click", () => {
    for (const other of Array.from(document.querySelectorAll(".tab")))
      other.classList.toggle("active", other === tab);
    view = tab.dataset.view as typeof view;
    void renderView();
  });

void refresh();
setInterval(() => void refresh(), 5000);
