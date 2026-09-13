import { useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge, ErrorNote } from "../components/ui";

const CANCELLABLE = new Set(["queued", "waiting_for_runner", "preparing", "running", "verifying"]);

export function JobDetail() {
  const { id } = useParams();
  const { data: task, error } = usePolling<any>(() => api(`/tasks/${id}`), 3000);
  const [busy, setBusy] = useState(false);
  const [prResult, setPrResult] = useState<any>();

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/tasks/${id}/cancel`, "POST", {});
    } finally {
      setBusy(false);
    }
  };

  const openPr = async () => {
    setBusy(true);
    try {
      setPrResult(await api(`/tasks/${id}/pull-request`, "POST", {}));
    } finally {
      setBusy(false);
    }
  };

  if (!task) return <Layout><ErrorNote error={error} /></Layout>;

  return (
    <Layout>
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Job {task.id.slice(0, 8)}</h2>
          <Badge tone={task.state === "ready" ? "good" : task.state === "failed" ? "bad" : undefined}>{task.state}</Badge>
        </div>

        {task.result?.attach && (
          <div className="card">
            <h3>Open agent session</h3>
            <p className="subtitle">Paste this into your IDE's integrated terminal to step into the same session:</p>
            <code>{task.result.attach}</code>
          </div>
        )}

        {task.result?.branch && (
          <div className="card">
            <h3>Verified branch</h3>
            <p>
              {task.result.branch} ({String(task.result.commit ?? "").slice(0, 8)})
            </p>
            <button className="secondary" disabled={busy} onClick={openPr}>
              Open pull request
            </button>
            {prResult && (
              <p>
                Opened <a className="primary" href={prResult.url} onClick={(e) => (e.preventDefault(), window.shadowqa.openExternal(prResult.url))}>
                  #{prResult.number}
                </a>
              </p>
            )}
          </div>
        )}

        {task.checks?.length > 0 && (
          <div className="card">
            <h3>Checks</h3>
            <table>
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Exit</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {task.checks.map((c: any) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>
                      <Badge tone={c.exitCode === 0 ? "good" : "bad"}>{c.exitCode}</Badge>
                    </td>
                    <td>{c.durationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {task.diff && (
          <div className="card">
            <h3>Verified diff</h3>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflowX: "auto" }}>{task.diff}</pre>
          </div>
        )}

        <div className="card">
          <h3>Progress</h3>
          <div className="stack" style={{ gap: 4 }}>
            {(task.events ?? []).slice(-25).map((e: any, i: number) => (
              <div key={i} className="subtitle" style={{ fontSize: 12 }}>
                {e.at?.slice(11, 19)} {e.message}
              </div>
            ))}
          </div>
        </div>

        {CANCELLABLE.has(task.state) && (
          <button className="secondary" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    </Layout>
  );
}
