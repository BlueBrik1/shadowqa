import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";

const SETTLED = 2000;
import { Frame, Sentence, Label, Row, Col, Mark, Wordmark, Text, useTone, Rise } from "../film/ui";
import { Brand, SlackMark, GitHubMark, GeminiMark, ClaudeMark, OpenAIMark, OpenCodeMark, CodexMark, ChromeMark } from "../film/marks";
import { Slack, PullRequest, Browser, StoreCheckout, LiveCard, Code } from "../film/windows";
import { c, type Tone } from "../theme";
import { serifFamily, sansFamily } from "../fonts";
import { snippet } from "../generated/source";

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

/* ------------------------------------------------------------------------------------------ */
/* Slide scaffolding                                                                          */
/* ------------------------------------------------------------------------------------------ */

const Slide: React.FC<{ children: React.ReactNode; tone?: Tone; n: number; title?: string; kicker?: string }> = ({ children, tone = "light", n, title, kicker }) => (
  <Frame duration={1e9} tone={tone} fadeIn={0} fadeOut={0}>
    <AbsoluteFill style={{ padding: "72px 110px 64px", display: "flex", flexDirection: "column" }}>
      {kicker ? <Label size={16} style={{ marginBottom: 14 }}>{kicker}</Label> : null}
      {title ? <Sentence text={title} size={50} maxWidth={1680} style={{ marginBottom: 34 }} /> : null}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", justifyContent: "center" }}>{children}</div>
      <Footer n={n} />
    </AbsoluteFill>
  </Frame>
);

const Footer: React.FC<{ n: number }> = ({ n }) => {
  const t = useTone();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, fontFamily: sansFamily, fontSize: 14, letterSpacing: 2, color: t.faint, textTransform: "uppercase" }}>
      <Row gap={10}><Mark size={14} color={t.dim} /><span>ShadowQA</span></Row>
      <span>{String(n).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}</span>
    </div>
  );
};

/** A node in a flow diagram. */
const Node: React.FC<{ children: React.ReactNode; sub?: string; width?: number; strong?: boolean; icon?: React.ReactNode }> = ({ children, sub, width = 220, strong, icon }) => {
  const t = useTone();
  return (
    <div style={{ width, minHeight: 96, border: `1px solid ${strong ? t.ink : t.ruleStrong}`, borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, background: strong ? t.ink : t.panel, color: strong ? t.bg : t.ink }}>
      <Row gap={10}>
        {icon}
        <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: 19 }}>{children}</span>
      </Row>
      {sub ? <span style={{ fontFamily: sansFamily, fontSize: 14, color: strong ? t.bgDeep : t.dim, lineHeight: 1.3 }}>{sub}</span> : null}
    </div>
  );
};

