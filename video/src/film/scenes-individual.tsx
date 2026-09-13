import React from "react";
import { useCurrentFrame } from "remotion";
import { Beat } from "./beat";
import { Row, Col, Rise, Between, Label, Mark, Arrow, Status } from "./ui";
import { Editor, Code, Window, DesktopApp, AppCard, AppBadge, AppButton, AppLabel } from "./windows";
import { Brand, ClaudeMark, OpenAIMark, OpenCodeMark, CodexMark, GeminiMark, ChromeMark } from "./marks";
import { c } from "../theme";
import { serifFamily, sansFamily } from "../fonts";

const CH = { index: "03", title: "For individuals" };

/* 16 Claude */
export const SetupClaude: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Working alone? Paste your Claude key.">
    <Row gap={60}>
      <DesktopApp width={900} height={440}>
        <AppLabel>Solo setup — Models</AppLabel>
        <div style={{ fontFamily: serifFamily, fontSize: 24, marginBottom: 16 }}>Connect</div>
        <AppCard delay={26}>
          <Row gap={10}><AppBadge tone="good">saved</AppBadge><span style={{ fontSize: 16 }}>Anthropic API key — stored in your OS keychain</span></Row>
        </AppCard>
        <Col gap={10} style={{ marginTop: 18, fontSize: 16 }}>
          <Between from={48}><Row gap={12}><AppBadge tone="good">ready</AppBadge><span>Claude Code — local sessions found: 3</span></Row></Between>
        </Col>
      </DesktopApp>
      <Rise delay={20}><ClaudeMark size={140} /></Rise>
    </Row>
  </Beat>
);

/* 17 OpenAI */
export const SetupOpenAI: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="And with OpenAI.">
    <Row gap={60}>
      <DesktopApp width={900} height={440}>
        <AppLabel>Solo setup — Models</AppLabel>
        <div style={{ fontFamily: serifFamily, fontSize: 24, marginBottom: 16 }}>Connect</div>
        <AppCard delay={26}>
          <Row gap={10}><AppBadge tone="good">saved</AppBadge><span style={{ fontSize: 16 }}>OpenAI API key — stored in your OS keychain</span></Row>
        </AppCard>
        <Col gap={10} style={{ marginTop: 18, fontSize: 16 }}>
          <Between from={48}><Row gap={12}><AppBadge tone="good">ready</AppBadge><span>Codex — local sessions found: 1</span></Row></Between>
        </Col>
      </DesktopApp>
      <Rise delay={20}><OpenAIMark size={140} /></Rise>
    </Row>
  </Beat>
);

