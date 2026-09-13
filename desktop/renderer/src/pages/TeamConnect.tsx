import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Field, ErrorNote, Badge } from "../components/ui";

const SLACK_MANIFEST = JSON.stringify(
  {
    display_information: {
      name: "ShadowQA",
      description: "Source-linked development context and verified repair status.",
      background_color: "#1c1c1c",
    },
    features: { bot_user: { display_name: "ShadowQA", always_online: false } },
    oauth_config: { scopes: { bot: ["channels:read", "channels:history", "chat:write", "app_mentions:read"] } },
    settings: {
      event_subscriptions: { bot_events: ["message.channels", "app_mention", "channel_left", "channel_archive"] },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  },
  null,
  2,
);

function GithubCard() {
  const [step, setStep] = useState<"start" | "installations" | "repos" | "done">("start");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [app, setApp] = useState<{ slug: string; htmlUrl: string }>();
  const [installations, setInstallations] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [chosenRepo, setChosenRepo] = useState<any>();
  const [folder, setFolder] = useState<string>();
  const [verifiedPath, setVerifiedPath] = useState<string>();

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.shadowqa.github.connect();
      setApp(result);
      await window.shadowqa.openExternal(result.htmlUrl + "/installations/new");
      setStep("installations");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const loadInstallations = async () => {
    setBusy(true);
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
      setStep("repos");
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
    if (!chosenRepo || !folder) return;
    setBusy(true);
    setError(undefined);
    try {
      setVerifiedPath(await window.shadowqa.github.verifyClone(folder, chosenRepo.owner, chosenRepo.name));
      setStep("done");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>GitHub</h3>
      <p className="subtitle">
        Creates a GitHub App for you via GitHub's own App Manifest flow. GitHub generates the app,
        its private key and webhook secret automatically — nothing to copy.
      </p>
      <ErrorNote error={error} />
      {step === "start" && (
        <button className="primary" disabled={busy} onClick={connect}>
          Connect GitHub
        </button>
      )}
      {step === "installations" && (
        <div className="stack">
          <p className="subtitle">Install {app?.slug} on a repository, then continue.</p>
          <button className="secondary" disabled={busy} onClick={loadInstallations}>
            I've installed it — continue
          </button>
          {installations.map((i) => (
            <div className="row" key={i.id}>
              <span>{i.account?.login ?? i.id}</span>
              <button className="link" onClick={() => loadRepos(i.id)}>
                Use this installation
              </button>
            </div>
          ))}
        </div>
      )}
      {step === "repos" && (
        <div className="stack">
          {repos.map((r) => (
            <Card key={r.githubId} selectable selected={chosenRepo?.githubId === r.githubId} onClick={() => setChosenRepo(r)}>
              {r.owner}/{r.name} <span className="subtitle">({r.visibility}, {r.defaultBranch})</span>
            </Card>
          ))}
          {chosenRepo && (
            <Field label="Local clone folder" hint="Confirms this folder is the root of a clone of that exact repository.">
              <div className="row">
                <input readOnly value={folder ?? ""} placeholder="Choose folder" />
                <button className="secondary" onClick={pickFolder}>
                  Choose
                </button>
              </div>
            </Field>
          )}
          {chosenRepo && folder && (
            <button className="primary" disabled={busy} onClick={verify}>
              Verify &amp; continue
            </button>
          )}
        </div>
      )}
      {step === "done" && (
        <Badge tone="good">Repository verified at {verifiedPath}</Badge>
      )}
    </div>
  );
}

function SlackCard() {
  const [copied, setCopied] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [identity, setIdentity] = useState<{ team: string; user: string }>();
  const [channels, setChannels] = useState<{ id: string; name: string; private: boolean }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const copyManifest = async () => {
    await navigator.clipboard.writeText(SLACK_MANIFEST);
    setCopied(true);
    await window.shadowqa.openExternal("https://api.slack.com/apps?new_app=1");
  };

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setIdentity(await window.shadowqa.slack.verify(botToken, appToken));
      setChannels(await window.shadowqa.slack.channels());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="card stack">
      <h3>Slack</h3>
      <p className="subtitle">
        Socket Mode's app-level token can only be minted from Slack's own page — that one paste is
        unavoidable. Everything else is one manifest paste plus copying the bot token Slack shows
        you right after you click Install.
      </p>
      <ErrorNote error={error} />
      <button className="secondary" onClick={copyManifest}>
        {copied ? "Copied — paste it into “From an app manifest”" : "Copy manifest & open Slack"}
      </button>
      <Field label="Bot token" hint="Shown on Slack's OAuth & Permissions page right after Install to Workspace.">
        <input type="password" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="xoxb-…" />
      </Field>
      <Field label="App-level token" hint="Basic Information → App-Level Tokens → Generate, scope connections:write.">
        <input type="password" value={appToken} onChange={(e) => setAppToken(e.target.value)} placeholder="xapp-…" />
      </Field>
      <button className="primary" disabled={busy || !botToken} onClick={verify}>
        Verify
      </button>
      {identity && <Badge tone="good">Connected as {identity.user} in {identity.team}</Badge>}
      {channels.length > 0 && (
        <div className="stack">
          <p className="subtitle">Channels the bot has joined — pick which ones ShadowQA observes:</p>
          {channels.map((c) => (
            <label key={c.id} className="row">
              <input type="checkbox" style={{ width: "auto" }} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              #{c.name} {c.private && <span className="subtitle">(private)</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function JoinCard() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const join = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await window.shadowqa.team.join(url, token);
      navigate("/team/dashboard");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Join your team's ShadowQA</h3>
      <p className="subtitle">Ask your admin for the service URL and the member token they issued you.</p>
      <Field label="Service URL">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://shadowqa.your-team.dev" />
      </Field>
      <Field label="Member token">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
      </Field>
      <ErrorNote error={error} />
      <button className="primary" disabled={busy || !url || !token} onClick={join}>
        Connect
      </button>
    </div>
  );
}

function StartServiceCard() {
  const navigate = useNavigate();
  const [databaseUrl, setDatabaseUrl] = useState("postgresql://shadowqa:shadowqa@127.0.0.1:5432/shadowqa");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [dockerStarted, setDockerStarted] = useState(false);

  const startDocker = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await window.shadowqa.team.dockerComposeUp();
      setDockerStarted(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await window.shadowqa.team.start(databaseUrl);
      navigate("/team/dashboard");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Start the shared service</h3>
      <p className="subtitle">
        Team mode needs one always-on backend the whole team's desktop apps talk to — usually this
        machine, or a server you already run. This starts it here.
      </p>
      <Field label="PostgreSQL connection">
        <input value={databaseUrl} onChange={(e) => setDatabaseUrl(e.target.value)} />
      </Field>
      <div className="row">
        <button className="secondary" disabled={busy} onClick={startDocker}>
          {dockerStarted ? "Local Postgres started" : "No Postgres yet — start one with Docker"}
        </button>
      </div>
      <ErrorNote error={error} />
      <button className="primary" disabled={busy} onClick={start}>
        Start ShadowQA
      </button>
    </div>
  );
}

export function TeamConnect() {
  const navigate = useNavigate();
  const [role, setRole] = useState<"choose" | "admin" | "join">("choose");

  if (role === "choose")
    return (
      <div className="shell stack">
        <div className="mark">◈ Team</div>
        <div className="grid-2">
          <Card selectable onClick={() => setRole("admin")}>
            <h3>I'm setting this up</h3>
            <p className="subtitle">Connect GitHub and Slack, and start the shared service.</p>
          </Card>
          <Card selectable onClick={() => setRole("join")}>
            <h3>My team already uses ShadowQA</h3>
            <p className="subtitle">Just connect to the service URL your admin gave you.</p>
          </Card>
        </div>
        <button className="secondary" onClick={() => navigate("/")}>
          Back
        </button>
      </div>
    );

  return (
    <div className="shell stack">
      <div className="mark">◈ Team</div>
      {role === "join" ? (
        <JoinCard />
      ) : (
        <>
          <p className="subtitle">
            Both connections happen through your browser and native fields — nothing is written to
            a project <code>.env</code> file.
          </p>
          <GithubCard />
          <SlackCard />
          <StartServiceCard />
        </>
      )}
      <div className="row">
        <button className="secondary" onClick={() => setRole("choose")}>
          Back
        </button>
      </div>
    </div>
  );
}
