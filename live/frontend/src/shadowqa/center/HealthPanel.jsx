import { Badge, Button, Empty, Panel, clock, ms, shortPath } from "./ui";

export function HealthPanel({ qaRun, flows, onRunQA }) {
  const run = qaRun?.flows ? qaRun : null;
  const all = flows || [];
  return (
    <Panel eyebrow="Autonomous QA" title="Application health" testid="cc-health" action={<Button primary onClick={onRunQA} testid="cc-run-qa-btn">Run QA sweep</Button>}>
      <p className="text-[11.5px] text-[#a9a59d] mb-3">{all.length} flows · {all.filter((f) => f.source === "declared").length} declared · {all.filter((f) => f.source === "learned").length} learned from verified fixes. The sweep drives this very browser tab through every flow and files incidents for failures.</p>
      {run ? (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className={`font-sans text-2xl font-semibold ${run.failed ? "text-[#e5484d]" : "text-[#3dd68c]"}`} data-testid="cc-health-score">{run.passed}/{run.flows.length}</span>
            <span className="text-[11.5px] text-[#6f6c66]">flows healthy · {clock(run.at)} · {ms(run.duration_ms)}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2" data-testid="cc-health-grid">
            {run.flows.map((f) => (
              <div key={f.name} className={`rounded-md border px-3 py-2 bg-[#232323] ${f.status === "passed" ? "border-[#3dd68c]/35" : "border-[#e5484d]/45"}`}>
                <div className="flex items-center gap-2 text-[12.5px] text-[#f4f1ea]"><span className={f.status === "passed" ? "text-[#3dd68c]" : "text-[#e5484d]"}>{f.status === "passed" ? "✓" : "✗"}</span>{f.name}</div>
                <div className="text-[11px] text-[#6f6c66] mt-0.5 truncate">{f.error || `${(f.steps || []).length} steps · ${ms(f.duration_ms)}`}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Empty>No sweep recorded yet.</Empty>
      )}
    </Panel>
  );
}

export function MemoryPanel({ memory }) {
  if (!memory) return <Panel eyebrow="Memory" title="Application memory" testid="cc-memory"><Empty>Loading…</Empty></Panel>;
  const known = Object.values(memory.known_failures || {});
  const apis = Object.values(memory.apis || {}).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);
  const routes = Object.values(memory.routes || {}).filter((r) => !String(r.path).startsWith("flow:")).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);
  const counts = [["routes", memory.routes], ["apis", memory.apis], ["components", memory.components]].map(([k, v]) => [k, Object.keys(v || {}).length]);
  const Head = ({ children }) => <div className="text-[10px] uppercase tracking-[0.12em] text-[#6f6c66] font-sans mb-1.5 mt-4 first:mt-0">{children}</div>;
  return (
    <Panel eyebrow="Memory" title="What ShadowQA has learned about this app" testid="cc-memory">
      <div className="flex flex-wrap gap-2 mb-4">
        {counts.map(([k, n]) => <Badge key={k} tone="text-[#a9a59d] border-[#f4f1ea]/10">{n} {k}</Badge>)}
        <Badge tone="text-[#a9a59d] border-[#f4f1ea]/10">{known.length} known failures</Badge>
        <Badge tone="text-[#a9a59d] border-[#f4f1ea]/10">{(memory.fixes || []).length} fixes</Badge>
      </div>
      <Head>Known failures</Head>
      <div className="grid gap-1.5" data-testid="cc-known-failures">
        {known.slice(0, 6).map((k) => (
          <div key={`${k.title}${k.file}${k.line}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[12px] border-t border-[#f4f1ea]/[0.05] pt-1.5">
            <span className="text-[#f4f1ea] truncate">{k.title}</span>
            <span className="font-sans text-[#6f6c66] whitespace-nowrap">{shortPath(k.file)}:{k.line}</span>
            <span className={`font-sans text-[11px] ${k.status === "fixed" ? "text-[#3dd68c]" : k.status === "regressed" ? "text-[#e5484d]" : "text-[#a9a59d]"}`}>{k.status} ×{k.count}</span>
          </div>
        ))}
        {known.length === 0 && <Empty>No failures observed yet.</Empty>}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6">
        <div>
          <Head>APIs observed</Head>
          <div className="grid gap-1" data-testid="cc-memory-apis">
            {apis.map((a) => (
              <div key={`${a.method}${a.path}`} className="flex items-center justify-between gap-2 text-[11.5px] font-sans border-t border-[#f4f1ea]/[0.05] pt-1">
                <span className="text-[#a9a59d] truncate">{a.method} {a.path}</span>
                <span className="text-[#6f6c66] whitespace-nowrap">{Object.entries(a.statuses || {}).map(([s, c]) => <span key={s} className={Number(s) >= 400 || s === "0" ? "text-[#e5484d] ml-1.5" : "ml-1.5"}>{s}×{c}</span>)}</span>
              </div>
            ))}
            {apis.length === 0 && <Empty>None yet.</Empty>}
          </div>
        </div>
        <div>
          <Head>Routes visited</Head>
          <div className="grid gap-1" data-testid="cc-memory-routes">
            {routes.map((r) => (
              <div key={r.path} className="flex items-center justify-between gap-2 text-[11.5px] font-sans border-t border-[#f4f1ea]/[0.05] pt-1">
                <span className="text-[#a9a59d] truncate">{r.path}</span>
                <span className="text-[#6f6c66] whitespace-nowrap">×{r.count}{r.failures ? <span className="text-[#e5484d] ml-1.5">{r.failures} failed</span> : null}</span>
              </div>
            ))}
            {routes.length === 0 && <Empty>None yet.</Empty>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