/* 18 Extension + pairing */
export const SetupExtension: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Install the browser extension. Pair it with one code.">
    <Row gap={50} align="flex-start">
      <DesktopApp width={720} height={400}>
        <AppLabel>Context — Pair the browser side panel</AppLabel>
        <span style={{ fontFamily: sansFamily, fontWeight: 600, fontSize: 40, letterSpacing: 12, display: "block", margin: "16px 0 10px" }}>7 3 A K 2 Q</span>
        <span style={{ color: c.dim, fontSize: 15 }}>Type it into the ShadowQA side panel within 10 minutes.</span>
      </DesktopApp>
      <SidePanel delay={16} />
    </Row>
  </Beat>
);
const SidePanel: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const paired = frame > 130;
  return (
    <Window width={560} height={560} delay={delay} title={<Row gap={8}><ChromeMark size={14} color={c.dim} />claude.ai — ShadowQA side panel</Row>} bodyStyle={{ display: "flex" }}>
      <div style={{ flex: 1, padding: 22, borderRight: `1px solid rgba(244,241,234,0.14)`, color: c.dim, fontSize: 14 }}>
        <div style={{ fontFamily: serifFamily, fontSize: 20, color: c.offwhite, marginBottom: 12 }}>Claude</div>
        <div style={{ height: 10, width: "80%", background: "rgba(244,241,234,0.12)", borderRadius: 5, marginBottom: 8 }} />
        <div style={{ height: 10, width: "60%", background: "rgba(244,241,234,0.12)", borderRadius: 5, marginBottom: 8 }} />
        <div style={{ height: 10, width: "72%", background: "rgba(244,241,234,0.12)", borderRadius: 5 }} />
      </div>
      <div style={{ width: 250, padding: 20, display: "flex", flexDirection: "column", gap: 14, fontFamily: sansFamily }}>
        <Row gap={8}><Mark size={16} /><span style={{ fontSize: 14, letterSpacing: 2 }}>SHADOWQA</span></Row>
        {!paired ? (
          <>
            <div style={{ fontSize: 13, color: c.dim }}>Pairing code</div>
            <div style={{ border: `1px solid rgba(244,241,234,0.3)`, borderRadius: 6, padding: "10px 12px", fontFamily: "Consolas, monospace", fontSize: 20, letterSpacing: 6 }}>
              {"73AK2Q".slice(0, Math.max(0, Math.floor((frame - 70) / 8)))}
            </div>
          </>
        ) : (
          <>
            <Row gap={8}><span style={{ color: c.good }}>✓</span><span style={{ fontSize: 14 }}>Paired</span></Row>
            <div style={{ fontSize: 13, color: c.dim }}>This conversation</div>
            <div style={{ border: `1px solid rgba(244,241,234,0.3)`, borderRadius: 6, padding: "10px 12px", fontSize: 14 }}>
              Track → <b style={{ fontWeight: 500 }}>payments-client</b>
            </div>
            <div style={{ fontSize: 12, color: c.faint }}>Only tracked conversations are captured.</div>
          </>
        )}
      </div>
    </Window>
  );
};

/* 19 Mode */
export const ModeIndividual: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Same four modes. Same rules.">
    <DesktopApp width={1100} height={360}>
      <AppLabel>payments-client — Automation mode</AppLabel>
      <Row gap={14} style={{ marginTop: 10 }}>
        <AppBadge>approval</AppBadge>
        <span style={{ color: c.dim, fontSize: 16 }}>Ask first. Plans and repairs wait for your yes.</span>
      </Row>
      <Between from={60}>
        <Row gap={10} style={{ marginTop: 24 }}>
          <span style={{ color: c.good }}>✓</span>
          <span>'payments-client' is now in approval mode (policy version 2); plans awaiting approval were superseded.</span>
        </Row>
      </Between>
    </DesktopApp>
  </Beat>
);

