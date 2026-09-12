/** Semantic DOM descriptors: small, meaningful, replayable. Never whole-page dumps. */
const INTERACTIVE = 'button, a, [role="button"], input, select, textarea, label, summary, [data-testid]';
const SKIP_COMPONENTS = new Set(["Fragment", "Suspense", "Provider", "Consumer", "Outlet", "Routes", "Route", "RenderedRoute", "Router", "BrowserRouter", "Protected", "ErrorBoundary", "Field", "PageHeader", "StatusPill", "Link", "NavLink", "Navigate", "App"]);
const GENERIC_COMPONENT = /(Provider|Context|Boundary)$/;
const SENSITIVE_RE = /(card|cvc|cvv|exp|secret|token|password|passwd|ssn|iban|account)/i;

const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"));

export function isShadowQANode(node) {
  return Boolean(node?.closest?.("shadowqa-root")) || node?.getRootNode?.()?.host?.tagName === "SHADOWQA-ROOT";
}

export function closestInteractive(node) {
  if (!(node instanceof Element)) return null;
  return node.closest(INTERACTIVE) || node;
}

export function textOf(el) {
  const tag = el.tagName;
  const isField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  const isContainer = tag === "FORM" || tag === "DIV" || tag === "SECTION" || tag === "MAIN" || tag === "UL" || tag === "TABLE";
  let raw = el.getAttribute?.("aria-label") || "";
  if (!raw && isField) raw = (el.labels?.[0]?.innerText || "").split("\n")[0] || el.placeholder || el.getAttribute("name") || el.dataset?.testid || "";
  else if (!raw && !isContainer) raw = el.innerText || el.title || "";
  if (!raw && isContainer) raw = el.dataset?.testid || el.id || el.getAttribute("name") || "";
  return String(raw).trim().replace(/\s+/g, " ").slice(0, 60);
}

export function selectorFor(el) {
  if (el.dataset?.testid) return `[data-testid="${cssEscape(el.dataset.testid)}"]`;
  if (el.id) return `#${cssEscape(el.id)}`;
  if (el.name && el.form) return `${el.tagName.toLowerCase()}[name="${cssEscape(el.name)}"]`;
  const parts = [];
  let cur = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 7 && cur !== document.body) {
    if (cur.dataset?.testid) {
      parts.unshift(`[data-testid="${cssEscape(cur.dataset.testid)}"]`);
      break;
    }
    if (cur.id) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break;
    }
    let part = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === cur.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
    depth++;
  }
  return parts.join(" > ");
}

/** Nearest named React component owning the element (dev builds expose the fiber tree). */
export function componentNameOf(el) {
  try {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    let fiber = key ? el[key] : null;
    let hops = 0;
    while (fiber && hops++ < 60) {
      const t = fiber.type;
      const name = typeof t === "function" ? t.displayName || t.name : t && typeof t === "object" ? t.displayName || t.render?.name : null;
      if (name && /^[A-Z]/.test(name) && !SKIP_COMPONENTS.has(name) && !GENERIC_COMPONENT.test(name)) return name;
      fiber = fiber.return;
    }
  } catch {
    /* fiber internals are best-effort */
  }
  return null;
}

export function isSensitiveField(el) {
  if (el.type === "password") return true;
  const hint = `${el.name || ""} ${el.id || ""} ${el.dataset?.testid || ""} ${el.autocomplete || ""}`;
  return SENSITIVE_RE.test(hint);
}

export function maskValue(value, el) {
  const v = String(value ?? "");
  if (el?.type === "password") return "••••••••";
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 8) return `•••• ${digits.slice(-4)}`;
  return v.length ? "••••" : "";
}

export function describe(el) {
  if (!(el instanceof Element)) return null;
  const form = el.closest?.("form");
  return {
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type") || undefined,
    role: el.getAttribute("role") || undefined,
    text: textOf(el) || undefined,
    name: el.getAttribute("name") || undefined,
    testid: el.dataset?.testid || undefined,
    id: el.id || undefined,
    href: el.tagName === "A" ? el.getAttribute("href") : undefined,
    selector: selectorFor(el),
    component: componentNameOf(el) || undefined,
    form: form ? form.dataset?.testid || form.id || form.getAttribute("name") || "form" : undefined,
  };
}

export function formContext(form) {
  if (!form) return null;
  return {
    testid: form.dataset?.testid || undefined,
    id: form.id || undefined,
    fields: [...form.elements]
      .filter((e) => e.name || e.dataset?.testid)
      .slice(0, 30)
      .map((e) => ({ name: e.name || undefined, type: e.type, testid: e.dataset?.testid, filled: e.type === "checkbox" ? e.checked : Boolean(e.value) })),
  };
}
