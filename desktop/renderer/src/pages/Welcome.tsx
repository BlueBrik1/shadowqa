import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui";

export function Welcome() {
  const navigate = useNavigate();
  return (
    <div className="shell stack">
      <div>
        <div className="mark">◈ ShadowQA</div>
        <div className="subtitle">observe → plan → verify → repair</div>
      </div>
      <p>
        ShadowQA watches your work, turns confirmed context into a plan you approve, and runs it in
        an isolated copy of your repository — verified before anything is called fixed.
      </p>
      <div className="grid-2">
        <Card selectable onClick={() => navigate("/connect/solo")}>
          <h3>Solo</h3>
          <p className="subtitle">
            Your ChatGPT, Claude, Claude Code and Codex conversations become project context. Runs
            entirely on this machine.
          </p>
        </Card>
        <Card selectable onClick={() => navigate("/connect/team")}>
          <h3>Team</h3>
          <p className="subtitle">
            Slack and GitHub context, shared with your team through one ShadowQA service.
          </p>
        </Card>
      </div>
    </div>
  );
}
