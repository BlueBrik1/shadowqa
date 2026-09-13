import { useState } from "react";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Card, Field, Badge, ErrorNote } from "../../components/ui";

const MODE_HELP: Record<string, string> = {
  observe: "Watch and check only. ShadowQA never edits or publishes.",
  approval: "Ask first. Every plan and every repair waits for you.",
  "auto-fix": "Bounded automatic repair inside configured automatic paths; humans still merge.",
  "full-auto": "Same bounded scope plus policy-gated merging. Requires an explicit merge policy.",
};

function defaultProfile() {
  return {
    id: "node-v1",
    image: "shadowqa-sandbox:1.15.10",
    checks: [
      { id: "test", argv: ["npm", "test"], timeoutSeconds: 600 },
      { id: "typecheck", argv: ["npm", "run", "typecheck"], timeoutSeconds: 600 },
    ],
    install: [],
    allowedPaths: ["src/", "tests/", "docs/"],
    protectedPaths: [".github/", "package.json", "package-lock.json", ".env"],
    autoPaths: ["docs/"],
    requiredChecks: ["test"],
    reviewed: false,
    externalInferenceApproved: false,
  };
}

function AddProject() {
  const [installations, setInstallations] = useState<any[]>();
  const [repos, setRepos] = useState<any[]>();
  const [repo, setRepo] = useState<any>();
  const [folder, setFolder] = useState<string>();
  const [verifiedPath, setVerifiedPath] = useState<string>();
  const [channels, setChannels] = useState<{ id: string; name: string; private: boolean }[]>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [id, setId] = useState("my-project");
  const [mode, setMode] = useState("approval");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);

  const loadInstallations = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.shadowqa.github.installations();
      setInstallations(result.installations);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const loadRepos = async (installationId: number) => {
    setBusy(true);
    try {
      setRepos(await window.shadowqa.github.repositories(installationId));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const pickFolder = async () => {
    const chosen = await window.shadowqa.pickFolder();
    if (chosen) setFolder(chosen);
  };
  const verify = async () => {
    if (!repo || !folder) return;
    setBusy(true);
    setError(undefined);
    try {
      setVerifiedPath(await window.shadowqa.github.verifyClone(folder, repo.owner, repo.name));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const loadChannels = async () => {
    setBusy(true);
    try {
      setChannels(await window.shadowqa.slack.channels());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (channelId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(channelId) ? next.delete(channelId) : next.add(channelId);
      return next;
    });

  const save = async () => {
    if (!repo || !verifiedPath) return;
    setBusy(true);
    setError(undefined);
    try {
      const projectId = id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      await teamApi(`/projects/${projectId}`, "PUT", {
        id: projectId,
        name: id,
        audience: "team",
        repository: {
          id: projectId,
          githubId: repo.githubId,
          owner: repo.owner,
          name: repo.name,
          installationId: repo.installationId,
          defaultBranch: repo.defaultBranch,
          visibility: repo.visibility,
          localPath: verifiedPath,
        },
        channels: (channels ?? []).filter((c) => selected.has(c.id)).map((c) => ({ id: c.id, private: c.private })),
        profile: defaultProfile(),
        policy: { mode, version: 1 },
        enabled: true,
      });
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Add a project</h3>
      <ErrorNote error={error} />
      <Field label="Project ID">
        <input value={id} onChange={(e) => setId(e.target.value)} />
      </Field>

      {!installations && (
        <button className="secondary" disabled={busy} onClick={loadInstallations}>
          Load GitHub installations
        </button>
      )}
      {installations?.map((i) => (
        <button className="link" key={i.id} onClick={() => loadRepos(i.id)}>
          {i.account?.login ?? i.id}
        </button>
      ))}
      {repos?.map((r) => (
        <Card key={r.githubId} selectable selected={repo?.githubId === r.githubId} onClick={() => setRepo(r)}>
          {r.owner}/{r.name}
        </Card>
      ))}
      {repo && (
        <Field label="Local clone folder">
          <div className="row">
            <input readOnly value={folder ?? ""} placeholder="Choose folder" />
            <button className="secondary" onClick={pickFolder}>
              Choose
            </button>
            {folder && (
              <button className="secondary" disabled={busy} onClick={verify}>
                Verify
              </button>
            )}
          </div>
        </Field>
      )}
      {verifiedPath && <Badge tone="good">Verified {verifiedPath}</Badge>}

      {!channels && (
        <button className="secondary" disabled={busy} onClick={loadChannels}>
          Load Slack channels
        </button>
      )}
      {channels?.map((c) => (
        <label key={c.id} className="row">
          <input type="checkbox" style={{ width: "auto" }} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
          #{c.name}
        </label>
      ))}

      <Field label="Automation mode">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {Object.entries(MODE_HELP).map(([key, help]) => (
            <option key={key} value={key}>
              {key} — {help}
            </option>
          ))}
        </select>
      </Field>

      <button className="primary" disabled={busy || !verifiedPath} onClick={save}>
        Save project
      </button>
      {saved && <Badge tone="good">Saved</Badge>}
    </div>
  );
}

function Members() {
  const [id, setId] = useState("");
  const [role, setRole] = useState("developer");
  const [issued, setIssued] = useState<any>();
  const [error, setError] = useState<unknown>();

  const issue = async () => {
    setError(undefined);
    try {
      setIssued(await teamApi("/members", "POST", { id, role, projects: [] }));
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="card stack">
      <h3>Add a member</h3>
      <ErrorNote error={error} />
      <Field label="Member ID">
        <input value={id} onChange={(e) => setId(e.target.value)} />
      </Field>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">admin</option>
          <option value="developer">developer</option>
          <option value="viewer">viewer</option>
        </select>
      </Field>
      <button className="primary" disabled={!id} onClick={issue}>
        Issue token
      </button>
      {issued && (
        <div className="stack">
          <p className="subtitle">Give this token to {issued.id} — it's shown only once:</p>
          <code style={{ wordBreak: "break-all" }}>{issued.token}</code>
        </div>
      )}
      <RevokeMember />
    </div>
  );
}

function RevokeMember() {
  const [id, setId] = useState("");
  const revoke = async () => {
    if (window.confirm(`Revoke ${id} and cancel their active jobs?`)) await teamApi(`/members/${id}/revoke`, "POST", {});
  };
  return (
    <Field label="Revoke a member">
      <div className="row">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Member ID" />
        <button className="secondary" disabled={!id} onClick={revoke}>
          Revoke
        </button>
      </div>
    </Field>
  );
}

function WatchProject({ projectId }: { projectId: string }) {
  const [watching, setWatching] = useState(false);
  const refresh = () => window.shadowqa.team.watchEvents(projectId).then((r) => setWatching(r.watching));
  const toggle = async () => {
    if (watching) await window.shadowqa.team.watchStop(projectId);
    else {
      const folder = await window.shadowqa.pickFolder();
      if (!folder) return;
      await window.shadowqa.team.watchStart(projectId, folder);
    }
    void refresh();
  };
  return (
    <button className="link" onClick={toggle}>
      {watching ? "Stop watching saved files" : "Watch saved files"}
    </button>
  );
}

function Projects() {
  const { data, error } = usePolling<any[]>(() => teamApi("/projects"));
  const sync = (id: string) => teamApi(`/projects/${id}/sync`, "POST", {});
  const setMode = async (id: string, mode: string) => teamApi(`/projects/${id}/mode`, "POST", { mode });
  return (
    <div className="card stack">
      <h3>Projects</h3>
      <ErrorNote error={error} />
      {data?.map((p) => (
        <div className="row" key={p.id} style={{ justifyContent: "space-between" }}>
          <span>
            {p.name} <span className="subtitle">{p.repository?.owner}/{p.repository?.name}</span>
          </span>
          <div className="row">
            <select value={p.policy?.mode} onChange={(e) => setMode(p.id, e.target.value)}>
              {Object.keys(MODE_HELP).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button className="link" onClick={() => sync(p.id)}>
              Sync now
            </button>
            <WatchProject projectId={p.id} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RegisterRunner() {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState("");
  const [issued, setIssued] = useState<any>();
  const [error, setError] = useState<unknown>();

  const register = async () => {
    setError(undefined);
    try {
      setIssued(
        await teamApi("/runners/register", "POST", {
          name,
          projects: projects.split(",").map((p) => p.trim()).filter(Boolean),
        }),
      );
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="card stack">
      <h3>Register a runner</h3>
      <p className="subtitle">
        A runner is a separate machine with Docker that executes approved jobs — run{" "}
        <code>npx tsx scripts/runner-map.ts</code> and <code>npx tsx scripts/runner-start.ts</code> on
        it with this token.
      </p>
      <ErrorNote error={error} />
      <Field label="Runner name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Permitted project IDs (comma-separated)">
        <input value={projects} onChange={(e) => setProjects(e.target.value)} />
      </Field>
      <button className="primary" disabled={!name || !projects} onClick={register}>
        Register
      </button>
      {issued && (
        <div className="stack">
          <p className="subtitle">On the runner machine: <code>SHADOWQA_RUNNER_TOKEN=... npx tsx scripts/runner-start.ts --save-token</code></p>
          <code style={{ wordBreak: "break-all" }}>{issued.token}</code>
        </div>
      )}
    </div>
  );
}

function Diagnostics() {
  const { data: health } = usePolling<any>(() => teamApi("/health"), 15000);
  const { data: queue } = usePolling<any>(() => teamApi("/queue"), 10000);
  const { data: audit } = usePolling<any[]>(() => teamApi("/audit"), 15000);
  const retry = () => teamApi("/queue/retry", "POST", {});
  return (
    <div className="card stack">
      <h3>Diagnostics</h3>
      <div className="row">
        <Badge tone={health?.ok ? "good" : "bad"}>{health?.ok ? "service healthy" : "unreachable"}</Badge>
        <span className="subtitle">{queue?.inbox?.length ?? 0} pending inbound · {queue?.outbox?.length ?? 0} pending outbound</span>
        <button className="link" onClick={retry}>
          Retry failed
        </button>
      </div>
      <details>
        <summary className="subtitle">Recent audit log</summary>
        {audit?.slice(0, 30).map((a: any, i: number) => (
          <div key={i} className="subtitle" style={{ fontSize: 12 }}>
            {a.created_at} — {a.actor_id} — {a.action} {a.target ?? ""}
          </div>
        ))}
      </details>
    </div>
  );
}

function KillSwitch() {
  const { data } = usePolling<{ killed: boolean }>(() => teamApi("/status"), 5000);
  const toggle = async () => teamApi("/control/kill", "POST", { enabled: !data?.killed });
  return (
    <div className="card row" style={{ justifyContent: "space-between" }}>
      <div>
        <h3>Workspace</h3>
        <p className="subtitle">{data?.killed ? "Paused — no new jobs will start." : "Active."}</p>
      </div>
      <button className="secondary" onClick={toggle}>
        {data?.killed ? "Resume" : "Pause"}
      </button>
    </div>
  );
}

export function TeamAdmin() {
  return (
    <TeamLayout>
      <div className="stack">
        <KillSwitch />
        <Projects />
        <AddProject />
        <Members />
        <RegisterRunner />
        <Diagnostics />
      </div>
    </TeamLayout>
  );
}
