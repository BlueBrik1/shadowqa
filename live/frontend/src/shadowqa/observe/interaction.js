import { newId } from "../buffer";
import { closestInteractive, describe, isSensitiveField, isShadowQANode, maskValue } from "../dom";

/** Clicks, inputs (coalesced), submits and route changes → bounded buffer. Raw input values stay local. */
export function observeInteractions(buffer, ctx) {
  let lastInput = null;

  const rememberValue = (id, value) => {
    ctx.replayValues[id] = value;
    const keys = Object.keys(ctx.replayValues);
    if (keys.length > 300) delete ctx.replayValues[keys[0]];
  };

  const onClick = (e) => {
    const el = closestInteractive(e.target);
    if (!el || isShadowQANode(el)) return;
    const item = { id: newId("e"), ts: Date.now(), kind: "click", route: location.pathname, target: describe(el) };
    ctx.lastInteractionId = item.id;
    ctx.lastTrigger = el;
    ctx.onInteraction?.(item);
    buffer.push(item);
    lastInput = null;
  };

  const onInput = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || isShadowQANode(el)) return;
    const sensitive = isSensitiveField(el);
    const raw = el.type === "checkbox" ? String(el.checked) : el.value;
    const shown = sensitive ? maskValue(raw, el) : String(raw).slice(0, 80);
    if (lastInput && lastInput.el === el && Date.now() - lastInput.item.ts < 2000) {
      lastInput.item.ts = Date.now();
      lastInput.item.value = shown;
      rememberValue(lastInput.item.id, raw);
      return;
    }
    const item = { id: newId("e"), ts: Date.now(), kind: "input", route: location.pathname, target: describe(el), value: shown, redacted: sensitive };
    rememberValue(item.id, raw);
    lastInput = { el, item };
    ctx.lastInteractionId = item.id;
    buffer.push(item);
  };

  const onSubmit = (e) => {
    if (isShadowQANode(e.target)) return;
    const item = { id: newId("e"), ts: Date.now(), kind: "submit", route: location.pathname, target: describe(e.target) };
    ctx.lastInteractionId = item.id;
    buffer.push(item);
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  document.addEventListener("submit", onSubmit, true);

  let current = location.pathname;
  const record = (to) => {
    if (to === current) return;
    buffer.push({ id: newId("e"), ts: Date.now(), kind: "navigation", from: current, to });
    current = to;
    ctx.onRoute?.(to);
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      record(location.pathname);
      return result;
    };
  }
  window.addEventListener("popstate", () => record(location.pathname));
  buffer.push({ id: newId("e"), ts: Date.now(), kind: "navigation", from: null, to: current });
  ctx.onRoute?.(current);
}