/* 20 Context gathered from every conversation and coding session */
export const GatherIndividual: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const n = Math.min(64, Math.floor(Math.max(0, frame - 40) * 0.7));
  return (
    <Beat
      duration={duration}
      chapter={CH}
      sentence={[
        { from: 0, text: "Every conversation and every coding session becomes one context." },
        { from: 130, text: "Requirements, decisions and open questions — each one cited to the message it came from." },
      ]}
    >
      <div style={{ position: "relative", width: 1680, height: 640 }}>
        {(
          [
            ["claude", "Claude · retry policy", "Retry only timeouts and 5xx. Never 4xx.", 0],
            ["chatgpt", "ChatGPT · client loop", "Loop retries any failure 5×.", 1],
            ["claude-code", "Claude Code · session a91f", "Edited PaymentClient.send()", 2],
            ["codex", "Codex · session 22c0", "Added backoff helper", 3],
          ] as const
        ).map(([which, title, body, i]) => (
          <div key={which} style={{ position: "absolute", left: 0, top: i * 158 }}>
            <Rise delay={4 + i * 10}>
              <div style={{ width: 640, height: 134, border: `1px solid rgba(244,241,234,0.2)`, borderRadius: 10, padding: "18px 22px", background: c.charcoalLift }}>
                <Brand which={which} size={22} />
                <div style={{ fontSize: 14, color: c.faint, marginTop: 8 }}>{title}</div>
                <div style={{ fontFamily: serifFamily, fontSize: 20, marginTop: 4 }}>{body}</div>
              </div>
            </Rise>
          </div>
        ))}
        <svg style={{ position: "absolute", left: 0, top: 0 }} width={1680} height={640}>
          {[0, 1, 2, 3].map((i) => (
            <Arrow key={i} x1={660} y1={i * 158 + 67} x2={1000} y2={300} delay={40 + i * 8} />
          ))}
        </svg>
        <div style={{ position: "absolute", left: 1020, top: 110, width: 660, height: 400, border: `1px solid rgba(244,241,234,0.28)`, borderRadius: 12, padding: "26px 30px", background: c.charcoalLift }}>
          <Label size={14}>context · payments-client</Label>
          <div style={{ fontFamily: serifFamily, fontSize: 96, lineHeight: 1, marginTop: 20, fontVariantNumeric: "tabular-nums" }}>{n}</div>
          <div style={{ fontSize: 18, color: c.dim, marginTop: 4 }}>captured messages · 4 origins</div>
          <Col gap={10} style={{ marginTop: 22, fontSize: 17 }}>
            <Between from={140}><Row gap={12}><span style={{ color: c.dim, width: 120 }}>requirement</span><span>Never retry a 4xx response</span><span style={{ color: c.faint, marginLeft: "auto" }}>claude · msg 14</span></Row></Between>
            <Between from={156}><Row gap={12}><span style={{ color: c.dim, width: 120 }}>decision</span><span>Cap at 3 attempts, jittered backoff</span><span style={{ color: c.faint, marginLeft: "auto" }}>claude · msg 14</span></Row></Between>
            <Between from={172}><Row gap={12}><span style={{ color: c.dim, width: 120 }}>question</span><span style={{ color: c.bad }}>ChatGPT loop retries 5× on any failure — which is right?</span></Row></Between>
          </Col>
        </div>
      </div>
    </Beat>
  );
};

/* 21 Plan */
export const PlanIndividual: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Press Generate plan. Gemini grounds it in your repository and your conversations.">
    <DesktopApp width={1440} height={620} tab="Plans">
      <Row gap={16} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: serifFamily, fontSize: 24, marginBottom: 6 }}>Retry timeouts and 5xx only, 3 attempts, jittered backoff; never 4xx.</div>
          <Row gap={10}><GeminiMark size={16} /><span style={{ color: c.dim, fontSize: 14 }}>64 messages · repo @ 3be0d1</span></Row>
        </div>
        <AppBadge>awaiting approval</AppBadge>
      </Row>
      <Row gap={20} style={{ marginTop: 22, alignItems: "flex-start" }}>
        <AppCard delay={20} style={{ flex: 1 }}>
          <AppLabel>Steps</AppLabel>
          <Col gap={10} style={{ fontSize: 16 }}>
            <Between from={40}><span>◇ Replace the 5× any-failure loop in PaymentClient with a policy object</span></Between>
            <Between from={54}><span>◇ Add tests: 4xx returns immediately; 3rd timeout surfaces the error</span></Between>
          </Col>
        </AppCard>
        <Col gap={16} style={{ width: 440 }}>
          <AppCard delay={40}>
            <AppLabel>Open question</AppLabel>
            <Between from={70}><span style={{ color: c.bad, fontSize: 15 }}>ChatGPT draft retried on any failure — superseded by the Claude decision (msg 14)?</span></Between>
          </AppCard>
          <AppCard delay={60}>
            <AppLabel>Sources</AppLabel>
            <Col gap={8} style={{ fontSize: 15 }}>
              <Between from={100}><Row gap={8}><ClaudeMark size={14} /><span>claude.ai · conversation 8c2d · message 14</span></Row></Between>
              <Between from={114}><Row gap={8}><OpenAIMark size={14} /><span>chatgpt.com · conversation 41aa · message 6</span></Row></Between>
            </Col>
          </AppCard>
        </Col>
      </Row>
    </DesktopApp>
  </Beat>
);

