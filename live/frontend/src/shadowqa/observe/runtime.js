import { newId } from "../buffer";

const NOISE = /ResizeObserver loop|^Script error\.?$|Loading chunk|ChunkLoadError|Download the React DevTools/;

/** window.onerror, unhandled rejections and console.error → failures + context entries. */
export function observeRuntime(buffer, ctx, onFailure) {
  const recent = new Map();

  const record = (kind, err, fallbackMessage) => {
    const type = (err && (err.name || err.constructor?.name)) || "Error";
    const message = String((err && err.message) || fallbackMessage || err || "Unknown error");
    if (NOISE.test(message)) return;
    const stack = String((err && err.stack) || "");
    const fp = `${type}|${message.replace(/\d+/g, "#").slice(0, 120)}`;
    const now = Date.now();
    if (recent.has(fp) && now - recent.get(fp) < 1500) return;
    recent.set(fp, now);
    buffer.push({ id: newId("e"), ts: now, kind: "error", type, message: message.slice(0, 300) });
    onFailure({ kind, type, message: message.slice(0, 800), stack: stack.slice(0, 8000), ts: now });
  };

  window.addEventListener(
    "error",
    (e) => {
      if (e.target && e.target !== window) return; // resource load failures are not application failures
      if (e.error) record("runtime_error", e.error, e.message);
      else if (e.message) record("runtime_error", null, e.message);
    },
    true,
  );
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    record("unhandled_rejection", reason instanceof Error ? reason : { name: "UnhandledRejection", message: String(reason), stack: "" });
  });

  const originalError = console.error;
  console.error = function shadowqaConsoleError(...args) {
    try {
      const msg = args
        .map((a) => (typeof a === "string" ? a : a?.message || safeString(a)))
        .join(" ")
        .slice(0, 300);
      if (!/^Warning:|act\(|DevTools|\[shadowqa\]/.test(msg)) buffer.push({ id: newId("e"), ts: Date.now(), kind: "console", level: "error", message: msg });
    } catch {
      /* never break console */
    }
    return originalError.apply(this, args);
  };
}

function safeString(value) {
  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return String(value);
  }
}
