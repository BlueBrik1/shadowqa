import { Link } from "react-router-dom";
import { Button } from "./ui";

const POLICIES = [
  ["approve_all", "Approve all"],
  ["auto_low", "Auto-apply LOW"],
];

export function CenterHeader({ health, settings, onAutonomy, onRunQA, error }) {
  const online = Boolean(health);
  const git = health?.git || {};
  return (
    <header className="sticky top-0 z-40 border-b border-[#f4f1ea]/[0.08] bg-[#1c1c1c]/85 backdrop-blur-md" data-testid="cc-header">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 h-14 flex items-center gap-3 sm:gap-5 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-[#3dd68c]" : "bg-[#e5484d]"}`} data-testid="cc-bridge-led" />
          <span className="font-semibold tracking-tight text-[14px]">ShadowQA</span>
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[#6f6c66] font-sans hidden sm:inline">Command Center</span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-[11.5px] font-sans text-[#a9a59d]">
          <span data-testid="cc-workspace">{health?.workspace || (error ? "bridge offline" : "connecting…")}</span>
          {git.branch && <span className="text-[#6f6c66]">{git.branch} @ {git.head}{git.dirty_files?.length ? ` · ${git.dirty_files.length} dirty` : ""}</span>}
          <span className="text-[#6f6c66] truncate max-w-[260px]" title={settings?.models?.fallback}>{settings?.models?.primary || health?.models?.primary}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:inline-flex rounded-md border border-[#f4f1ea]/[0.14] p-0.5 bg-[#232323]" role="radiogroup" aria-label="Autonomy policy" data-testid="cc-autonomy">
            {POLICIES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={settings?.autonomy === id}
                onClick={() => onAutonomy(id)}
                className={`px-2.5 py-1 rounded text-[11.5px] font-medium transition-[background-color,color] duration-150 ${settings?.autonomy === id ? "bg-[#f4f1ea] text-[#1c1c1c]" : "text-[#a9a59d] hover:text-[#f4f1ea]"}`}
                data-testid={`cc-autonomy-${id}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button primary onClick={onRunQA} testid="cc-header-run-qa-btn">Run QA sweep</Button>
          <Link to="/" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#f4f1ea]/[0.16] bg-[#232323] text-[12px] font-medium text-[#f4f1ea] hover:bg-[#2a2a2a] hover:border-[#f4f1ea]/30 transition-colors" data-testid="cc-back-to-store">Store ↗</Link>
        </div>
      </div>
    </header>
  );
}
