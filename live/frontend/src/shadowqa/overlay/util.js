export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;

export const ms = (v) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);

export const shortPath = (p) => String(p || "").replace(/^frontend\/src\//, "").replace(/^backend\//, "");

export function statusIcon(status) {
  if (status === "passed" || status === "ok" || status === true) return '<span class="ic ic-ok">✓</span>';
  if (status === "failed" || status === false) return '<span class="ic ic-bad">✗</span>';
  if (status === "running") return '<span class="ic ic-run"></span>';
  if (status === "skipped") return '<span class="ic ic-skip">–</span>';
  return '<span class="ic ic-pending">○</span>';
}

export function renderDiff(diff) {
  const lines = String(diff || "").split("\n");
  return lines
    .filter((l) => !/^(---|\+\+\+) /.test(l))
    .map((l) => {
      if (l.startsWith("@@")) return `<span class="d-hunk">${escapeHtml(l)}</span>`;
      if (l.startsWith("+")) return `<span class="d-add">${escapeHtml(l)}</span>`;
      if (l.startsWith("-")) return `<span class="d-del">${escapeHtml(l)}</span>`;
      return `<span class="d-ctx">${escapeHtml(l)}</span>`;
    })
    .join("");
}

export function riskBadge(level) {
  const l = (level || "—").toUpperCase();
  return `<span class="badge badge-${l.toLowerCase()}" data-testid="sqa-risk-badge">Risk ${escapeHtml(l)}</span>`;
}

export function checklist(items, testid) {
  return `<ul class="check" data-testid="${testid}">${items
    .map((i) => `<li class="check-item ${i.status || (i.ok ? "passed" : "failed")}">${statusIcon(i.status ?? i.ok)}<span class="check-label">${escapeHtml(i.label || i.name)}</span>${i.detail || i.summary ? `<span class="check-detail">${escapeHtml(i.detail || i.summary)}</span>` : ""}</li>`)
    .join("")}</ul>`;
}
