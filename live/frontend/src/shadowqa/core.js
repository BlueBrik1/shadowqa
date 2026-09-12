import { RingBuffer, sleep } from "./buffer";
import { Bridge } from "./bridge";
import { buildPayload, pickReplayValues } from "./capture";
import { Detector } from "./detector";
import { MemoryObserver } from "./memoryObserver";
import { observeInteractions } from "./observe/interaction";
import { observeNetwork } from "./observe/network";
import { observeRuntime } from "./observe/runtime";
import { Overlay } from "./overlay/overlay";
import { QARunner } from "./qa";
import { ReplayEngine } from "./replay";
import { session } from "./session";

const TERMINAL = new Set(["verified", "committed", "dismissed", "rolled_back", "validation_failed", "replay_failed", "no_safe_fix", "diagnosis_failed", "superseded"]);
const RESTING = new Set(["verified", "committed"]);

/** ShadowQA runtime: OBSERVE → UNDERSTAND → DIAGNOSE → PLAN → ACT → VALIDATE → REPLAY → VERIFY. */
export class ShadowQA {
  constructor(config) {
    this.config = { appName: document.title || "application", ...config };
    this.buffer = new RingBuffer(140);
    this.ctx = { lastInteractionId: null, lastTrigger: null, replayValues: {}, inflight: 0 };
    this.bridge = new Bridge(this.config);
    this.overlay = new Overlay({ actions: this.actions() });
    this.replay = new ReplayEngine({ buffer: this.buffer, ctx: this.ctx });
    this.detector = new Detector({ onIncident: (f) => this.onIncident(f) });
    this.memory = new MemoryObserver(this.bridge);
    this.qa = new QARunner({ bridge: this.bridge, replay: this.replay, detector: this.detector, buffer: this.buffer, ctx: this.ctx, config: this.config });
    this.incident = null;
    this.pollTimer = null;
    this.replayValues = {};
  }

  start() {
    const bridgePrefix = this.config.bridgeUrl.replace(/\/api\/shadowqa\/?$/, "/api/shadowqa");
    this.ctx.onNetwork = (item) => {
      this.detector.handleNetwork(item);
      this.memory.noteNetwork(item);
    };
    this.ctx.onRoute = (path) => this.memory.noteRoute(path);
    this.ctx.onInteraction = (item) => this.memory.noteInteraction(item);
    observeNetwork(this.buffer, this.ctx, { ignorePrefixes: [bridgePrefix] });
    observeInteractions(this.buffer, this.ctx);
    observeRuntime(this.buffer, this.ctx, (failure) => this.detector.handleFailure(failure));
    this.overlay.mount();
    this.memory.start();
    this.bridge.health().then((h) => (this.health = h)).catch(() => (this.health = null));
    window.__shadowqa = this;
    this.restoreSession();
  }

  // ---- incident lifecycle -------------------------------------------------
  async onIncident(failure) {
    this.detector.active = true;
    this.overlay.set({ view: "capturing", incident: null, replaySteps: null });
    const payload = buildPayload({ failure, buffer: this.buffer, ctx: this.ctx, config: this.config });
    const values = pickReplayValues(payload.events, this.ctx.replayValues);
    try {
      const inc = await this.bridge.createIncident(payload);
      this.replayValues = values;
      session.save({ incidentId: inc.id, phase: "active", replayValues: values });
      this.setIncident(inc);
      this.startPolling();
    } catch (err) {
      this.detector.active = false;
      this.overlay.set({ view: "bridge_error", error: err.message });
    }
  }

  setIncident(inc) {
    this.incident = inc;
    if (inc && this.health) inc.pr_enabled = Boolean(this.health.git?.pr_enabled);
    this.overlay.setIncident(inc);
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.refresh().catch(() => {}), 850);
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async refresh() {
    if (!this.incident) return;
    const inc = await this.bridge.getIncident(this.incident.id);
    this.setIncident(inc);
    if (inc.status === "awaiting_replay") {
      this.stopPolling();
      await this.reloadForReplay();
    } else if (TERMINAL.has(inc.status)) {
      this.stopPolling();
      this.detector.reset();
    }
  }

  async reloadForReplay() {
    session.patch({ phase: "reload_for_replay", reloadAt: Date.now() });
    this.memory.stop();
    await this.memory.flush();
    // Give the dev server time to notice the file change; webpack-dev-middleware then blocks the reload until the new bundle is compiled.
    await sleep(2200);
    location.reload();
  }

  async restoreSession() {
    const s = session.load();
    if (!s?.incidentId) return;
    try {
      const midReplayPhase = s.phase === "reload_for_replay" || s.phase === "replaying";
      // A backend-side fix restarts the bridge itself; give it time to come back before deciding anything.
      if (midReplayPhase) await this.waitForBridge();
      const inc = await this.bridge.getIncident(s.incidentId);
      this.replayValues = s.replayValues || {};
      const midReplay = midReplayPhase && (inc.status === "awaiting_replay" || inc.status === "replaying");
      if (midReplay) {
        const attempts = (s.replayAttempts || 0) + 1;
        session.patch({ replayAttempts: attempts });
        if (attempts > 2) {
          // The page reloaded twice during replay (e.g. another file change) — never leave the incident spinning; the bridge rolls back.
          const updated = await this.bridge.postReplayResult(inc.id, { status: "failed", steps: [], evidence: [{ label: "Replay engine", ok: false, detail: "replay interrupted by repeated page reloads" }], duration_ms: 0 }).catch(() => null);
          session.patch({ phase: "done" });
          if (updated) this.setIncident(updated);
          return;
        }
        await this.runReplay(inc);
        return;
      }
      if (!TERMINAL.has(inc.status)) {
        this.detector.active = true;
        this.setIncident(inc);
        this.startPolling();
      } else if (RESTING.has(inc.status) && Date.now() - new Date(inc.updated_at).getTime() < 180000) {
        this.setIncident(inc);
      } else {
        session.clear();
      }
    } catch {
      session.clear();
    }
  }

