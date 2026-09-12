import { checklist, escapeHtml as esc, pct, renderDiff, riskBadge, shortPath } from "./util";

const head = (led, phase) => `<div class="card-head"><span class="led ${led}"></span><span class="brand">ShadowQA Live</span><span class="phase">${esc(phase)}</span></div>`;

function contextChain(inc) {
  const nodes = (inc.graph?.nodes || []).filter((n) => ["user_action", "network_request", "network_response", "runtime_error"].includes(n.type));
  if (!nodes.length) return "";
  return `<div class="chain">${nodes
    .map((n, i) => `${i ? '<span class="arrow">→</span>' : ""}<span class="node ${n.type === "runtime_error" || (n.type === "network_response" && (n.meta?.status ?? 0) >= 400) ? "bad" : ""}">${esc(n.label)}</span>`)
    .join("")}</div>`;
}

function locationLine(inc) {
  const loc = inc.source_location;
  if (!loc) return "";
  return `<div class="label">${loc.resolved ? "Source" : "Location (no source map)"}</div><div class="loc mono" data-testid="sqa-source-location">${esc(shortPath(loc.file))}:${esc(loc.line)}</div>`;
}

const footer = (buttons) => `<div class="actions">${buttons}</div>`;
const detailsBtn = `<button class="btn link" data-action="inspector" data-testid="sqa-details-btn">Details</button>`;
const dismissBtn = `<button class="btn" data-action="dismiss" data-testid="sqa-dismiss-btn">Dismiss</button>`;

function summaryBlock(inc) {
  const d = inc.diagnosis || {};
  const r = inc.risk || {};
  if (!d.root_cause) return "";
  const loc = d.cause_location || (inc.source_location ? `${inc.source_location.file}:${inc.source_location.line}` : "");
  return `<div class="loc mono" data-testid="sqa-root-cause-location">${esc(shortPath(loc))}</div>
    <p class="sub" style="margin:4px 0 0" data-testid="sqa-root-cause">${esc(d.root_cause)}</p>
    <div class="meta" style="margin-top:8px"><span class="conf">Confidence <b>${pct(d.confidence)}</b></span>${riskBadge(r.level)}<span class="conf">${r.files || 0} file · ${r.lines || 0} lines</span></div>`;
}

const SIGNAL_CHIP = {
  interaction: () => "your click",
  inputs: (l) => l.match(/^\d+ fields?/)?.[0] || "form fields",
  route: (l) => l.replace(/^Route /, ""),
  component: (l) => l.match(/<[^>]+>/)?.[0] || "component",
  network: (l) => l.match(/HTTP \d+/)?.[0] || "network",
  network_window: (l) => l.match(/^\d+ requests/)?.[0] || "requests",
  source: (l) => (/source-mapped/.test(l) ? "source map" : /handler/.test(l) ? "server handler" : "stack"),
  server: () => "server traceback",
  state: () => "app state",
  console: (l) => l.match(/^\d+ console errors?/)?.[0] || "console",
  workspace: (l) => l.match(/^\d+ workspace files?/)?.[0] || "workspace",
  memory: () => "memory",
};

export function signalsLine(inc) {
  const signals = inc.context_signals || [];
  if (!signals.length) return "";
  const chips = signals.map((s) => `<span class="sig" title="${esc(s.label)}">${esc((SIGNAL_CHIP[s.kind] || (() => s.kind))(s.label))}</span>`).join("");
  return `<div class="signals" data-testid="sqa-context-signals"><span class="sig-count">${signals.length} in-app signals</span>${chips}</div>`;
}

export function renderCapturing(state) {
  return `${head("amber", "detected")}<div class="card-body"><p class="title" data-testid="sqa-card-title">Failure detected</p><p class="sub"><span class="spin"></span>Correlating interaction, network and runtime context…</p></div>`;
}

const STAGES = ["Reading the source-mapped frames", "Retrieving the relevant workspace files", "Reasoning about intent vs. behaviour", "Drafting the smallest safe patch", "Assessing risk and confidence"];

