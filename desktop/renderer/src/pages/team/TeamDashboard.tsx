import { useNavigate } from "react-router-dom";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Badge, ErrorNote } from "../../components/ui";

type Status = {
  projects: { id: string; name: string; mode: string; enabled: boolean }[];
  sources: number;
  jobs: { state: string; count: number }[];
  killed: boolean;
  connections: { provider: string; error?: string; gap?: boolean; lastSuccess?: string }[];
  modelUsage: { calls: number };
};

export function TeamDashboard() {
  const navigate = useNavigate();
  const { data, error } = usePolling<Status>(() => teamApi("/status"));

  const generatePlan = async (projectId: string) => {
    const objective = window.prompt("What should ShadowQA plan? Leave empty to plan from confirmed context.") ?? "";
    const plan = await teamApi(`/projects/${projectId}/compile`, "POST", { objective: objective || undefined });
    navigate(`/team/plans/${plan.id}`);
  };

  return (
    <TeamLayout>
      <div className="stack">
        <h2>ShadowQA is watching.</h2>
        <ErrorNote error={error} />
        {data && (
          <p className="subtitle">
            {data.sources} source documents · {data.modelUsage?.calls ?? 0} Gemini calls today ·{" "}
            {data.killed ? <Badge tone="bad">paused</Badge> : "active"}
          </p>
        )}
        {data?.projects.map((p) => (
          <div className="card stack" key={p.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{p.name}</strong>
              <Badge>{p.mode}</Badge>
            </div>
            <button className="primary" onClick={() => generatePlan(p.id)}>
              Generate plan
            </button>
          </div>
        ))}
        {data && data.projects.length === 0 && (
          <div className="card">
            <p>No project yet — add one from the Admin tab.</p>
          </div>
        )}
        {data && data.connections.length > 0 && (
          <div className="card stack">
            <h3>Connections</h3>
            {data.connections.map((c, i) => (
              <div className="row" key={i}>
                <Badge tone={c.error ? "bad" : "good"}>{c.provider}</Badge>
                <span className="subtitle">{c.error ?? (c.gap ? "gap in history" : c.lastSuccess ?? "ok")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeamLayout>
  );
}
