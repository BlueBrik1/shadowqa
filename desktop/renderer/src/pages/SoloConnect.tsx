import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { config, type Config } from "../lib/api";
import { ProviderKey } from "../components/ProviderKey";
import { Badge } from "../components/ui";

export function SoloConnect() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<Config>();

  useEffect(() => {
    config().then(setCfg);
  }, []);

  return (
    <div className="shell stack">
      <div>
        <div className="mark">◈ Connect</div>
        <div className="subtitle">Solo edition — planning stays on Gemini; coding runs in the tool you already use.</div>
      </div>

      <div className="card stack">
        <h3>Models</h3>
        <ProviderKey id="gemini" label="Gemini API key" required />
        <ProviderKey id="anthropic" label="Anthropic API key" />
        <ProviderKey id="openai" label="OpenAI API key" />
        <p className="subtitle" style={{ fontSize: 12 }}>
          Anthropic/OpenAI power ShadowQA Live's diagnosis of runtime bugs. Neither provider offers a
          sign-in flow for API keys — pasting one here, stored only in your OS keychain, is as close
          to zero-config as they get.
        </p>
      </div>

      <div className="card stack">
        <h3>Coding tools on this machine</h3>
        {!cfg && <p className="subtitle">Checking…</p>}
        {cfg?.backends.map((b) => (
          <div className="row" key={b.id}>
            <Badge tone={b.available ? "good" : undefined}>{b.available ? "ready" : "not found"}</Badge>
            <strong>{b.label}</strong>
            <span className="subtitle">{b.available ? b.version : b.reason}</span>
          </div>
        ))}
        <p className="subtitle" style={{ fontSize: 12 }}>
          Nothing installed? ShadowQA can still run your plans with OpenCode, driven by your Gemini
          key — no separate coding subscription needed.
        </p>
      </div>

      <div className="row">
        <button className="primary" onClick={() => navigate("/solo/project")}>
          Continue
        </button>
      </div>
    </div>
  );
}
