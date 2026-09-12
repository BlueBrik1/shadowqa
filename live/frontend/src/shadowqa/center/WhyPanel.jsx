import { Panel, ms, pct, shortPath } from "./ui";

const THEM = [
  ["Trigger", "You notice a bug and describe it"],
  ["Context", "Whatever you paste into the prompt"],
  ["Action", "The agent edits the codebase"],
  ["Verification", "You reload and click around, by hand"],
];

function Step({ n, label, live, ok, testid }) {
  return (
    <li className="grid grid-cols-[22px_1fr] gap-3" data-testid={testid}>
      <span className={`h-[22px] w-[22px] rounded-full grid place-items-center font-sans text-[10.5px] ${ok ? "bg-[#3dd68c]/15 text-[#3dd68c] border border-[#3dd68c]/40" : "bg-[#232323] text-[#a9a59d] border border-[#f4f1ea]/10"}`}>{n}</span>
      <div>
        <div className="text-[12.5px] text-[#f4f1ea] font-medium leading-snug">{label}</div>
        {live && <div className="mt-0.5 text-[11.5px] text-[#a9a59d] font-sans leading-relaxed break-words">{live}</div>}
      </div>
    </li>
  );
}

export function WhyPanel({ incidents }) {
  const inc = (incidents || []).find((i) => ["verified", "committed"].includes(i.status)) || (incidents || [])[0];
  const ok = inc && ["verified", "committed"].includes(inc.status);
  const d = inc?.diagnosis || {};
  const trig = inc?.trigger?.target?.text ? `${inc.trigger.kind || "click"} '${inc.trigger.target.text}'` : null;
  const rel = inc?.related_request ? `${inc.related_request.method} ${inc.related_request.path} → ${inc.related_request.status ? `HTTP ${inc.related_request.status}` : "no response"}` : null;
  const fail = inc?.failure ? `${inc.failure.type}: ${String(inc.failure.message).slice(0, 70)}` : null;
  const files = (inc?.patch?.files || []).map((f) => `${shortPath(f.path)} +${f.added} −${f.removed}`).join(", ");
  const checks = (inc?.validation?.steps || []).filter((s) => s.status === "passed").length;
  const evidence = (inc?.replay?.evidence || []).filter((e) => e.ok).map((e) => e.label).join(" · ");
  const live = inc
    ? {
        observe: [trig, rel, fail].filter(Boolean).join(" → "),
        understand: [inc.source_location ? `symptom ${shortPath(inc.source_location.file)}:${inc.source_location.line}` : null, d.cause_location ? `cause ${shortPath(d.cause_location)}` : null, d.confidence ? `${pct(d.confidence)} confidence` : null, `${(inc.context_signals || []).length} in-app signals`].filter(Boolean).join(" · "),
        act: files ? `${files} · checkpoint · ${checks} validation checks · risk ${inc.risk?.level || "—"}` : "no patch yet",
        verify: evidence ? `${evidence}${inc.telemetry?.total_ms ? ` · ${ms(inc.telemetry.total_ms)} end-to-end` : ""}` : inc.status.replace(/_/g, " "),
      }
    : {};
  return (
    <Panel eyebrow="Why not Claude Code, Cursor or Copilot?" title="Not a better code writer — a different starting point." testid="cc-why">
      <p className="text-[12.5px] text-[#a9a59d] leading-relaxed max-w-3xl mb-5">
        ShadowQA doesn't compete on who writes code better. Its difference is <span className="text-[#f4f1ea]">where the context comes from</span> and <span className="text-[#f4f1ea]">when it acts</span>: it starts from something the application experienced, not from a task you typed.
      </p>
      <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
        <div className="rounded-md border border-[#f4f1ea]/[0.08] bg-[#232323]/60 p-4" data-testid="cc-why-them">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#6f6c66] font-sans mb-3">Prompt-driven coding agents</div>
          <div className="text-[12px] text-[#a9a59d] mb-3 font-sans">developer tells AI about a task → AI works on the codebase</div>
          <ul className="grid gap-2">
            {THEM.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[86px_1fr] gap-2 text-[12px]"><span className="text-[#6f6c66]">{k}</span><span className="text-[#a9a59d]">{v}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-[#f4f1ea]/30 bg-[#f4f1ea]/[0.05] p-4" data-testid="cc-why-us">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#f4f1ea] font-sans mb-3">ShadowQA{inc ? ` · live from incident ${inc.id}` : ""}</div>
          <div className="text-[12px] text-[#a9a59d] mb-3 font-sans">application experiences something → observes → understands → acts → verifies</div>
          <ol className="grid gap-3">
            <Step n="1" label="The application experiences a failure — ShadowQA observes it in the browser" live={live.observe} ok={ok} testid="cc-why-observe" />
            <Step n="2" label="Understands the context: gesture, request, exception, source map, memory" live={live.understand} ok={ok} testid="cc-why-understand" />
            <Step n="3" label="Acts on the codebase: minimal patch, checkpoint, validation" live={live.act} ok={ok} testid="cc-why-act" />
            <Step n="4" label="Verifies the result by replaying the exact failure" live={live.verify} ok={ok} testid="cc-why-verify" />
          </ol>
          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] font-sans">
            <div className="rounded border border-[#f4f1ea]/[0.08] px-2 py-1.5"><span className="text-[#6f6c66]">Trigger</span><br /><span className="text-[#f4f1ea]">the failure</span></div>
            <div className="rounded border border-[#f4f1ea]/[0.08] px-2 py-1.5"><span className="text-[#6f6c66]">Context</span><br /><span className="text-[#f4f1ea]">the running app</span></div>
            <div className="rounded border border-[#f4f1ea]/[0.08] px-2 py-1.5"><span className="text-[#6f6c66]">Verification</span><br /><span className="text-[#f4f1ea]">the replay</span></div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
