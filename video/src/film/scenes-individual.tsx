import React from "react";
import { useCurrentFrame } from "remotion";
import { Beat } from "./beat";
import { Row, Col, Rise, Between, Label, Mark, Arrow, Status } from "./ui";
import { Terminal, KV, Editor, Code, Window } from "./windows";
import { Brand, ClaudeMark, OpenAIMark, OpenCodeMark, CodexMark, GeminiMark, ChromeMark } from "./marks";
import { c } from "../theme";
import { serifFamily, sansFamily } from "../fonts";

const CH = { index: "03", title: "For individuals" };
const ok = <span style={{ color: c.good }}>✓ </span>;

/* 16 Claude */
export const SetupClaude: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Working alone? Sign in with Claude.">
    <Row gap={60}>
      <Terminal
        width={1000}
        height={440}
        title="shadowqa-individual — zsh"
        lines={[
          { at: 6, cmd: "shadowqa-individual setup --step claude" },
          { at: 56, out: <span>{ok}Claude account verified: mara@ellis.dev</span> },
          { at: 72, out: <KV k="CONVERSATIONS" v="captured in the side panel when you choose to track them" /> },
          { at: 86, out: <KV k="CLAUDE CODE" v="local sessions found: 3" /> },
        ]}
      />
      <Rise delay={20}><ClaudeMark size={140} /></Rise>
    </Row>
  </Beat>
);

/* 17 OpenAI */
export const SetupOpenAI: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="And with OpenAI.">
    <Row gap={60}>
      <Terminal
        width={1000}
        height={440}
        title="shadowqa-individual — zsh"
        lines={[
          { at: 6, cmd: "shadowqa-individual setup --step openai" },
          { at: 56, out: <span>{ok}OpenAI account verified.</span> },
          { at: 72, out: <KV k="CHATGPT" v="captured in the side panel when you choose to track them" /> },
          { at: 86, out: <KV k="CODEX" v="local sessions found: 1" /> },
        ]}
      />
      <Rise delay={20}><OpenAIMark size={140} /></Rise>
    </Row>
  </Beat>
);

/* 18 Extension + pairing */
export const SetupExtension: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Install the browser extension. Pair it with one code.">
    <Row gap={50} align="flex-start">
      <Terminal
        width={760}
        height={400}
        title="shadowqa-individual — zsh"
        lines={[
          { at: 6, cmd: "shadowqa-individual pair" },
          { at: 50, out: <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: 40, letterSpacing: 12, display: "block", margin: "12px 0 6px" }}>7 3 A K 2 Q</span> },
          { at: 66, out: <span style={{ color: c.dim }}>    Type it into the ShadowQA side panel within 10 minutes.</span> },
        ]}
      />
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
    <Terminal
      width={1240}
      height={360}
      title="shadowqa-individual — zsh"
      lines={[
        { at: 6, cmd: "shadowqa-individual project mode payments-client approval" },
        { at: 66, out: <span>{ok}'payments-client' is now in approval mode (policy version 2); plans awaiting approval were superseded.</span> },
      ]}
    />
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
  <Beat duration={duration} chapter={CH} sentence="Ask for a plan. Gemini grounds it in your repository and your conversations.">
    <Terminal
      width={1440}
      height={560}
      fontSize={19}
      title="shadowqa-individual — zsh"
      lines={[
        { at: 4, cmd: "shadowqa-individual plan payments-client -o \"implement the retry policy we agreed\"" },
        { at: 80, out: <Row gap={10}><GeminiMark size={18} /><span style={{ color: c.dim }}>planning with gemini-2.5-flash · 64 messages · repo @ 3be0d1</span></Row> },
        { at: 104, out: <KV k="PLAN" v="pl_19ae  (awaiting approval)" /> },
        { at: 116, out: <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: 21 }}>{"\n"}  Retry timeouts and 5xx only, 3 attempts, jittered backoff; never 4xx.{"\n"}</span> },
        { at: 130, out: <span>  ◇ Replace the 5× any-failure loop in PaymentClient with a policy object</span> },
        { at: 140, out: <span>  ◇ Add tests: 4xx returns immediately; 3rd timeout surfaces the error</span> },
        { at: 156, out: <KV k="QUESTION" v={<span style={{ color: c.bad }}>? ChatGPT draft retried on any failure — superseded by the Claude decision (msg 14)?</span>} /> },
        { at: 172, out: <KV k="SOURCE" v={<Row gap={8}><ClaudeMark size={14} /><span>claude.ai · conversation 8c2d · message 14</span></Row>} /> },
        { at: 182, out: <KV k="SOURCE" v={<Row gap={8}><OpenAIMark size={14} /><span>chatgpt.com · conversation 41aa · message 6</span></Row>} /> },
      ]}
    />
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
    <Terminal
      width={1240}
      height={420}
      title="shadowqa-individual — zsh"
      lines={[
        { at: 4, cmd: "shadowqa-individual task 5b02" },
        { at: 40, out: <KV k="STATE" v={<span style={{ color: c.good }}>verified</span>} /> },
        { at: 52, out: <Row gap={16}><Status ok label="check · 18 passing · 6.2s" size={22} /></Row> },
        { at: 68, out: <KV k="BRANCH" v="shadowqa/retry-policy (a4d2e0f1)" /> },
        { at: 90, cmd: "shadowqa-individual watch payments-client" },
        { at: 130, out: <span>{ok}Watching saved files in ~/src/payments-client. Checks run after 8 seconds of quiet.</span> },
      ]}
    />
  </Beat>
);
