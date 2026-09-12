export function Field({ label, id, testid, hint, ...props }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="block text-xs font-medium text-ink2 mb-1.5">{label}</span>
      <input id={id} data-testid={testid} className="field" {...props} />
      {hint && <span className="block mt-1 text-[11px] text-mute font-mono">{hint}</span>}
    </label>
  );
}

export function PageHeader({ eyebrow, title, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 mb-10 reveal">
      <div>
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-ink tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function StatusPill({ status }) {
  const tone =
    status === "delivered" ? "border-forest/30 text-forest bg-forest/5" : status === "shipped" ? "border-brass/40 text-brass bg-brass/5" : "border-ink/20 text-ink2";
  return <span className={`status-pill ${tone}`} data-testid={`status-${status}`}>{status}</span>;
}