function elapsedLine(inc) {
  const secs = Math.max(0, Math.round((Date.now() - new Date(inc.created_at).getTime()) / 1000));
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(secs / 5))];
  return `<p class="sub" style="margin-top:12px"><span class="spin"></span><span data-volatile="stage">${esc(stage)}</span>… <span class="dim mono" data-testid="sqa-elapsed" data-volatile="elapsed">${secs}s</span></p>`;
}

export function renderAnalyzing(inc) {
  return `${head("amber", "analyzing")}<div class="card-body" data-testid="sqa-analyzing">
    <p class="title" data-testid="sqa-card-title">${esc(inc.title)}</p>
    ${contextChain(inc)}
    ${locationLine(inc)}
    ${signalsLine(inc)}
    ${elapsedLine(inc)}
    ${footer(`${dismissBtn}${detailsBtn}`)}</div>`;
}

export function renderDiagnosed(inc) {
  const d = inc.diagnosis || {};
  const r = inc.risk || {};
  const loc = d.cause_location || (inc.source_location ? `${inc.source_location.file}:${inc.source_location.line}` : "");
  return `${head("", "diagnosed")}<div class="card-body" data-testid="sqa-incident-card">
    <p class="title" data-testid="sqa-card-title">${esc(inc.title)}</p>
    <div class="label">Root cause</div>
    <div class="loc mono" data-testid="sqa-root-cause-location">${esc(shortPath(loc))}</div>
    <p class="sub" style="margin-top:6px" data-testid="sqa-root-cause">${esc(d.root_cause || "")}</p>
    <div class="meta"><span class="conf" data-testid="sqa-confidence">Confidence <b>${pct(d.confidence)}</b></span>${riskBadge(r.level)}<span class="conf">${r.files || 0} file · ${r.lines || 0} lines</span></div>
    ${signalsLine(inc)}
    ${inc.policy?.auto_applied ? `<p class="policy">LOW risk · eligible for autonomous application</p>` : `<p class="policy">${esc(r.level || "")} risk — your approval is required before anything is written.</p>`}
    ${footer(`<button class="btn primary" data-action="view-fix" data-testid="sqa-view-fix-btn">View Fix</button>${dismissBtn}${detailsBtn}`)}</div>`;
}

export function renderFix(inc) {
  const p = inc.patch || {};
  const r = inc.risk || {};
  const d = inc.diagnosis || {};
  return `${head("", "proposed fix")}<div class="card-body" data-testid="sqa-fix-view">
    <p class="title">${esc(inc.title)}</p>
    ${(p.files || []).map((f) => `<div class="file"><b>${esc(shortPath(f.path))}</b> · +${f.added} −${f.removed}</div><div class="diff mono" data-testid="sqa-diff">${renderDiff(f.diff)}</div>`).join("")}
    <p class="sub" data-testid="sqa-fix-reason">${esc(p.reason || d.fix_plan || "")}</p>
    <div class="meta">${riskBadge(r.level)}<span class="conf">Confidence <b>${pct(d.confidence)}</b></span></div>
    <ul class="factors">${(r.factors || []).slice(0, 5).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    ${footer(`<button class="btn primary" data-action="apply" data-testid="sqa-apply-fix-btn">Apply Fix</button><button class="btn" data-action="reject" data-testid="sqa-reject-btn">Reject</button>${detailsBtn}`)}</div>`;
}

export function renderValidating(inc) {
  const steps = inc.validation?.steps || [];
  const phase = inc.status === "applying" ? "applying" : "validating";
  return `${head("amber", phase)}<div class="card-body" data-testid="sqa-validating">
    <p class="title">${esc(inc.title)}</p>
    ${summaryBlock(inc)}
    ${inc.policy?.auto_applied ? `<p class="policy">Applied autonomously (LOW risk) — checkpoint created, you can undo.</p>` : `<p class="sub" style="margin-top:8px">Checkpoint created · patch applied · running validation</p>`}
    <div class="label">Validation</div>
    ${steps.length ? checklist(steps, "sqa-validation-list") : '<p class="sub"><span class="spin"></span>Preparing checks…</p>'}
    ${footer(`<button class="btn danger" data-action="rollback" data-testid="sqa-undo-btn">Undo</button>${detailsBtn}`)}</div>`;
}

