import { newId } from "../buffer";

const SENSITIVE_KEY = /(authorization|cookie|token|secret|passw|api[-_]?key|card|cvc|cvv|^exp$|^number$|ssn)/i;
const IGNORE = [".map", "sockjs-node", "hot-update", "/__", "fonts.g", "unsplash.com"];

function sanitizeBody(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") {
    try {
      return sanitizeObject(JSON.parse(body));
    } catch {
      return { _raw: body.slice(0, 200) };
    }
  }
  if (body instanceof FormData) return { _formdata_keys: [...body.keys()].slice(0, 30) };
  return { _type: body?.constructor?.name || typeof body };
}

function sanitizeObject(value, depth = 0) {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => sanitizeObject(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : sanitizeObject(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.slice(0, 300);
  return value;
}

const pathOf = (url) => {
  try {
    return new URL(url, location.href).pathname;
  } catch {
    return String(url);
  }
};

/** Instruments fetch + XHR: method, url, status, timing, sanitized payloads, response snippet on failure. */
export function observeNetwork(buffer, ctx, { ignorePrefixes = [] } = {}) {
  const ignored = (url) => ignorePrefixes.some((p) => url.startsWith(p)) || IGNORE.some((p) => url.includes(p));

  const finish = (item, status, snippetPromise) => {
    item.end_ts = Date.now();
    item.duration_ms = item.end_ts - item.ts;
    item.status = status;
    item.ok = status >= 200 && status < 400;
    ctx.inflight = Math.max(0, ctx.inflight - 1);
    const done = () => ctx.onNetwork?.(item);
    if (snippetPromise) {
      snippetPromise.then((text) => {
        // Failures keep the full error body; successful JSON keeps a short, redacted shape sample (contract drift is often visible right there).
        item.response_snippet = item.ok ? sanitizeSnippet(text) : String(text || "").slice(0, 1500);
        done();
      }, done);
    } else done();
  };

  const sanitizeSnippet = (text) => {
    try {
      return JSON.stringify(sanitizeObject(JSON.parse(text))).slice(0, 600);
    } catch {
      return String(text || "").slice(0, 200);
    }
  };

  const isJson = (res) => /json/i.test(res.headers.get("content-type") || "");

  const originalFetch = window.fetch;
  window.fetch = function shadowqaFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (ignored(url)) return originalFetch.apply(this, arguments);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const item = { id: newId("n"), ts: Date.now(), kind: "network", transport: "fetch", method, url, path: pathOf(url), initiator_event_id: ctx.lastInteractionId, request_body: sanitizeBody(init?.body) };
    ctx.inflight++;
    buffer.push(item);
    return originalFetch.apply(this, arguments).then(
      (res) => {
        item.content_type = res.headers.get("content-type") || undefined;
        finish(item, res.status, !res.ok || isJson(res) ? res.clone().text() : null);
        return res;
      },
      (err) => {
        item.error = String(err?.message || err);
        finish(item, 0, null);
        throw err;
      },
    );
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function shadowqaOpen(method, url) {
    this.__sqa = { method: String(method).toUpperCase(), url: String(url) };
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function shadowqaSend(body) {
    const meta = this.__sqa;
    if (meta && !ignored(meta.url)) {
      const item = { id: newId("n"), ts: Date.now(), kind: "network", transport: "xhr", method: meta.method, url: meta.url, path: pathOf(meta.url), initiator_event_id: ctx.lastInteractionId, request_body: sanitizeBody(body) };
      ctx.inflight++;
      buffer.push(item);
      this.addEventListener("loadend", () => {
        if (this.status === 0) item.error = "network error";
        finish(item, this.status, this.status >= 400 ? Promise.resolve(this.responseText) : null);
      });
    }
    return send.apply(this, arguments);
  };
}
