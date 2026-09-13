import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge, ErrorNote } from "../components/ui";

type Status = {
  database: string;
  model: { name: string; configured: boolean };
  projects: {
    id: string;
    name: string;
    mode: string;
    backend: string;
    repo: string | null;
    messages: number;
    items: number;
  }[];
  findings: number;
};

export function Dashboard() {
  const navigate = useNavigate();
  const { data, error } = usePolling<Status>(() => api("/status"));

  const generatePlan = async (projectId: string) => {
    const objective = window.prompt("What should ShadowQA plan? Leave empty to plan from confirmed context.") ?? "";
    const plan = await api(`/projects/${projectId}/plan`, "POST", { objective: objective || undefined });
    navigate(`/plans/${plan.id}`);
  };

  return (
    <Layout>
      <div className="stack">
        <div>
          <h2>ShadowQA is watching.</h2>
          <p className="subtitle">
            {data ? `${data.database} · model ${data.model.name}${data.model.configured ? "" : " (no key configured)"}` : "Connecting…"}
          </p>
        </div>
        <ErrorNote error={error} />
        {data?.projects.map((p) => (
          <div className="card stack" key={p.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{p.name}</strong>
              <Badge>{p.mode}</Badge>
            </div>
            <div className="subtitle">
              {p.repo ?? "No repository folder set"} · {p.messages} context messages · {p.backend}
            </div>
            <div className="row">
              <button className="primary" onClick={() => generatePlan(p.id)}>
                Generate plan
              </button>
              <button className="secondary" onClick={() => navigate("/findings")}>
                {data.findings} open finding{data.findings === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        ))}
        {data && data.projects.length === 0 && (
          <div className="card">
            <p>No project yet.</p>
            <button className="primary" onClick={() => navigate("/solo/project")}>
              Add a project
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