export function renderReloading(inc) {
  return `${head("amber", "reloading")}<div class="card-body" data-testid="sqa-reloading">
    <p class="title">${esc(inc.title)}</p>
    ${summaryBlock(inc)}
    <div class="label">Validation</div>
    ${checklist((inc.validation?.steps || []).map((s) => ({ ...s, label: s.name })), "sqa-validation-list")}
    <p class="sub" style="margin-top:10px"><span class="spin"></span>Validation passed · hot reloading application to replay the original failure…</p></div>`;
}

export function renderReplaying(inc, steps) {
  const list = steps && steps.length ? steps : (inc.replay_plan?.steps || []).map((s) => ({ ...s, status: "pending" }));
  return `${head("amber", "replaying")}<div class="card-body" data-testid="sqa-replaying">
    <p class="title">${esc(inc.title)}</p>
    <div class="label">Replaying original failure</div>
    ${checklist(list, "sqa-replay-list")}
    <p class="hint">ShadowQA is driving the application. Evidence is collected live.</p></div>`;
}

function beforeAfter(inc) {
  const before = (inc.graph?.nodes || []).filter((n) => ["user_action", "network_response", "runtime_error"].includes(n.type)).map((n) => n.label);
  const replay = inc.replay || {};
  const okResp = (replay.evidence || []).find((e) => /^Response/.test(e.label));
  const ui = (replay.evidence || []).find((e) => /UI reached/.test(e.label));
  const after = [(inc.trigger ? `${(inc.trigger.kind || "click").replace(/^./, (c) => c.toUpperCase())} '${inc.trigger.target?.text || "element"}'` : "Same gesture"), okResp ? okResp.label : null, ui?.ok ? "expected UI state" : null, "no runtime errors"].filter(Boolean);
  if (!before.length) return "";
  return `<div class="ba" data-testid="sqa-before-after">
    <div class="ba-row bad"><span class="ba-k">Before</span><span class="ba-v">${before.map((l) => `<span class="node bad">${esc(l)}</span>`).join('<span class="arrow">→</span>')}</span></div>
    <div class="ba-row ok"><span class="ba-k">After</span><span class="ba-v">${after.map((l) => `<span class="node">${esc(l)}</span>`).join('<span class="arrow">→</span>')}</span></div>
  </div>`;
}

export function renderVerified(inc) {
  const replay = inc.replay || {};
  const items = [...(replay.steps || []), ...(replay.evidence || [])];
  const git = inc.git;
  const t = inc.telemetry || {};
  return `${head("green", "verified")}<div class="card-body" data-testid="sqa-verified">
    <p class="title">${esc(inc.title)}</p>
    ${summaryBlock(inc)}
    ${signalsLine(inc)}
    ${beforeAfter(inc)}
    <div class="label">Replay of original failure</div>
    ${checklist(items, "sqa-evidence-list")}
    <div class="verdict ok" data-testid="sqa-verdict">✓ FIX VERIFIED <span style="font-weight:400;color:var(--muted);margin-left:auto;font-size:11px">${(inc.validation?.steps || []).filter((s) => s.status === "passed").length} checks · replay ${replay.duration_ms ? `${(replay.duration_ms / 1000).toFixed(1)}s` : ""}${t.total_ms ? ` · ${(t.total_ms / 1000).toFixed(0)}s end-to-end` : ""}</span></div>
    <p class="hint" data-testid="sqa-no-prompt">No prompt was written. ShadowQA started from the failure it observed in this tab — not from a task you described.</p>
    ${git ? `<p class="hint" data-testid="sqa-git-info">Branch <b class="mono">${esc(git.branch)}</b> · ${esc(git.commit)}${git.pr?.url ? ` · <a href="${esc(git.pr.url)}" target="_blank" rel="noreferrer" style="color:var(--cyan)">PR #${esc(git.pr.number)}</a>` : git.pr_error ? ` · ${esc(git.pr_error)}` : ""}</p>` : ""}
    ${footer(`<button class="btn danger" data-action="rollback" data-testid="sqa-undo-btn">Undo</button>${git ? "" : `<button class="btn" data-action="create-pr" data-testid="sqa-create-pr-btn">${inc.pr_enabled ? "Create PR" : "Commit to branch"}</button>`}<button class="btn" data-action="dismiss" data-testid="sqa-done-btn">Done</button><button class="btn link" data-action="inspector" data-tab="patch" data-testid="sqa-details-btn">View Diff</button>`)}</div>`;
}

