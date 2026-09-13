import { useNavigate } from "react-router-dom";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Badge } from "../../components/ui";

export function TeamPlans() {
  const navigate = useNavigate();
  const { data } = usePolling<any[]>(() => teamApi("/plans"));
  return (
    <TeamLayout>
      <table>
        <thead>
          <tr>
            <th>Objective</th>
            <th>Status</th>
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
              <td>
                <button className="link" onClick={() => navigate(`/team/plans/${plan.id}`)}>
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">No plans yet — generate one from the Watching tab.</p>}
    </TeamLayout>
  );
}