const Arrow: React.FC<{ w?: number; label?: string; down?: boolean }> = ({ w = 54, label, down }) => {
  const t = useTone();
  return (
    <div style={{ display: "flex", flexDirection: down ? "row" : "column", alignItems: "center", gap: 6, color: t.dim, fontFamily: sansFamily, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", flexShrink: 0 }}>
      {label ? <span>{label}</span> : null}
      <svg width={down ? 14 : w} height={down ? w : 14} viewBox={down ? "0 0 14 54" : "0 0 54 14"}>
        {down ? (
          <>
            <line x1={7} y1={0} x2={7} y2={44} stroke={t.dim} strokeWidth={1.6} />
            <polygon points="1,42 13,42 7,54" fill={t.dim} />
          </>
        ) : (
          <>
            <line x1={0} y1={7} x2={44} y2={7} stroke={t.dim} strokeWidth={1.6} />
            <polygon points="42,1 42,13 54,7" fill={t.dim} />
          </>
        )}
      </svg>
    </div>
  );
};

const Card: React.FC<{ title: React.ReactNode; children?: React.ReactNode; width?: number | string; icon?: React.ReactNode; style?: React.CSSProperties }> = ({ title, children, width = 400, icon, style }) => {
  const t = useTone();
  return (
    <div style={{ width, border: `1px solid ${t.ruleStrong}`, borderRadius: 12, padding: "24px 26px", background: t.panel, display: "flex", flexDirection: "column", gap: 12, ...style }}>
      <Row gap={12}>
        {icon}
        <span style={{ fontFamily: serifFamily, fontSize: 26, lineHeight: 1.2, color: t.ink }}>{title}</span>
      </Row>
      {children ? <div style={{ fontFamily: sansFamily, fontSize: 17, lineHeight: 1.45, color: t.dim }}>{children}</div> : null}
    </div>
  );
};

const Mode: React.FC<{ name: string; what: string; live: string }> = ({ name, what, live }) => {
  const t = useTone();
  return (
    <div style={{ flex: 1, border: `1px solid ${t.ruleStrong}`, borderRadius: 12, padding: "26px 26px", background: t.panel, display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={{ fontFamily: "Consolas, monospace", fontSize: 24, color: t.ink }}>{name}</span>
      <span style={{ fontFamily: sansFamily, fontSize: 17, lineHeight: 1.45, color: t.ink }}>{what}</span>
      <span style={{ fontFamily: sansFamily, fontSize: 14, lineHeight: 1.4, color: t.dim, borderTop: `1px solid ${t.rule}`, paddingTop: 12 }}>
        <span style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 11 }}>Live · </span>{live}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* The slides                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const Cover: React.FC = () => (
  <Frame duration={1e9} tone="light" fadeIn={0} fadeOut={0}>
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 }}>
      <Wordmark size={80} />
      <Text size={32} style={{ fontFamily: serifFamily, color: c.faint, textAlign: "center", maxWidth: 1200 }}>
        Context-aware QA — from the first message in Slack or Claude to the running app.
      </Text>
      <Label size={16} style={{ marginTop: 20 }}>observe → plan → verify → repair</Label>
    </AbsoluteFill>
  </Frame>
);

const ProblemTeams: React.FC = () => (
  <Slide n={2} kicker="The problem · teams" title="Decisions are made in Slack. Code ships from GitHub. Nothing reconciles the two.">
    <Row gap={36} align="flex-start" style={{ marginTop: 6 }}>
      <Slack
        width={800}
        height={470}
        channels={["checkout", "incidents"]}
        messages={[
          { who: "Mara", at: "10:12", text: "Payments retry: opt-in per merchant. Default off.", delay: 0 },
          { who: "Priya", at: "10:15", text: "And no retries on 4xx — only timeouts.", delay: 0 },
        ]}
      />
      <Col gap={16} align="center" style={{ width: 90, height: 470, justifyContent: "center" }}>
        <span style={{ fontFamily: serifFamily, fontSize: 84, color: c.bad, lineHeight: 1 }}>✕</span>
      </Col>
      <PullRequest
        width={760}
        height={470}
        title="Retry failed payments"
        body={<span>Retries up to 3× on any non-200 response. <b style={{ fontWeight: 500 }}>Enabled by default.</b></span>}
        checks={[{ name: "lint", ok: true, delay: 0 }, { name: "unit", ok: true, delay: 0 }]}
      />
    </Row>
    <Text size={19} style={{ marginTop: 22, maxWidth: 1500, color: c.faint }}>
      Every check is green. The pull request still contradicts the decision the team made an hour earlier — and nobody finds out until production.
    </Text>
  </Slide>
);

const ProblemIndividuals: React.FC = () => (
  <Slide n={3} kicker="The problem · individuals" title="Your Claude, your ChatGPT, your coding agent — none of them can see each other.">
    <Row gap={40} align="stretch" style={{ marginTop: 4 }}>
      <Card width={560} icon={<ClaudeMark size={28} />} title="Claude decides the design">
        “Retry only on timeouts and 5xx. Never retry 4xx.”
      </Card>
      <Card width={560} icon={<OpenAIMark size={28} />} title="ChatGPT writes the loop">
        “Here’s a loop that retries any failed request up to 5 times…”
      </Card>
      <Card width={560} icon={<OpenCodeMark size={28} />} title="The agent implements a third thing">
        With no memory of either conversation, in a repository neither has seen.
      </Card>
    </Row>
    <Row gap={60} justify="center" style={{ marginTop: 52 }}>
      {(["slack", "github", "claude", "chatgpt", "claude-code", "codex"] as const).map((w) => (
        <Brand key={w} which={w} size={34} />
      ))}
    </Row>
    <Text size={19} style={{ marginTop: 26, textAlign: "center", color: c.faint }}>
      Context lives in six places. The code sees none of it.
    </Text>
  </Slide>
);

const Solution: React.FC = () => (
  <Slide n={4} tone="dark" kicker="The solution" title="ShadowQA watches where you already work, and turns it into verified code.">
    <Row gap={0} align="center" justify="center" style={{ marginTop: 40 }}>
      <Node width={300} icon={<span>◌</span>} sub="Slack, GitHub, Claude, ChatGPT, Claude Code, Codex — and the running app">Observe</Node>
      <Arrow />
      <Node width={300} icon={<GeminiMark size={20} />} sub="Gemini compiles a plan from the real conversation; every step cites its source">Plan</Node>
      <Arrow />
      <Node width={300} icon={<OpenCodeMark size={20} />} sub="OpenCode, Claude Code or Codex execute in an isolated sandbox, in your IDE">Execute</Node>
      <Arrow />
      <Node width={300} icon={<span style={{ color: c.good }}>✓</span>} sub="Checks re-run on a clean copy; a Live fix is proven by replaying your click">Verify</Node>
      <Arrow />
      <Node width={300} icon={<span>◈</span>} sub="What breaks later is reproduced and repaired under the same rules" strong>Repair</Node>
    </Row>
    <Text size={20} style={{ marginTop: 56, textAlign: "center" }}>
      One desktop app, one findings list, one set of automation modes — for the plan, for the checks, and for the running application.
    </Text>
  </Slide>
);

const HowTeams: React.FC = () => (
  <Slide n={5} tone="dark" kicker="How it works · teams" title="From a Slack thread to a verified pull request.">
    <Row gap={0} align="center" justify="center">
      <Col gap={14}>
        <Node width={220} icon={<SlackMark size={20} />} sub="channels you choose">Slack</Node>
        <Node width={220} icon={<GitHubMark size={20} />} sub="pull requests, issues, commits">GitHub</Node>
      </Col>
      <Arrow w={44} />
      <Node width={230} sub="source documents, revisioned and cited">Context</Node>
      <Arrow w={44} label="compile" />
      <Node width={230} icon={<GeminiMark size={20} />} sub="objective, steps, acceptance, sources">Gemini plan</Node>
      <Arrow w={44} />
      <Node width={210} sub="approval · or full-auto">Approve</Node>
      <Arrow w={44} />
      <Node width={230} icon={<OpenCodeMark size={20} />} sub="Docker sandbox · attached to your IDE">OpenCode</Node>
      <Arrow w={44} />
      <Node width={220} icon={<GitHubMark size={20} />} sub="frozen patch · checks · PR" strong>Verified PR</Node>
    </Row>
    <Row gap={30} style={{ marginTop: 64 }}>
      {[
        ["Connect", "Slack · GitHub · mode · project, each verified live, from the app"],
        ["Generate plan", "context → repository inspection → Gemini plan"],
        ["Approve", "approves this exact digest, base SHA and command profile"],
        ["Findings · Repair", "what breaks later is reproduced, then repaired"],
      ].map(([cmd, what]) => (
        <div key={cmd} style={{ flex: 1, borderTop: `1px solid rgba(244,241,234,0.28)`, paddingTop: 12 }}>
          <div style={{ fontFamily: sansFamily, fontWeight: 600, fontSize: 17, color: c.offwhite }}>{cmd}</div>
          <div style={{ fontFamily: sansFamily, fontSize: 15, color: c.dim, marginTop: 6 }}>{what}</div>
        </div>
      ))}
    </Row>
  </Slide>
);

const HowIndividuals: React.FC = () => (
  <Slide n={6} tone="dark" kicker="How it works · individuals" title="Every conversation you choose to track becomes one context for one agent.">
    <Row gap={0} align="center" style={{ marginTop: 10 }}>
      <Col gap={12}>
        <Node width={230} icon={<ClaudeMark size={18} />} sub="side panel · tracked chats">Claude</Node>
        <Node width={230} icon={<OpenAIMark size={18} />} sub="side panel · tracked chats">ChatGPT</Node>
        <Node width={230} icon={<ClaudeMark size={18} />} sub="companion · local sessions">Claude Code</Node>
        <Node width={230} icon={<CodexMark size={18} />} sub="companion · local sessions">Codex</Node>
      </Col>
      <Arrow />
      <Node width={240} icon={<ChromeMark size={20} />} sub="extension + native companion; one pairing code">Capture</Node>
      <Arrow label="extract" />
      <Node width={250} sub="requirements · decisions · open questions, each cited">Context</Node>
      <Arrow label="plan" />
      <Node width={240} icon={<GeminiMark size={20} />} sub="grounded in your repository">Gemini plan</Node>
      <Arrow />
      <Col gap={12}>
        <Node width={220} icon={<OpenCodeMark size={18} />}>OpenCode</Node>
        <Node width={220} icon={<ClaudeMark size={18} />}>Claude Code</Node>
        <Node width={220} icon={<CodexMark size={18} />}>Codex</Node>
      </Col>
      <Arrow />
      <Node width={220} icon={<span style={{ color: c.good }}>✓</span>} sub="checks on a clean copy · branch · PR" strong>Verified</Node>
    </Row>
    <Text size={19} style={{ marginTop: 44, textAlign: "center" }}>
      A question left open in the plan is shown, not hidden — and the agent runs in your IDE terminal, in a session you can step into.
    </Text>
  </Slide>
);

const Modes: React.FC = () => (
  <Slide n={7} kicker="Automation modes" title="Four modes decide how much ShadowQA may do on its own — everywhere, including Live.">
    <Row gap={24} align="stretch" style={{ marginTop: 10 }}>
      <Mode name="observe" what="Watch and check only. ShadowQA never edits or publishes." live="diagnoses, never writes" />
      <Mode name="approval" what="Ask first. Every plan and every repair waits for you." live="patch waits for Approve in the Live tab" />
      <Mode name="auto-fix" what="Bounded automatic repair inside configured automatic paths; humans still merge." live="LOW-risk patches apply, still replay-verified" />
      <Mode name="full-auto" what="Same bounded scope plus policy-gated merging. Requires an explicit merge policy." live="same restricted scope; merge policy in the service" />
    </Row>
    <Row gap={40} align="flex-start" style={{ marginTop: 40 }}>
      <div style={{ flex: 1, border: `1px solid rgba(28,28,28,0.2)`, borderRadius: 10, padding: "16px 22px", background: c.offwhiteLift }}>
        <Label size={12} style={{ marginBottom: 10 }}>src/core/contracts.ts</Label>
        <Code code={snippet("modeEnum").code} lang="typescript" fontSize={17} />
      </div>
      <div style={{ flex: 1, border: `1px solid rgba(28,28,28,0.2)`, borderRadius: 10, padding: "16px 22px", background: c.offwhiteLift }}>
        <Label size={12} style={{ marginBottom: 10 }}>live/backend/shadowqa/config.py</Label>
        <Code code={snippet("modeToAutonomy").code} lang="python" fontSize={17} />
      </div>
    </Row>
  </Slide>
);

const LiveSlide: React.FC = () => (
  <Slide n={8} tone="dark" kicker="New · ShadowQA Live" title="Plans and checks cover the code. Live covers the running app.">
    <Row gap={40} align="flex-start" style={{ marginTop: 4 }}>
      <div style={{ position: "relative", flex: "0 0 1040px" }}>
        <Browser width={1040} height={560}>
          <StoreCheckout fixed />
          <LiveCard
            width={420}
            status="verified"
            tone="good"
            title="Fixed and verified by replay"
            rows={[
              ["chain", <span>click <i>Pay</i> → POST /api/demo/payment → 500 → TypeError</span>],
              ["root cause", "Checkout read order.total; the amount must come from the cart"],
              ["patch", "4 lines · 2 files · risk LOW"],
              ["replay", <span><span style={{ color: c.good }}>✓</span> click Pay → 200 → order placed</span>],
            ]}
            actions={["Open PR", "Undo"]}
          />
        </Browser>
      </div>
      <Col gap={0} style={{ flex: 1 }}>
        {[
          ["Capture", "A tiny SDK (or the Chrome extension) watches clicks, requests, console and exceptions on localhost."],
          ["Correlate", "The failing click, the request it caused and the exception it produced are joined into one incident — frontend and backend."],
          ["Diagnose", "Claude finds the root cause, GPT as the fallback; source maps point at the real file and line."],
          ["Patch · grade", "A minimal patch is proposed and risk-scored. The project mode decides whether it waits."],
          ["Validate · replay", "Behind a checkpoint: your linters and tests run, then Live replays your exact interaction. Fail → automatic rollback."],
          ["Report", "The incident is a finding on the Findings tab; Open pull request on the Live tab does the rest."],
        ].map(([k, v], i) => (
          <Row key={k} gap={18} align="flex-start" style={{ padding: "12px 0", borderTop: i ? `1px solid rgba(244,241,234,0.14)` : undefined }}>
            <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: 17, width: 150, color: c.offwhite, flex: "0 0 150px" }}>{k}</span>
            <span style={{ fontFamily: sansFamily, fontSize: 16, lineHeight: 1.4, color: c.dim }}>{v}</span>
          </Row>
        ))}
      </Col>
    </Row>
    <Row gap={0} align="center" justify="center" style={{ marginTop: 30 }}>
      {["click", "capture", "correlate", "diagnose", "patch", "validate", "replay", "verified · PR"].map((s, i, a) => (
        <React.Fragment key={s}>
          <span style={{ fontFamily: sansFamily, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", color: i === a.length - 1 ? c.good : c.offwhite, padding: "8px 14px", border: `1px solid ${i === a.length - 1 ? c.good : "rgba(244,241,234,0.28)"}`, borderRadius: 20 }}>{s}</span>
          {i < a.length - 1 ? <Arrow w={34} /> : null}
        </React.Fragment>
      ))}
    </Row>
  </Slide>
);

const Features: React.FC = () => (
  <Slide n={9} kicker="Main features" title="Built to be trusted with a repository.">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, marginTop: 6 }}>
      {[
        ["Isolated execution", "Every run happens in a locked-down Docker container with a fresh clone; the runner never touches your working tree."],
        ["Verified independently", "Checks re-run on a clean copy and are compared to a baseline. The agent's own success claim is never trusted."],
        ["Never weakens a test", "A repair that deletes or loosens a check is rejected by policy before it can be published."],
        ["Cited or rejected", "A plan step must cite a real message or pull request; a plan that cites nothing real is refused."],
        ["Bounded repair", "Two attempts per finding, a cooldown between them, then escalation to a human."],
        ["Approve the exact plan", "Approval binds a digest, a base SHA and a command profile. Any drift invalidates it."],
        ["Live risk grading", "Runtime patches are graded LOW / MEDIUM / HIGH; only LOW may ever apply without a person."],
        ["Kill switch", "One switch in the desktop app's Admin tab stops and cancels everything, in every mode."],
        ["Works in your IDE", "OpenCode, Claude Code and Codex sessions attach to your terminal; a VS Code extension shows findings inline."],
      ].map(([t, d]) => (
        <Card key={t} width="100%" title={t}>{d}</Card>
      ))}
    </div>
  </Slide>
);

