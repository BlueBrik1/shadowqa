import { STYLES } from "./styles";
import { renderInspector } from "./inspector";
import * as views from "./views";

const TRANSIENT_VIEWS = new Set(["capturing", "bridge_error", "qa", "qa_summary", "fix", "toast"]);

/** Zero-UI overlay host: a Shadow DOM island that stays invisible until there is something worth saying. */
export class Overlay {
  constructor({ actions }) {
    this.actions = actions;
    this.state = { view: null, incident: null, replaySteps: null, inspector: false, tab: "timeline", sourceFile: null, busy: false, qa: null, qaRun: null, memory: null, telemetry: null, audit: null, flows: null, recent: null, error: null };
  }

  mount() {
    if (this.host) return;
    this.host = document.createElement("shadowqa-root");
    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    this.root = document.createElement("div");
    this.root.className = "root";
    this.dock = document.createElement("div");
    this.dock.className = "dock";
    this.dot = document.createElement("button");
    this.dot.className = "dot";
    this.dot.dataset.action = "dot";
    this.dot.dataset.testid = "sqa-status-dot";
    this.dot.innerHTML = "<i></i>";
    this.dock.appendChild(this.dot);
    this.root.appendChild(this.dock);
    this.cardEl = null;
    this.drawerEl = null;
    this.shadow.append(style, this.root);
    document.documentElement.appendChild(this.host);
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-action='select-incident']");
      if (sel) this.actions.selectIncident(sel.value);
    });
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        this.toggleInspector();
      }
    });
    this.render();
  }

  set(fields) {
    Object.assign(this.state, fields);
    this.render();
  }

  setIncident(incident) {
    const view = this.state.view;
    const keepFix = view === "fix" && incident?.status === "diagnosed";
    this.set({ incident, view: keepFix ? "fix" : TRANSIENT_VIEWS.has(view) && view !== "fix" && !incident ? view : null });
  }

  setReplayProgress(steps) {
    this.set({ replaySteps: steps });
  }

  toggleInspector(tab) {
    this.set({ inspector: !this.state.inspector || Boolean(tab && tab !== this.state.tab), tab: tab || this.state.tab });
    if (this.state.inspector) this.actions.inspectorOpened(this.state.tab);
  }

  onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const a = this.actions;
    const map = {
      inspector: () => this.toggleInspector(btn.dataset.tab),
      "close-inspector": () => this.set({ inspector: false }),
      tab: () => {
        this.set({ tab: btn.dataset.tab });
        a.inspectorOpened(btn.dataset.tab);
      },
      "view-fix": () => this.set({ view: "fix" }),
      apply: () => a.apply(),
      reject: () => a.dismiss(),
      dismiss: () => a.dismiss(),
      rollback: () => a.rollback(),
      "create-pr": () => a.createPr(),
      retry: () => a.retry(),
      "run-qa": () => a.runQA(),
      investigate: () => a.investigate(btn.dataset.id),
      "reset-demo": () => a.resetDemo(),
      dot: () => this.toggleInspector("health"),
    };
    map[action]?.();
  }

  cardHtml() {
    const s = this.state;
    const inc = s.incident;
    if (s.view === "capturing") return views.renderCapturing(s);
    if (s.view === "bridge_error") return views.renderBridgeError(s.error);
    if (s.view === "toast") return views.renderToast(s.toast);
    if (s.view === "qa") return views.renderQA(s.qa || {});
    if (s.view === "qa_summary") return views.renderQASummary(s.qaRun || {});
    if (!inc) return null;
    if (s.view === "fix" && inc.status === "diagnosed") return views.renderFix(inc);
    switch (inc.status) {
      case "captured":
      case "diagnosing":
        return views.renderAnalyzing(inc);
      case "diagnosed":
        return views.renderDiagnosed(inc);
      case "applying":
      case "validating":
        return views.renderValidating(inc);
      case "awaiting_replay":
        return views.renderReloading(inc);
      case "replaying":
        return views.renderReplaying(inc, s.replaySteps);
      case "verified":
        return views.renderVerified(inc);
      case "committed":
        return views.renderCommitted(inc);
      case "validation_failed":
      case "replay_failed":
        return views.renderFailed(inc);
      case "no_safe_fix":
      case "diagnosis_failed":
      case "superseded":
        return views.renderUnsafe(inc);
      case "rolled_back":
        return views.renderRolledBack(inc);
      default:
        return null;
    }
  }

  /** Persistent elements + change detection: the card animates in once and never re-mounts on the 850 ms poll, scroll is preserved. */
  render() {
    if (!this.root) return;
    const card = this.cardHtml();
    const s = this.state;
    const busy = s.incident && !["verified", "committed", "dismissed", "rolled_back", "validation_failed", "replay_failed", "no_safe_fix", "diagnosis_failed", "superseded"].includes(s.incident.status);
    this.dot.className = `dot ${busy || s.view === "qa" ? "busy" : ""}`;
    this.dot.title = `ShadowQA · ${busy ? "working" : "watching"} (Ctrl+Shift+Q)`;

    if (card) {
      if (!this.cardEl) {
        this.cardEl = document.createElement("div");
        this.cardEl.className = "card";
        this.dock.insertBefore(this.cardEl, this.dot);
      }
      patchHtml(this.cardEl, card, ".card-body");
    } else if (this.cardEl) {
      this.cardEl.remove();
      this.cardEl = null;
    }

    if (s.inspector) {
      const html = renderInspector(s);
      if (!this.drawerEl) {
        this.drawerEl = document.createElement("div");
        this.drawerEl.className = "drawer";
        this.drawerEl.dataset.testid = "sqa-inspector";
        this.root.appendChild(this.drawerEl);
      }
      patchHtml(this.drawerEl, html, ".pane");
    } else if (this.drawerEl) {
      this.drawerEl.remove();
      this.drawerEl = null;
    }
  }
}

const VOLATILE = /(<[^>]*data-volatile="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/g;

/** Replace innerHTML only when the structure changed; counters marked data-volatile update in place, scroll & focus are preserved. */
function patchHtml(el, html, scrollSelector) {
  if (el.__html === html) return;
  const skeleton = html.replace(VOLATILE, "$1$4");
  if (el.__skeleton === skeleton) {
    for (const m of html.matchAll(VOLATILE)) {
      const target = el.querySelector(`[data-volatile="${m[2]}"]`);
      if (target && target.innerHTML !== m[3]) target.innerHTML = m[3];
    }
    el.__html = html;
    return;
  }
  const inner = el.querySelector(scrollSelector);
  const top = { el: el.scrollTop, inner: inner ? inner.scrollTop : 0 };
  const focusKey = el.querySelector(":focus")?.dataset?.testid;
  el.innerHTML = html;
  el.__html = html;
  el.__skeleton = skeleton;
  el.scrollTop = top.el;
  const nextInner = el.querySelector(scrollSelector);
  if (nextInner) nextInner.scrollTop = top.inner;
  if (focusKey) el.querySelector(`[data-testid="${focusKey}"]`)?.focus?.({ preventScroll: true });
}
