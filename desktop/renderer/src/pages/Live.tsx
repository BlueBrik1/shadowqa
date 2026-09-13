import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { Badge, ErrorNote, Card } from "../components/ui";

function StartLive() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await window.shadowqa.live.start();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell stack">
      <div className="mark">◉ ShadowQA Live</div>
      <p className="subtitle">
        Watches your running app on localhost: click → request → console → exception, joined into one
        incident, diagnosed, patched, and replay-verified before anything is called fixed.
      </p>
      <ErrorNote error={error} />
      <button className="primary" disabled={busy} onClick={start}>
        {busy ? "Starting…" : "Start watching this app"}
      </button>
    </div>
  );
}

function Snippet() {
  const [text, setText] = useState("");
  useEffect(() => {
    window.shadowqa.live.snippet().then(setText);
  }, []);
  return (
    <div className="card stack">
      <h3>Add ShadowQA Live to your app</h3>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{text}</pre>
      <button className="secondary" onClick={() => navigator.clipboard.writeText(text)}>
        Copy
      </button>
    </div>
  );
}

export function Live() {
  const navigate = useNavigate();
  const { data: running } = usePolling<boolean>(() => window.shadowqa.live.running(), 3000);
  const { data: incidents, error } = usePolling<any[]>(
    () => (running ? window.shadowqa.live.call("/incidents?limit=50") : Promise.resolve([])),
    4000,
  );

  if (!running) return <StartLive />;

  return (
    <Layout>
      <div className="stack">
        <h2>◉ Live incidents</h2>
        <ErrorNote error={error} />
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Route</th>
              <th>Status</th>
              <th>Risk</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {incidents?.map((i) => (
              <tr key={i.id}>
                <td>{i.title ?? "Runtime failure"}</td>
                <td>{i.app?.route ?? ""}</td>
                <td>
                  <Badge tone={i.status === "verified" ? "good" : i.status?.includes("fail") ? "bad" : undefined}>{i.status}</Badge>
                </td>
                <td>{i.risk?.level ?? ""}</td>
                <td>
                  <button className="link" onClick={() => navigate(`/live/${i.id}`)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {incidents?.length === 0 && <p className="subtitle">No incidents yet. Live is watching.</p>}
        <Snippet />
      </div>
    </Layout>
  );
}

export function LiveIncident() {
  const { id } = useParams();
  const { data: inc, error } = usePolling<any>(() => window.shadowqa.live.call(`/incidents/${id}`), 3000);
  const [busy, setBusy] = useState(false);

  const act = async (kind: "fix" | "rollback" | "git/pr" | "dismiss") => {
    setBusy(true);
    try {
      await window.shadowqa.live.call(`/incidents/${id}/${kind}`, "POST", {});
    } finally {
      setBusy(false);
    }
  };

  if (!inc) return <Layout><ErrorNote error={error} /></Layout>;

  return (
    <Layout>
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{inc.title ?? "Runtime failure"}</h2>
          <Badge tone={inc.status === "verified" ? "good" : undefined}>{inc.status}</Badge>
        </div>

        {inc.diagnosis?.root_cause && (
          <Card>
            <h3>Root cause</h3>
            <p>{inc.diagnosis.root_cause}</p>
          </Card>
        )}
        {inc.patch?.files?.length > 0 && (
          <Card>
            <h3>Patch</h3>
            <p className="subtitle">{inc.patch.files.map((f: any) => f.path).join(", ")}</p>
          </Card>
        )}
        {inc.risk?.level && (
          <Card>
            <h3>Risk</h3>
            <Badge tone={inc.risk.level === "LOW" ? "good" : "bad"}>{inc.risk.level}</Badge>
          </Card>
        )}
        {inc.git?.pr?.url && (
          <Card>
            <h3>Pull request</h3>
            <a className="primary" href={inc.git.pr.url} onClick={(e) => (e.preventDefault(), window.shadowqa.openExternal(inc.git.pr.url))}>
              {inc.git.pr.url}
            </a>
          </Card>
        )}

        <div className="row">
          {inc.status === "diagnosed" && (
            <button className="primary" disabled={busy} onClick={() => act("fix")}>
              Approve — apply, validate, replay
            </button>
          )}
          {inc.status === "verified" && (
            <>
              <button className="primary" disabled={busy} onClick={() => act("git/pr")}>
                Open pull request
              </button>
              <button className="secondary" disabled={busy} onClick={() => act("rollback")}>
                Undo
              </button>
            </>
          )}
          <button className="secondary" disabled={busy} onClick={() => act("dismiss")}>
            Dismiss
          </button>
        </div>
      </div>
    </Layout>
  );
}
