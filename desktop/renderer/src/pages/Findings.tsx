import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge } from "../components/ui";

export function Findings() {
  const navigate = useNavigate();
  const { data, error } = usePolling<any[]>(() => api("/findings"));

  const repair = async (id: string) => {
    const result = await api(`/findings/${id}/repair`, "POST", {});
    if (result.plan) navigate(`/plans/${result.plan.id}`);
  };

  return (
    <Layout>
      <table>
        <thead>
          <tr>
            <th>Rule</th>
            <th>Class</th>
            <th>State</th>
            <th>Seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((f) => (
            <tr key={f.id}>
              <td>{f.rule}</td>
              <td>{f.classification}</td>
              <td>
                <Badge tone={f.state === "open" ? "bad" : "good"}>{f.state}</Badge>
              </td>
              <td>{f.occurrences}</td>
              <td>
                {f.state === "open" && (
                  <button className="link" onClick={() => repair(f.id)}>
                    Repair
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">No findings — checks are clean.</p>}
      {error ? <p className="subtitle">{String(error)}</p> : null}
    </Layout>
  );
}
