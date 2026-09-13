import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge, ErrorNote, Field } from "../components/ui";

function Companion() {
  const [status, setStatus] = useState<{ installed: boolean; extensionId?: string }>();
  const [extensionId, setExtensionId] = useState("");
  const [error, setError] = useState<unknown>();

  const refresh = () => window.shadowqa.companion.status().then(setStatus);
  useEffect(() => void refresh(), []);

  const install = async () => {
    setError(undefined);
    try {
      await window.shadowqa.companion.install(extensionId.trim());
      await refresh();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="card stack">
      <h3>Browser extension companion</h3>
      <p className="subtitle">
        Load <code>individual/extension/dist</code> unpacked at chrome://extensions, copy its ID, and
        register it here — this is a one-time native messaging registration, not a `.env` edit.
      </p>
      <ErrorNote error={error} />
      {status?.installed ? (
        <Badge tone="good">Registered for {status.extensionId}</Badge>
      ) : (
        <Field label="Extension ID">
          <div className="row">
            <input value={extensionId} onChange={(e) => setExtensionId(e.target.value)} placeholder="32-character id" />
            <button className="secondary" onClick={install}>
              Register
            </button>
          </div>
        </Field>
      )}
    </div>
  );
}

function Conversations() {
  const { data, error } = usePolling<any[]>(() => api("/conversations"));
  const pause = (id: string, paused: boolean) => api(`/conversations/${encodeURIComponent(id)}/pause`, "POST", { paused });
  const forget = (id: string) => {
    if (window.confirm("Delete this conversation and every item extracted from it?"))
      void api(`/conversations/${encodeURIComponent(id)}`, "DELETE");
  };
  return (
    <div className="card stack">
      <h3>Tracked conversations</h3>
      <ErrorNote error={error} />
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Origin</th>
            <th>Coverage</th>
            <th>Messages</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((c) => (
            <tr key={c.id}>
              <td>{c.title || c.id}</td>
              <td>{c.origin}</td>
              <td>
                <Badge tone={c.coverage === "full" ? "good" : undefined}>{c.coverage}</Badge>
              </td>
              <td>{c.messageCount}</td>
              <td>
                <button className="link" onClick={() => pause(c.id, !c.paused)}>
                  {c.paused ? "Resume" : "Pause"}
                </button>{" "}
                <button className="link" onClick={() => forget(c.id)}>
                  Forget
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="subtitle">Track a conversation from the browser side panel to see it here.</p>}
    </div>
  );
}

function Items({ projectId }: { projectId: string }) {
  const { data, error } = usePolling<any[]>(() => api(`/projects/${projectId}/items`));
  const decide = (id: string, status: string) => api(`/items/${id}`, "PATCH", { status });
  return (
    <div className="card stack">
      <h3>Extracted context</h3>
      <ErrorNote error={error} />
      {data?.map((item) => (
        <div className="row" key={item.id} style={{ justifyContent: "space-between" }}>
          <div>
            <Badge>{item.kind}</Badge> {item.text}
          </div>
          <div className="row">
            {item.status === "proposed" && (
              <>
                <button className="link" onClick={() => decide(item.id, "confirmed")}>
                  Confirm
                </button>
                <button className="link" onClick={() => decide(item.id, "rejected")}>
                  Reject
                </button>
              </>
            )}
            {item.status !== "proposed" && <Badge tone={item.status === "confirmed" ? "good" : "bad"}>{item.status}</Badge>}
          </div>
        </div>
      ))}
      {data?.length === 0 && <p className="subtitle">Nothing extracted yet.</p>}
    </div>
  );
}

function Pairing() {
  const [pairing, setPairing] = useState<{ code: string; expiresInMinutes: number }>();
  const start = async () => setPairing(await api("/pair/start", "POST", {}));
  return (
    <div className="card stack">
      <h3>Pair the browser side panel</h3>
      <p className="subtitle">Load the unpacked extension, then type this code into its panel.</p>
      {pairing ? (
        <div className="mark">{pairing.code}</div>
      ) : (
        <button className="primary" onClick={start}>
          Generate pairing code
        </button>
      )}
      {pairing && <p className="subtitle">Expires in {pairing.expiresInMinutes} minutes.</p>}
    </div>
  );
}

function CodingSessions({ projectId }: { projectId: string }) {
  const { data } = usePolling<any>(() => api("/observers/sessions"), 8000);
  const subscribe = (origin: string, session: any) =>
    api("/observers/subscribe", "POST", { projectId, origin, sessionId: session.sessionId, file: session.file });
  return (
    <div className="card stack">
      <h3>Local coding sessions</h3>
      <p className="subtitle">Subscribe to a Claude Code or Codex session on this machine to capture it as context.</p>
      {["claude-code", "codex"].map((origin) => (
        <div key={origin} className="stack">
          <strong>{origin}</strong>
          {(data?.[origin] ?? []).map((s: any) => (
            <div className="row" key={s.sessionId}>
              <span className="subtitle">{s.sessionId.slice(0, 8)} · {s.modifiedAt}</span>
              <button className="link" onClick={() => subscribe(origin, s)}>
                Subscribe
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function WatchToggle({ projectId }: { projectId: string }) {
  const { data } = usePolling<any[]>(() => api("/watchers"), 5000);
  const watching = data?.some((w) => w.projectId === projectId);
  const toggle = () => api(`/projects/${projectId}/watch`, "POST", { enabled: !watching });
  return (
    <div className="card row" style={{ justifyContent: "space-between" }}>
      <div>
        <h3>Saved-file watching</h3>
        <p className="subtitle">Debounced checks on every save, independent of a plan.</p>
      </div>
      <button className="secondary" onClick={toggle}>
        {watching ? "Stop watching" : "Watch this project"}
      </button>
    </div>
  );
}

export function SoloContext() {
  const { data: status } = usePolling<any>(() => api("/status"), 6000);
  const projectId = status?.projects?.[0]?.id;
  return (
    <Layout>
      <div className="stack">
        <Conversations />
        {projectId && <Items projectId={projectId} />}
        {projectId && <CodingSessions projectId={projectId} />}
        {projectId && <WatchToggle projectId={projectId} />}
        <Companion />
        <Pairing />
      </div>
    </Layout>
  );
}