const Architecture: React.FC = () => (
  <Slide n={10} tone="dark" kicker="One product" title="Two runtimes, one vocabulary, one findings list.">
    <Row gap={0} align="center" justify="center" style={{ marginTop: 30 }}>
      <Col gap={14}>
        <Node width={260} sub="Electron + React · both editions">Desktop app</Node>
        <Node width={260} sub="findings · sessions · attach">VS Code extension</Node>
        <Node width={260} icon={<ChromeMark size={18} />} sub="Claude · ChatGPT side panel">Browser extension</Node>
      </Col>
      <Arrow />
      <Node width={320} sub="Fastify · PostgreSQL · Zod · Gemini planner · scheduler · policy engine · /live bridge" strong>ShadowQA service</Node>
      <Arrow />
      <Col gap={14}>
        <Node width={280} icon={<OpenCodeMark size={18} />} sub="Docker sandbox · OpenCode / Claude Code / Codex">Runner</Node>
        <Node width={280} icon={<span>◉</span>} sub="FastAPI · browser SDK · Claude → GPT · replay engine">Live bridge</Node>
      </Col>
    </Row>
    <Row gap={60} justify="center" style={{ marginTop: 50 }}>
      {[
        ["POST /live/projects/:id/incidents", "a Live incident becomes a finding"],
        ["GET /live/policy/:project", "the project mode governs Live"],
        ["Repair on a Live finding", "delegates to Live: apply → validate → replay"],
      ].map(([k, v]) => (
        <Col key={k} gap={6} align="center">
          <span style={{ fontFamily: "Consolas, monospace", fontSize: 17, color: c.offwhite }}>{k}</span>
          <span style={{ fontFamily: sansFamily, fontSize: 15, color: c.dim }}>{v}</span>
        </Col>
      ))}
    </Row>
  </Slide>
);

