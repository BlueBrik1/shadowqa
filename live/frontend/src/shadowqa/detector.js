/** Decides which failures are meaningful enough to become incidents. Debounced, rate-limited, suppressible. */
export class Detector {
  constructor({ onIncident }) {
    this.onIncident = onIncident;
    this.suppressed = false; // true while ShadowQA itself drives the app (replay / QA)
    this.active = false; // one incident at a time
    this.recent = new Map();
    this.timer = null;
    this.lastFailureTs = 0;
    this.onSuppressedFailure = null;
  }

  handleFailure(failure) {
    this.lastFailureTs = failure.ts;
    if (this.suppressed) {
      this.onSuppressedFailure?.(failure);
      return;
    }
    if (this.active) return;
    const fp = `${failure.type}|${failure.message.replace(/\d+/g, "#").slice(0, 100)}`;
    const seen = this.recent.get(fp);
    if (seen && Date.now() - seen < 30000) return;
    this.recent.set(fp, Date.now());
    clearTimeout(this.timer);
    // Give in-flight network responses ~400ms to land so the correlation window is complete.
    this.timer = setTimeout(() => this.onIncident(failure), 400);
  }

  /** After a verdict or an explicit developer action the same failure must be detectable again immediately (e.g. retry after Undo). */
  reset() {
    this.recent.clear();
    this.active = false;
  }

  handleNetwork(item) {
    if (this.suppressed || this.active) return;
    if ((item.status || 0) < 500 && item.status !== 0) return;
    if (!item.initiator_event_id) return; // background polling noise is not user intent
    setTimeout(() => {
      if (this.active || Date.now() - this.lastFailureTs < 2000) return; // a runtime error already explains it
      const failure = { kind: "http_error", type: item.status === 0 ? "NetworkError" : "HttpError", message: `${item.method} ${item.path} → ${item.status === 0 ? item.error || "no response" : `HTTP ${item.status}`}`, stack: "", ts: item.end_ts || Date.now() };
      this.handleFailure(failure);
    }, 700);
  }
}