  async runReplay(inc) {
    this.detector.active = true;
    this.detector.suppressed = true;
    session.patch({ phase: "replaying" });
    this.incident = { ...inc, status: "replaying" };
    this.overlay.setIncident(this.incident);
    try {
      await this.bridge.replayStarted(inc.id);
      await this.waitForApp();
      const result = await this.replay.run(inc.replay_plan, { values: this.replayValues, onStep: (steps) => this.overlay.setReplayProgress(steps) });
      const updated = await this.bridge.postReplayResult(inc.id, result);
      session.patch({ phase: "done" });
      this.setIncident(updated);
    } catch (err) {
      const updated = await this.bridge.postReplayResult(inc.id, { status: "failed", steps: [], evidence: [{ label: "Replay engine", ok: false, detail: err.message }], duration_ms: 0 }).catch(() => null);
      if (updated) this.setIncident(updated);
    } finally {
      this.detector.suppressed = false;
      this.detector.reset();
    }
  }

  async waitForApp() {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const root = document.getElementById("root");
      if (root && root.children.length && this.ctx.inflight === 0) break;
      await sleep(100);
    }
    await sleep(400);
  }

  async waitForBridge(timeout = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.bridge.health().then(() => true).catch(() => false)) return true;
      await sleep(500);
    }
    return false;
  }

  // ---- developer actions --------------------------------------------------
  actions() {
    return {
      apply: async () => {
        if (!this.incident) return;
        try {
          await this.bridge.apply(this.incident.id);
          this.overlay.set({ view: null });
          this.startPolling();
        } catch (err) {
          this.overlay.set({ view: "bridge_error", error: err.message });
        }
      },
      dismiss: async () => {
        const inc = this.incident;
        this.stopPolling();
        this.detector.reset();
        this.incident = null;
        session.clear();
        this.overlay.set({ view: null, incident: null, replaySteps: null, qa: null, qaRun: null });
        // Verified/committed fixes keep their verdict in history; only open incidents are marked dismissed.
        if (inc && !TERMINAL.has(inc.status)) await this.bridge.dismiss(inc.id).catch(() => {});
      },
      resetDemo: async () => {
        try {
          await this.bridge.resetDemo();
          session.clear();
          this.overlay.set({ view: "toast", toast: "Demo reset — bugs restored, ShadowQA memory cleared. Reloading…" });
          await sleep(900);
          location.reload();
        } catch (err) {
          this.overlay.set({ view: "bridge_error", error: err.message });
        }
      },
      rollback: async () => {
        if (!this.incident) return;
        this.stopPolling();
        const inc = await this.bridge.rollback(this.incident.id).catch(() => null);
        this.detector.reset();
        if (inc) this.setIncident(inc);
      },
      createPr: async () => {
        if (!this.incident) return;
        try {
          await this.bridge.createPr(this.incident.id);
          this.setIncident(await this.bridge.getIncident(this.incident.id));
        } catch (err) {
          this.overlay.set({ view: "bridge_error", error: err.message });
        }
      },
      retry: async () => {
        if (!this.incident) return;
        await this.bridge.rediagnose(this.incident.id).catch(() => {});
        this.detector.active = true;
        this.startPolling();
      },
      runQA: () => this.runQA(),
      investigate: async (id) => {
        const inc = await this.bridge.getIncident(id);
        const fromQa = (this.lastQaRun?.incident_values || []).find((v) => v.id === id);
        this.replayValues = fromQa?.values || {};
        session.save({ incidentId: id, phase: "active", replayValues: this.replayValues });
        this.detector.active = !TERMINAL.has(inc.status);
        this.overlay.set({ view: null, qa: null, inspector: false });
        this.setIncident(inc);
        if (!TERMINAL.has(inc.status)) this.startPolling();
      },
      selectIncident: async (id) => {
        const inc = await this.bridge.getIncident(id).catch(() => null);
        if (inc) this.overlay.set({ incident: inc, sourceFile: null });
        this.loadSource(inc);
      },
      inspectorOpened: (tab) => this.loadInspectorData(tab),
    };
  }

  async loadInspectorData(tab) {
    const o = this.overlay;
    const inc = o.state.incident;
    try {
      const recent = await this.bridge.listIncidents();
      o.set({ recent });
      if (tab === "health") o.set({ flows: (await this.bridge.getFlows()).flows, qaRun: await this.bridge.latestQaRun(), scenarios: (await this.bridge.getScenarios()).scenarios });
      if (tab === "memory") o.set({ memory: await this.bridge.getMemory() });
      if (tab === "agent") o.set({ telemetry: await this.bridge.getTelemetry(), audit: await this.bridge.getAudit() });
      if (tab === "source") await this.loadSource(inc);
    } catch {
      /* inspector data is best-effort */
    }
  }

  async loadSource(inc) {
    const loc = inc?.source_location;
    if (!loc?.resolved) return;
    const file = await this.bridge.readFile(loc.file, loc.line).catch(() => null);
    if (file) this.overlay.set({ sourceFile: file });
  }

  async runQA() {
    if (this.qa.running) return;
    this.overlay.set({ view: "qa", inspector: false, qa: { results: [], current: null } });
    try {
      const run = await this.qa.run({ onProgress: (p) => this.overlay.set({ view: "qa", qa: p }) });
      this.lastQaRun = run;
      this.overlay.set({ view: "qa_summary", qaRun: run });
    } catch (err) {
      this.overlay.set({ view: "bridge_error", error: `QA run failed: ${err.message}` });
    }
  }
}
