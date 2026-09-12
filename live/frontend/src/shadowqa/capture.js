import { formContext } from "./dom";

const CONTEXT_KINDS = new Set(["click", "input", "submit", "navigation", "console", "error"]);

/** Packages the bounded context window around a failure. Sends redacted values only; raw values stay local. */
export function buildPayload({ failure, buffer, ctx, config, source = "runtime", flowName = null }) {
  const all = buffer.toArray();
  const events = all.filter((e) => CONTEXT_KINDS.has(e.kind) && e.ts <= failure.ts + 100).slice(-40);
  const network = all
    .filter((e) => e.kind === "network" && e.ts <= failure.ts + 1500)
    .slice(-15)
    .map(({ transport, ...rest }) => rest);
  const trigger = [...events].reverse().find((e) => e.kind === "click" || e.kind === "submit");
  const triggerEl = ctx.lastTrigger && document.contains(ctx.lastTrigger) ? ctx.lastTrigger : null;
  let state = null;
  try {
    state = config.getState ? config.getState() : null;
  } catch {
    state = null;
  }
  return {
    app: {
      name: config.appName,
      url: location.href,
      route: location.pathname,
      title: document.title,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      user_agent: navigator.userAgent.slice(0, 120),
    },
    source,
    flow_name: flowName,
    failure,
    events,
    network,
    dom: { trigger: trigger?.target || null, form: triggerEl ? formContext(triggerEl.closest("form")) : null },
    state,
    timing: { detected_at: failure.ts, captured_at: Date.now() },
  };
}

export function pickReplayValues(events, replayValues) {
  const out = {};
  for (const e of events) if (e.kind === "input" && e.id in replayValues) out[e.id] = replayValues[e.id];
  return out;
}
