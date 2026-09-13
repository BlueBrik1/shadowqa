import { useNavigate } from "react-router-dom";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Badge } from "../../components/ui";

export function TeamJobs() {
  const navigate = useNavigate();
  const { data } = usePolling<any[]>(() => teamApi("/jobs"));
  return (
    <TeamLayout>
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Project</th>
            <th>Kind</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((j) => (
            <tr key={j.id}>
              <td>{j.id.slice(0, 8)}</td>
              <td>{j.project_id}</td>
              <td>{j.kind}</td>
              <td>
                <Badge tone={j.state === "resolved" ? "good" : j.state === "failed" ? "bad" : undefined}>{j.state}</Badge>
              </td>
              <td>
                <button className="link" onClick={() => navigate(`/team/jobs/${j.id}`)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">No jobs yet — approve a plan to launch an agent.</p>}
    </TeamLayout>
  );
}