export function renderCommitted(inc) {
  const git = inc.git || {};
  const d = inc.diagnosis || {};
  const files = (inc.patch?.files || []).map((f) => `${shortPath(f.path)} (+${f.added} −${f.removed})`);
  return `${head("green", git.pr?.url ? "pull request" : "committed")}<div class="card-body" data-testid="sqa-committed">
    <p class="title">${esc(inc.title)}</p>
    <div class="pr">
      <div class="pr-title mono" data-testid="sqa-pr-title">${esc(git.pr_title || `ShadowQA: ${inc.title}`)}</div>
      <div class="kv" style="margin-top:8px"><span class="k">Branch</span><span class="mono">${esc(git.branch || "—")}</span><span class="k">Commit</span><span class="mono">${esc(git.commit || "—")}</span><span class="k">Base</span><span class="mono">${esc(git.base_branch || "—")}</span><span class="k">Files</span><span class="mono">${esc(files.join(", ") || "—")}</span></div>
      ${git.pr?.url ? `<a class="btn primary" style="display:inline-flex;margin-top:10px" href="${esc(git.pr.url)}" target="_blank" rel="noreferrer" data-testid="sqa-pr-link">Open PR #${esc(git.pr.number)} ↗</a>` : `<p class="hint" data-testid="sqa-pr-error">${esc(git.pr_error || "")}</p>`}
    </div>
    <div class="label">PR summary</div>
    <ul class="factors" data-testid="sqa-pr-summary"><li>Root cause: ${esc(d.root_cause || "—")}</li><li>Validation: ${(inc.validation?.steps || []).map((s) => `${esc(s.name)} ${s.status === "passed" ? "✓" : "✗"}`).join(" · ")}</li><li>Replay: ${(inc.replay?.evidence || []).filter((e) => e.ok).length}/${(inc.replay?.evidence || []).length} evidence checks passed</li><li>Confidence ${pct(d.confidence)} · ${esc(d.model || "")}</li></ul>
    ${footer(`<button class="btn danger" data-action="rollback" data-testid="sqa-undo-btn">Undo</button><button class="btn" data-action="dismiss" data-testid="sqa-done-btn">Done</button><button class="btn link" data-action="inspector" data-tab="patch" data-testid="sqa-details-btn">View Diff</button>`)}</div>`;
}

export function renderToast(text) {
  return `${head("green", "shadowqa")}<div class="card-body" data-testid="sqa-toast"><p class="sub" style="margin:0">${esc(text)}</p></div>`;
}

export function renderFailed(inc) {
  const isValidation = inc.status === "validation_failed";
  const steps = isValidation ? inc.validation?.steps || [] : [...(inc.replay?.steps || []), ...(inc.replay?.evidence || [])];
  return `${head("", "rolled back")}<div class="card-body" data-testid="sqa-failed">
    <p class="title">${esc(inc.title)}</p>
    ${checklist(steps, "sqa-failed-list")}
    <div class="verdict bad" data-testid="sqa-verdict">✗ ${isValidation ? "VALIDATION FAILED" : "REPLAY DID NOT CONFIRM RECOVERY"}</div>
    <p class="hint">The proposed change was reverted from the checkpoint. Workspace is back to its previous state.</p>
    ${footer(`<button class="btn" data-action="inspector" data-tab="diagnosis" data-testid="sqa-view-diagnosis-btn">View Diagnosis</button><button class="btn" data-action="retry" data-testid="sqa-retry-btn">Re-diagnose</button>${dismissBtn}`)}</div>`;
}

export function renderUnsafe(inc) {
  const d = inc.diagnosis || {};
  const aiDown = inc.status === "diagnosis_failed";
  return `${head("", aiDown ? "degraded" : "needs review")}<div class="card-body" data-testid="sqa-unsafe">
    <p class="title">${esc(inc.title)}</p>
    ${locationLine(inc)}
    <div class="verdict warn">${aiDown ? "I captured the failure, but the diagnosis engine is unavailable." : "I found the likely failure, but I cannot safely verify a fix."}</div>
    ${d.root_cause ? `<p class="sub" style="margin-top:8px">${esc(d.root_cause)}</p>` : ""}
    ${inc.error ? `<p class="hint mono">${esc(inc.error)}</p>` : ""}
    ${footer(`<button class="btn" data-action="inspector" data-tab="diagnosis" data-testid="sqa-view-diagnosis-btn">View Diagnosis</button><button class="btn" data-action="retry" data-testid="sqa-retry-btn">Retry</button>${dismissBtn}`)}</div>`;
}

export function renderRolledBack(inc) {
  return `${head("", "undone")}<div class="card-body" data-testid="sqa-rolled-back">
    <p class="title">${esc(inc.title)}</p>
    <div class="verdict warn">Change undone — files restored from checkpoint.</div>
    ${footer(`${dismissBtn}${detailsBtn}`)}</div>`;
}

export function renderBridgeError(error) {
  return `${head("", "offline")}<div class="card-body" data-testid="sqa-bridge-error">
    <p class="title">Failure detected, bridge unreachable</p>
    <p class="sub mono">${esc(error)}</p>
    ${footer(`<button class="btn" data-action="dismiss" data-testid="sqa-dismiss-btn">Dismiss</button>`)}</div>`;
}

export function renderQA(progress) {
  const results = progress.results || [];
  const items = results.map((r) => ({ label: r.name, status: r.status, detail: r.error ? String(r.error).slice(0, 60) : `${(r.duration_ms / 1000).toFixed(1)}s` }));
  if (progress.current) items.push({ label: progress.current, status: "running" });
  return `${head("amber", "qa mode")}<div class="card-body" data-testid="sqa-qa-running">
    <p class="title">Exploring application flows</p>
    ${checklist(items, "sqa-qa-list")}
    <p class="hint">${results.length}/${progress.total || "?"} flows · ShadowQA is driving the application.</p></div>`;
}

export function renderQASummary(run) {
  const items = (run.flows || []).map((f) => ({ label: f.name, status: f.status, detail: f.error ? String(f.error).slice(0, 60) : `${((f.duration_ms || 0) / 1000).toFixed(1)}s` }));
  const failed = (run.flows || []).filter((f) => f.status === "failed");
  return `${head(failed.length ? "" : "green", "application health")}<div class="card-body" data-testid="sqa-qa-summary">
    <p class="title">${run.passed}/${(run.flows || []).length} flows healthy</p>
    ${checklist(items, "sqa-health-list")}
    ${failed.length ? `<p class="sub" style="margin-top:10px">Reproducible sequences captured for ${failed.length} failure${failed.length > 1 ? "s" : ""}.</p>` : `<div class="verdict ok">✓ ALL FLOWS HEALTHY</div>`}
    ${footer(`${failed
      .filter((f) => f.incident_id)
      .slice(0, 2)
      .map((f) => `<button class="btn primary" data-action="investigate" data-id="${esc(f.incident_id)}" data-testid="sqa-investigate-${esc(f.incident_id)}">Investigate ${esc(f.name)}</button>`)
      .join("")}<button class="btn" data-action="dismiss" data-testid="sqa-dismiss-btn">Close</button>${detailsBtn}`)}</div>`;
}
