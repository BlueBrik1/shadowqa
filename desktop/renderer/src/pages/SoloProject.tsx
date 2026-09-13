import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Field, ErrorNote } from "../components/ui";

const MODE_HELP: Record<string, string> = {
  observe: "Watch and check only. ShadowQA never edits your code.",
  approval: "Ask first. Plans and repairs wait for your yes.",
  "auto-fix": "Bounded automatic repair inside the configured automatic paths.",
  "full-auto": "Same bounded scope, approved plans run without a second confirmation.",
};

const BACKEND_HELP: Record<string, string> = {
  opencode: "OpenCode, driven by your Gemini key. No coding subscription needed.",
  "claude-code": "Your Claude Code CLI and its own sign-in.",
  codex: "Your Codex CLI and its own sign-in.",
};

export function SoloProject() {
  const navigate = useNavigate();
  const [id, setId] = useState("my-project");
  const [folder, setFolder] = useState<string>();
  const [mode, setMode] = useState("approval");
  const [backend, setBackend] = useState("opencode");
  const [checkCommand, setCheckCommand] = useState("npm test");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const pick = async () => {
    const chosen = await window.shadowqa.pickFolder();
    if (chosen) setFolder(chosen);
  };

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api("/projects", "POST", {
        id,
        name: id,
        mode,
        backend,
        repo: folder ? { path: folder, defaultBranch: "main" } : undefined,
        checks: [{ id: "check", argv: checkCommand.split(/\s+/).filter(Boolean), timeoutSeconds: 900 }],
        requiredChecks: ["check"],
      });
      navigate("/dashboard");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell stack">
      <div>
        <div className="mark">◈ Your first project</div>
      </div>

      <Field label="Project ID">
        <input value={id} onChange={(e) => setId(e.target.value)} />
      </Field>

      <Field label="Repository folder" hint="ShadowQA works in an isolated copy exported from Git objects — your clone is never written to.">
        <div className="row">
          <input readOnly value={folder ?? "Not set — you can add this later"} />
          <button className="secondary" onClick={pick}>
            Choose folder
          </button>
        </div>
      </Field>

      <Field label="Check command">
        <input value={checkCommand} onChange={(e) => setCheckCommand(e.target.value)} />
      </Field>

      <Field label="Coding backend">
        <select value={backend} onChange={(e) => setBackend(e.target.value)}>
          {Object.entries(BACKEND_HELP).map(([key, help]) => (
            <option key={key} value={key}>
              {key} — {help}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Automation mode">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {Object.entries(MODE_HELP).map(([key, help]) => (
            <option key={key} value={key}>
              {key} — {help}
            </option>
          ))}
        </select>
      </Field>

      <ErrorNote error={error} />
      <div className="row">
        <button className="primary" disabled={busy} onClick={create}>
          {busy ? "Creating…" : "Start watching"}
        </button>
      </div>
    </div>
  );
}
