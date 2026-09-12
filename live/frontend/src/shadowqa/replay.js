import { sleep } from "./buffer";

const safeQuery = (selector) => {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
};

function setNativeValue(el, value) {
  if (el.type === "checkbox") {
    const want = value === true || value === "true";
    if (el.checked !== want) el.click();
    return;
  }
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  el.focus();
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Failure Replay Engine: re-executes the recorded interaction in the live app and gathers evidence. */
export class ReplayEngine {
  constructor({ buffer, ctx }) {
    this.buffer = buffer;
    this.ctx = ctx;
  }

  async waitFor(fn, timeout = 5000, interval = 80) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  async settle() {
    await sleep(180);
    await this.waitFor(() => this.ctx.inflight === 0, 6000);
    await sleep(150);
  }

  async find(step) {
    const el = await this.waitFor(() => {
      let e = step.selector ? safeQuery(step.selector) : null;
      const fb = step.fallback || {};
      if (!e && fb.testid) e = safeQuery(`[data-testid="${fb.testid}"]`);
      if (!e && fb.name) e = safeQuery(`[name="${fb.name}"]`);
      if (!e && fb.text) e = [...document.querySelectorAll('button, a, [role="button"]')].find((b) => b.innerText.trim() === fb.text);
      return e && !e.disabled ? e : null;
    }, 6000);
    if (!el) throw new Error(`element not found: ${step.selector || step.fallback?.testid || step.fallback?.text}`);
    return el;
  }

  async goto(route, loose = false) {
    const before = location.pathname;
    if (before !== route) {
      history.pushState({}, "", route);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }
    await this.waitFor(() => location.pathname === route || (loose && location.pathname !== before), 3000);
    await sleep(120);
  }

  async execute(step, values) {
    switch (step.action) {
      case "navigate": {
        // Already on the failure route (e.g. right after the reload): hop away first so the screen re-mounts and its
        // mount-time requests happen inside the observed window — otherwise "request not observed" would be a false failure.
        if (location.pathname === step.route) {
          const away = step.from && step.from !== step.route ? step.from : step.route === "/" ? "/__shadowqa_remount" : "/";
          await this.goto(away, true);
          await this.settle();
        }
        await this.goto(step.route);
        return;
      }
      case "fill": {
        const el = await this.find(step);
        const value = step.value !== undefined ? step.value : values[step.event_id];
        if (value === undefined) throw new Error("no recorded value for this field");
        setNativeValue(el, value);
        return;
      }
      case "click": {
        const el = await this.find(step);
        el.scrollIntoView?.({ block: "center" });
        el.click();
        return;
      }
      case "submit": {
        const el = await this.find(step);
        if (el.requestSubmit) el.requestSubmit();
        else el.submit();
        return;
      }
      default:
        throw new Error(`unknown action ${step.action}`);
    }
  }

  async run(plan, { values = {}, onStep } = {}) {
    const started = Date.now();
    const observed = { network: [], errors: [] };
    const unsub = this.buffer.subscribe((item) => {
      if (item.kind === "network") observed.network.push(item);
      if (item.kind === "error") observed.errors.push(item);
    });
    const steps = (plan.steps || []).map((s) => ({ ...s, status: "pending" }));
    const report = () => onStep?.(steps.map((s) => ({ id: s.id, label: s.label, action: s.action, status: s.status, detail: s.detail })));
    try {
      report();
      for (const step of steps) {
        step.status = "running";
        report();
        try {
          await this.execute(step, values);
          await this.settle();
          step.status = "passed";
        } catch (err) {
          step.status = "failed";
          step.detail = err.message;
          report();
          break;
        }
        report();
      }
      const exp = plan.expectations || {};
      const evidence = [];
      const stepsPassed = steps.every((s) => s.status === "passed");
      if (exp.request?.path) {
        const match = await this.waitFor(() => observed.network.find((n) => n.method === exp.request.method && n.path === exp.request.path && n.end_ts), 10000);
        const min = exp.request.status_min ?? 200;
        const max = exp.request.status_max ?? 399;
        evidence.push({ label: `${exp.request.method} ${exp.request.path}`, ok: Boolean(match), detail: match ? `${match.duration_ms} ms` : "request not observed" });
        evidence.push({ label: match ? `Response ${match.status}` : "Response", ok: Boolean(match) && match.status >= min && match.status <= max, detail: match ? (match.ok ? "success" : match.response_snippet?.slice(0, 120) || "error") : "—" });
      }
      if (exp.ui?.selector || exp.ui?.text) {
        const found = await this.waitFor(() => (exp.ui.selector && safeQuery(exp.ui.selector)) || (exp.ui.text && document.body.innerText.includes(exp.ui.text)), 6000);
        evidence.push({ label: "UI reached expected state", ok: Boolean(found), detail: exp.ui.selector || exp.ui.text });
      }
      await sleep(350);
      const first = observed.errors[0];
      evidence.push({ label: "No runtime errors", ok: observed.errors.length === 0, detail: first ? `${first.type}: ${first.message}`.slice(0, 140) : "clean" });
      const status = stepsPassed && evidence.every((e) => e.ok) ? "passed" : "failed";
      return {
        status,
        steps: steps.map(({ id, label, action, status: s, detail }) => ({ id, label, action, status: s, detail })),
        evidence,
        errors: observed.errors.map((e) => ({ type: e.type, message: e.message })).slice(0, 5),
        network: observed.network.map((n) => ({ method: n.method, path: n.path, status: n.status, duration_ms: n.duration_ms })).slice(0, 20),
        duration_ms: Date.now() - started,
      };
    } finally {
      unsub();
    }
  }
}