const CloseSlide: React.FC = () => (
  <Frame duration={1e9} tone="light" fadeIn={0} fadeOut={0}>
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36 }}>
      <Wordmark size={72} />
      <Row gap={44}>
        {(["slack", "github", "gemini", "claude", "openai", "opencode", "codex"] as const).map((w) => (
          <Brand key={w} which={w} size={28} />
        ))}
      </Row>
      <Col gap={10} align="center" style={{ marginTop: 20 }}>
        <span style={{ fontFamily: "Consolas, monospace", fontSize: 24, color: c.charcoal }}>github.com/BlueBrik1/shadowqa</span>
        <span style={{ fontFamily: sansFamily, fontSize: 16, color: c.faint, letterSpacing: 2, textTransform: "uppercase" }}>
          observe → plan → verify → repair
        </span>
      </Col>
    </AbsoluteFill>
  </Frame>
);

export const SLIDES: React.FC[] = [Cover, ProblemTeams, ProblemIndividuals, Solution, HowTeams, HowIndividuals, Modes, LiveSlide, Features, Architecture, CloseSlide];

/** Frame N is slide N. Every animation is frozen at its settled state. */
export const Slides: React.FC = () => {
  const frame = useCurrentFrame();
  const index = Math.min(SLIDES.length - 1, Math.max(0, frame));
  const Current = SLIDES[index];
  // A Sequence starting SETTLED frames in the past makes every child see frame SETTLED, so all
  // entrance animations are at rest whichever frame the still is taken from.
  return (
    <AbsoluteFill style={{ background: c.offwhite }}>
      <Sequence from={frame - SETTLED} layout="none">
        <Current />
      </Sequence>
    </AbsoluteFill>
  );
};

export { Rise };
