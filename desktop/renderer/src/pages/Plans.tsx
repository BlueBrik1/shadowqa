import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge } from "../components/ui";

export function Plans() {
  const navigate = useNavigate();
  const { data } = usePolling<any[]>(() => api("/plans"));
  return (
    <Layout>
      <table>
        <thead>
          <tr>
            <th>Objective</th>
            <th>Status</th>
            <th>Backend</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((plan) => (
            <tr key={plan.id}>
              <td>{plan.objective}</td>
              <td>
                <Badge>{plan.status}</Badge>
              </td>
              <td>{plan.backend}</td>
              <td>
                <button className="link" onClick={() => navigate(`/plans/${plan.id}`)}>
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">No plans yet — generate one from the Watching tab.</p>}
    </Layout>
  );
}
