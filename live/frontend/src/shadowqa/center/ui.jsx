export const ms = (v) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
export const pct = (v) => (v == null ? "—" : `${Math.round(Number(v) * 100)}%`);
export const shortPath = (p) => String(p || "").replace(/^frontend\/src\//, "").replace(/^backend\//, "");
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour12: false }) : "—");

/*
 * Charcoal / off-white only. A verified outcome is green, a failure is red, everything in
 * between is drawn in the ink so the eye is only ever pulled to a verdict.
 */
const OK = "text-[#3dd68c] border-[#3dd68c]";
const BAD = "text-[#e5484d] border-[#e5484d]";
const WORKING = "text-[#f4f1ea] border-[#f4f1ea]/40";
export const STATUS_TONE = {
  verified: OK,
  committed: OK,
  diagnosed: WORKING,
  diagnosing: WORKING,
  captured: WORKING,
  validating: WORKING,
  awaiting_replay: WORKING,
  replaying: WORKING,
  validation_failed: BAD,
  replay_failed: BAD,
  diagnosis_failed: BAD,
};

export function Panel({ title, eyebrow, action, children, testid, className = "" }) {
  return (
    <section className={`min-w-0 rounded border border-[#f4f1ea]/[0.12] bg-[#1c1c1c] p-5 ${className}`} data-testid={testid}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          {eyebrow && <div className="text-[10px] uppercase tracking-[0.14em] text-[#6f6c66]">{eyebrow}</div>}
          {title && <h2 className="font-display text-[17px] font-semibold text-[#f4f1ea] tracking-tight mt-0.5">{title}</h2>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, testid, tone = "" }) {
  return (
    <div className="rounded border border-[#f4f1ea]/[0.12] bg-[#232323] px-4 py-3" data-testid={testid}>
      <div className={`text-xl font-semibold tabular-nums ${tone || "text-[#f4f1ea]"}`}>{value ?? "—"}</div>
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-[#6f6c66] mt-1">{label}</div>
      {hint && <div className="text-[11px] text-[#a9a59d] mt-0.5">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "text-[#a9a59d] border-[#f4f1ea]/20", testid }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10.5px] font-semibold uppercase tracking-[0.06em] ${tone}`} data-testid={testid}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, primary, danger, disabled, testid, href, className = "" }) {
  const base = `inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[12px] font-medium transition-[background-color,border-color,transform] duration-150 active:translate-y-px disabled:opacity-40 disabled:cursor-default ${
    primary
      ? "bg-[#f4f1ea] text-[#1c1c1c] border-[#f4f1ea] hover:bg-white"
      : danger
        ? "border-dashed border-[#f4f1ea]/40 text-[#f4f1ea] bg-transparent hover:bg-[#232323]"
        : "border-[#f4f1ea]/[0.24] bg-transparent text-[#f4f1ea] hover:bg-[#232323] hover:border-[#f4f1ea]"
  } ${className}`;
  if (href) return <a href={href} className={base} data-testid={testid}>{children}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={base} data-testid={testid}>{children}</button>;
}

export const Empty = ({ children }) => <p className="font-display text-[13px] italic text-[#6f6c66]">{children}</p>;
