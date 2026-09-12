import { Badge, Button, Empty, Panel, STATUS_TONE, clock, ms, pct, shortPath } from "./ui";

const openInspector = async (bridge, id, tab = "timeline") => {
  const sdk = window.__shadowqa;
  const inc = await bridge.getIncident(id).catch(() => null);
  if (!sdk || !inc) return;
  sdk.overlay.set({ incident: inc, inspector: true, tab });
  sdk.loadInspectorData(tab);
};

export function IncidentTable({ incidents, bridge }) {
  const rows = incidents || [];
  return (
    <Panel eyebrow="History" title={`Incidents · ${rows.length}`} testid="cc-incidents" action={<span className="text-[11px] text-[#6f6c66]">click a row → inspector</span>}>
      {rows.length === 0 ? (
        <Empty>No incidents yet. Break something in the store — ShadowQA is watching.</Empty>
      ) : (
        <div className="overflow-x-auto -mx-2 max-w-[calc(100%+1rem)]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#6f6c66]">
                <th className="px-2 py-1.5 font-semibold">Time</th><th className="px-2 py-1.5 font-semibold">Incident</th><th className="px-2 py-1.5 font-semibold">Cause</th>
                <th className="px-2 py-1.5 font-semibold">Risk</th><th className="px-2 py-1.5 font-semibold hidden md:table-cell">Conf.</th><th className="px-2 py-1.5 font-semibold hidden md:table-cell">End-to-end</th><th className="px-2 py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#f4f1ea]/[0.05] hover:bg-[#f4f1ea]/[0.03] cursor-pointer transition-colors" onClick={() => openInspector(bridge, r.id)} data-testid={`cc-incident-${r.id}`}>
                  <td className="px-2 py-2 font-sans text-[#a9a59d] whitespace-nowrap">{clock(r.created_at)}</td>
                  <td className="px-2 py-2 text-[#f4f1ea]">{r.title}{r.source === "qa" && <Badge tone="ml-2 text-[#a9a59d] border-[#a9a59d]/40">qa</Badge>}</td>
                  <td className="px-2 py-2 font-sans text-[#f4f1ea] whitespace-nowrap">{shortPath(r.diagnosis?.cause_location || r.source_location?.file || "—")}</td>
                  <td className="px-2 py-2">{r.risk?.level ? <Badge tone={r.risk.level === "LOW" ? "text-[#3dd68c] border-[#3dd68c]/40" : r.risk.level === "MEDIUM" ? "text-[#a9a59d] border-[#a9a59d]/40" : "text-[#e5484d] border-[#e5484d]/40"}>{r.risk.level}</Badge> : "—"}</td>
                  <td className="px-2 py-2 font-sans text-[#a9a59d] hidden md:table-cell">{pct(r.diagnosis?.confidence)}</td>
                  <td className="px-2 py-2 font-sans text-[#a9a59d] hidden md:table-cell">{ms(r.telemetry?.total_ms)}</td>
                  <td className="px-2 py-2"><Badge tone={STATUS_TONE[r.status] || "text-[#a9a59d] border-[#f4f1ea]/10"} testid={`cc-status-${r.id}`}>{r.status.replace(/_/g, " ")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function ScenarioPanel({ scenarios, onReset, resetting }) {
  const list = scenarios || [];
  return (
    <Panel eyebrow="Demo" title="Intentional bugs in Lumen Supply Co." testid="cc-scenarios" action={<Button onClick={onReset} disabled={resetting} testid="cc-reset-demo-btn">{resetting ? "Resetting…" : "Reset demo bugs"}</Button>}>
      <div className="grid gap-2">
        {list.map((s) => (
          <div key={s.id} className="rounded-md border border-[#f4f1ea]/[0.08] bg-[#232323] px-4 py-3 grid sm:grid-cols-[1fr_auto] gap-2 items-start" data-testid={`cc-scenario-${s.id}`}>
            <div>
              <div className="text-[13px] text-[#f4f1ea] font-medium">{s.title}</div>
              <div className="text-[11.5px] text-[#a9a59d] mt-0.5">{s.symptom}</div>
              <div className="text-[11px] text-[#6f6c66] mt-0.5 font-sans">{shortPath(s.file)} · {s.cause}</div>
            </div>
            <Badge tone={s.bug_present ? "text-[#a9a59d] border-[#a9a59d]/40" : "text-[#3dd68c] border-[#3dd68c]/40"} testid={`cc-scenario-state-${s.id}`}>{s.bug_present ? "bug present" : "fixed"}</Badge>
          </div>
        ))}
        {list.length === 0 && <Empty>Scenario state unavailable.</Empty>}
      </div>
      <p className="text-[11px] text-[#6f6c66] mt-3">ShadowQA knows nothing about these bugs — every diagnosis is produced from live browser context + workspace source.</p>
    </Panel>
  );
}
