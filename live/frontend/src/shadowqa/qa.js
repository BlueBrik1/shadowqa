import { buildPayload, pickReplayValues } from "./capture";

/** Autonomous QA mode: runs declared + learned flows in the real browser and files incidents for failures. */
export class QARunner {
  constructor({ bridge, replay, detector, buffer, ctx, config }) {
    Object.assign(this, { bridge, replay, detector, buffer, ctx, config });
    this.running = false;
  }

  async run({ onProgress } = {}) {
    if (this.running) return null;
    this.running = true;
    const started = Date.now();
    const results = [];
    const incidents = [];
    this.detector.suppressed = true;
    const returnTo = location.pathname;
    try {
      const { flows } = await this.bridge.getFlows();
      const routes = [...new Set(flows.map((f) => f.steps?.[0]?.route).filter(Boolean))];
      for (const flow of flows) {
        onProgress?.({ current: flow.name, results: results.slice(), total: flows.length });
        const t0 = Date.now();
        let failure = null;
        this.detector.onSuppressedFailure = (f) => {
          failure = failure || f;
        };
        // Flows that start on the current route need a fresh mount: hop to a neutral route first so effects/requests re-run.
        const first = flow.steps?.[0];
        if (first?.action === "navigate" && first.route === location.pathname) {
          const neutral = routes.find((r) => r !== location.pathname);
          if (neutral) {
            await this.replay.execute({ action: "navigate", route: neutral }, {});
            await this.replay.settle();
          }
        }
        const res = await this.replay.run({ steps: flow.steps, expectations: flow.expectations }, { values: {} });
        const entry = { name: flow.name, source: flow.source, status: res.status, duration_ms: Date.now() - t0, steps: res.steps, evidence: res.evidence };
        if (res.status === "failed") {
          entry.error = res.errors[0] ? `${res.errors[0].type}: ${res.errors[0].message}` : res.evidence.find((e) => !e.ok)?.label || res.steps.find((s) => s.status === "failed")?.detail;
          if (!failure) {
            const badRequest = res.network.find((n) => n.status >= 400 || n.status === 0);
            if (badRequest) failure = { kind: "http_error", type: "HttpError", message: `${badRequest.method} ${badRequest.path} → HTTP ${badRequest.status}`, stack: "", ts: Date.now() };
          }
          if (failure) {
            try {
              const payload = buildPayload({ failure, buffer: this.buffer, ctx: this.ctx, config: this.config, source: "qa", flowName: flow.name });
              const inc = await this.bridge.createIncident(payload);
              entry.incident_id = inc.id;
              incidents.push({ id: inc.id, values: pickReplayValues(payload.events, this.ctx.replayValues) });
            } catch (err) {
              entry.error += ` (bridge: ${err.message})`;
            }
          }
        }
        results.push(entry);
        onProgress?.({ current: null, results: results.slice(), total: flows.length });
      }
      const run = await this.bridge.postQaRun({ flows: results, duration_ms: Date.now() - started });
      run.incident_values = incidents;
      return run;
    } finally {
      this.detector.onSuppressedFailure = null;
      this.detector.suppressed = false;
      this.running = false;
      if (location.pathname !== returnTo) {
        history.pushState({}, "", returnTo);
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      }
    }
  }
}
