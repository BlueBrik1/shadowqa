import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge } from "../components/ui";

export function Jobs() {
  const navigate = useNavigate();
  const { data } = usePolling<any[]>(() => api("/tasks"));
  return (
    <Layout>
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Project</th>
            <th>State</th>
            <th>Backend</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((t) => (
            <tr key={t.id}>
              <td>{t.id.slice(0, 8)}</td>
              <td>{t.projectId}</td>
              <td>
                <Badge tone={t.state === "ready" ? "good" : t.state === "failed" ? "bad" : undefined}>{t.state}</Badge>
              </td>
              <td>{t.backend}</td>
              <td>
                <button className="link" onClick={() => navigate(`/jobs/${t.id}`)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">No jobs yet — approve a plan to launch an agent.</p>}
    </Layout>
  );
}