/* 22 Execute through OpenCode / Claude Code / Codex */
const POLICY = `export const retryPolicy: RetryPolicy = {
  attempts: 3,
  backoff: jittered({ base: 200, max: 2_000 }),
  shouldRetry: (r) => r.timedOut || r.status >= 500,   // never 4xx
};`;
export const ExecuteIndividual: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const which = frame < 70 ? 0 : frame < 120 ? 1 : 2;
  return (
    <Beat
      duration={duration}
      chapter={CH}
      sentence={[
        { from: 0, text: "Approve, and it runs in your IDE through the agent you already use." },
        { from: 110, text: "OpenCode, Claude Code or Codex — your choice, per project." },
      ]}
    >
      <Editor
        files={["policy.ts", "client.ts", "client.test.ts"]}
        title="Visual Studio Code — payments-client"
        sideTitle={["OpenCode", "Claude Code", "Codex"][which]}
        side={
          <Col gap={6}>
            <Row gap={8}>
              {which === 0 ? <OpenCodeMark size={16} /> : which === 1 ? <ClaudeMark size={16} /> : <CodexMark size={16} />}
              <span style={{ color: c.dim }}>{["opencode attach", "claude --resume 8c2d", "codex resume 22c0"][which]}</span>
            </Row>
            <Between from={16}><span style={{ color: c.dim }}>▸ read src/payments/client.ts</span></Between>
            <Between from={40}><span>▸ write src/payments/policy.ts <span style={{ color: c.good }}>+6</span></span></Between>
            <Between from={64}><span>▸ edit client.ts <span style={{ color: c.good }}>+4</span> <span style={{ color: c.bad }}>−11</span></span></Between>
            <Between from={96}><span>▸ write client.test.ts <span style={{ color: c.good }}>+22</span></span></Between>
            <Between from={130}><span style={{ color: c.dim }}>▸ npm test</span></Between>
            <Between from={160}><span><span style={{ color: c.good }}>✓</span> 18 passing</span></Between>
          </Col>
        }
      >
        <Code code={POLICY} lang="typescript" fontSize={20} reveal={{ start: 36, lps: 0.25 }} />
      </Editor>
    </Beat>
  );
};

/* 23 Verified, repaired */
export const VerifiedIndividual: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Checks run on a clean copy. What breaks later gets found, and repaired.">
    <DesktopApp width={1200} height={420} tab="Jobs">
      <Row gap={16} style={{ justifyContent: "space-between" }}>
        <div style={{ fontFamily: serifFamily, fontSize: 22 }}>Job 5b02…</div>
        <AppBadge tone="good">verified</AppBadge>
      </Row>
      <Between from={30}>
        <Row gap={16} style={{ marginTop: 18 }}>
          <Status ok label="check · 18 passing · 6.2s" size={22} />
        </Row>
      </Between>
      <Between from={50}>
        <div style={{ color: c.dim, fontSize: 16, marginTop: 14 }}>Branch shadowqa/retry-policy (a4d2e0f1)</div>
      </Between>
      <Between from={90}>
        <AppCard delay={0} style={{ marginTop: 22 }}>
          <Row gap={12} style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: 15 }}>Saved-file watching — payments-client</span>
            <AppButton primary={false} delay={0}>Watch this project</AppButton>
          </Row>
        </AppCard>
      </Between>
      <Between from={130}>
        <Row gap={10} style={{ marginTop: 16 }}>
          <span style={{ color: c.good }}>✓</span>
          <span style={{ color: c.dim, fontSize: 15 }}>Watching saved files in ~/src/payments-client. Checks run after 8 seconds of quiet.</span>
        </Row>
      </Between>
    </DesktopApp>
  </Beat>
);
