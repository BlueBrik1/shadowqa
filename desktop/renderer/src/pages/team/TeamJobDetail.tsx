import { useState } from "react";
import { useParams } from "react-router-dom";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Badge, ErrorNote } from "../../components/ui";

const CANCELLABLE = new Set(["queued", "leased", "preparing", "running", "verifying"]);

export function TeamJobDetail() {
  const { id } = useParams();
  const { data: job, error } = usePolling<any>(() => teamApi(`/jobs/${id}`), 3000);
  const { data: artifacts } = usePolling<any[]>(() => teamApi(`/jobs/${id}/artifacts`), 5000);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    try {
      await teamApi(`/jobs/${id}/cancel`, "POST", {});
    } finally {
      setBusy(false);
    }
  };

  if (!job) return <TeamLayout><ErrorNote error={error} /></TeamLayout>;

  return (
    <TeamLayout>
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Job {job.id.slice(0, 8)}</h2>
          <Badge tone={job.state === "resolved" ? "good" : job.state === "failed" ? "bad" : undefined}>{job.state}</Badge>
        </div>
        <p className="subtitle">{job.kind} · project {job.project_id} · attempt {job.attempts}</p>

        {artifacts?.map((a: any, i: number) => (
          <div className="card" key={i}>
            <h3>{a.kind}</h3>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflowX: "auto" }}>{a.content}</pre>
          </div>
        ))}

        <div className="card">
          <h3>Progress</h3>
          <div className="stack" style={{ gap: 4 }}>
            {(job.events ?? []).slice(-25).map((e: any, i: number) => (
              <div key={i} className="subtitle" style={{ fontSize: 12 }}>
                {e.created_at?.slice?.(11, 19) ?? ""} {JSON.stringify(e.event)}
              </div>
            ))}
          </div>
        </div>

        {CANCELLABLE.has(job.state) && (
          <button className="secondary" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    </TeamLayout>
  );
}
