import { useNavigate } from "react-router-dom";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Badge } from "../../components/ui";

export function TeamFindings() {
  const navigate = useNavigate();
  const { data } = usePolling<any[]>(() => teamApi("/findings"));

  const repair = async (id: string) => {
    const result = await teamApi(`/findings/${id}/repair`, "POST", {});
    if (result?.id) navigate(`/team/plans/${result.id}`);
  };

  const suppress = async (id: string) => {
    const reason = window.prompt("Why suppress this finding?");
    if (!reason) return;
    await teamApi(`/findings/${id}/suppress`, "POST", { reason, hours: 24 * 7 });
  };

  return (
    <TeamLayout>
      <table>
        <thead>
          <tr>
            <th>Rule</th>
            <th>Classification</th>
            <th>State</th>
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
              <td>
                {f.state === "open" && (
                  <>
                    <button className="link" onClick={() => repair(f.id)}>
                      Repair
                    </button>{" "}
                    <button className="link" onClick={() => suppress(f.id)}>
                      Suppress
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">No findings — checks are clean.</p>}
    </TeamLayout>
  );
}
