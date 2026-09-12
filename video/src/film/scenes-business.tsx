import React from "react";
import { useCurrentFrame } from "remotion";
import { Beat } from "./beat";
import { Row, Col, Rise, Between, Label, Mark, Arrow, Status } from "./ui";
import { Terminal, KV, Slack, PullRequest, Editor, Code } from "./windows";
import { Brand, GeminiMark, OpenCodeMark, SlackMark, GitHubMark } from "./marks";
import { c } from "../theme";
import { serifFamily, sansFamily } from "../fonts";

const CH = { index: "02", title: "For teams" };
const OK = (_v: string) => <span style={{ color: c.good }}>✓ </span>;

/* 06 Connect Slack */
export const SetupSlack: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Connect Slack.">
    <Row gap={60}>
      <Terminal
        width={1000}
        height={520}
        lines={[
          { at: 6, cmd: "shadowqa setup --step slack" },
          { at: 46, out: <span>{"\n  "}<Mark size={16} /> <b style={{ fontWeight: 500 }}>SHADOWQA</b><span style={{ color: c.dim }}>  observe → plan → verify → repair</span></span> },
          { at: 64, out: <span>{OK("")}Connected as mara in Acme Engineering.</span>, tone: "ink" },
          { at: 78, out: <KV k="CHANNELS" v="14 joined" /> },
          { at: 92, out: <KV k="OBSERVING" v="#checkout" /> },
          { at: 100, out: <KV k="OBSERVING" v="#incidents" /> },
          { at: 108, out: <KV k="OBSERVING" v="#engineering" /> },
        ]}
      />
      <Rise delay={20}>
        <SlackMark size={140} />
      </Rise>
    </Row>
  </Beat>
);

/* 07 Connect GitHub */
export const SetupGitHub: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Connect GitHub.">
    <Row gap={60}>
      <Terminal
        width={1000}
        height={520}
        lines={[
          { at: 6, cmd: "shadowqa setup --step github" },
          { at: 52, out: <span>{OK("")}Authenticated as GitHub App shadowqa-acme.</span> },
          { at: 70, out: <KV k="REPOSITORY" v="acme/checkout" /> },
          { at: 82, out: <KV k="DEFAULT BRANCH" v="main" /> },
          { at: 94, out: <KV k="CLONE" v="~/src/checkout" /> },
          { at: 112, out: <span>{OK("")}Repository acme/checkout verified at ~/src/checkout.</span> },
        ]}
      />
      <Rise delay={20}>
        <GitHubMark size={140} />
      </Rise>
    </Row>
  </Beat>
);

/* 08 Mode */
const MODES: [string, string][] = [
  ["observe", "Watch and check only. ShadowQA never edits or publishes."],
  ["approval", "Ask first. Every plan and every repair waits for you."],
  ["auto-fix", "Bounded automatic repair inside configured automatic paths; humans still merge."],
  ["full-auto", "Same bounded scope plus policy-gated merging. Requires an explicit merge policy."],
];
export const SetupMode: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const pick = frame < 70 ? -1 : frame < 100 ? 1 : frame < 130 ? 3 : 1;
  return (
    <Beat
      duration={duration}
      chapter={CH}
      sentence={[
        { from: 0, text: "Choose how much it may do on its own." },
        { from: 105, text: "Ask for approval, or let it run full-auto.", emphasis: ["full-auto"] },
      ]}
    >
      <Terminal
        width={1240}
        height={520}
        lines={[
          { at: 6, cmd: "shadowqa setup --step mode" },
          ...MODES.map(([m, help], i) => ({
            at: 44 + i * 8,
            out: (
              <ModeRow key={m} name={m} help={help} active={pick === i} />
            ),
          })),
          { at: 150, out: <span style={{ color: c.dim }}>{"\n"}  MODE              <span style={{ color: c.offwhite }}>approval - Ask first. Every plan and every repair waits for you.</span></span> },
        ]}
      />
    </Beat>
  );
};
const ModeRow: React.FC<{ name: string; help: string; active: boolean }> = ({ name, help, active }) => (
  <span style={{ display: "block", padding: "2px 10px", margin: "0 -10px", background: active ? "rgba(244,241,234,0.1)" : "transparent", borderRadius: 4 }}>
    <span style={{ color: active ? c.offwhite : c.dim }}>{active ? "◈ " : "◇ "}</span>
    <span style={{ color: c.offwhite, display: "inline-block", width: 130 }}>{name}</span>
    <span style={{ color: c.dim }}>{help}</span>
  </span>
);

/* 09 Watching: Slack + PR events flow into the context store. */
export const Watching: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const docs = Math.min(212, Math.floor(Math.max(0, frame - 30) * 1.9));
  return (
    <Beat
      duration={duration}
      chapter={CH}
      sentence={[
        { from: 0, text: "ShadowQA is watching." },
        { from: 120, text: "Every thread and every pull request becomes context, with its source." },
      ]}
    >
      <div style={{ position: "relative", width: 1680, height: 640 }}>
        <div style={{ position: "absolute", left: 0, top: 0 }}>
          <Slack
            width={720}
            height={420}
            delay={2}
            channels={["checkout", "incidents"]}
            messages={[
              { who: "Mara", at: "10:12", text: "Retry: opt-in per merchant. Default off.", delay: 10 },
              { who: "Priya", at: "10:15", text: "No retries on 4xx — only timeouts.", delay: 26 },
              { who: "Dev", at: "10:20", text: "PR is up: #412", delay: 42 },
            ]}
          />
        </div>
        <div style={{ position: "absolute", left: 0, top: 452 }}>
          <PullRequest width={720} height={188} delay={12} title="Retry failed payments" body={<span style={{ fontSize: 15 }}>Retries up to 3× on any non-200. Enabled by default.</span>} />
        </div>
        <svg style={{ position: "absolute", left: 0, top: 0 }} width={1680} height={640}>
          <Arrow x1={740} y1={210} x2={1010} y2={300} delay={40} />
          <Arrow x1={740} y1={540} x2={1010} y2={360} delay={56} />
        </svg>
        <div style={{ position: "absolute", left: 1030, top: 150, width: 650, height: 360, border: `1px solid rgba(244,241,234,0.28)`, borderRadius: 12, padding: "26px 30px", background: c.charcoalLift }}>
          <Label size={14}>context · acme/checkout</Label>
          <div style={{ fontFamily: serifFamily, fontSize: 96, lineHeight: 1, marginTop: 20, color: c.offwhite, fontVariantNumeric: "tabular-nums" }}>{docs}</div>
          <div style={{ fontSize: 18, color: c.dim, marginTop: 4 }}>source documents</div>
          <Col gap={10} style={{ marginTop: 26, fontSize: 17 }}>
            <Between from={70}><Row gap={12}><SlackMark size={16} /><span>#checkout · 10:12 · Mara</span><span style={{ color: c.faint, marginLeft: "auto" }}>revision 3</span></Row></Between>
            <Between from={84}><Row gap={12}><SlackMark size={16} /><span>#checkout · 10:15 · Priya</span><span style={{ color: c.faint, marginLeft: "auto" }}>revision 3</span></Row></Between>
            <Between from={98}><Row gap={12}><GitHubMark size={16} /><span>PR #412 · description · 3 commits</span><span style={{ color: c.faint, marginLeft: "auto" }}>sha 9f1c2ae</span></Row></Between>
          </Col>
        </div>
      </div>
    </Beat>
  );
};

/* 10 Ask for a plan */
export const Compile: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="When you are ready, ask for a plan.">
    <Terminal
      width={1240}
      height={420}
      lines={[
        { at: 6, cmd: "shadowqa compile checkout --objective \"ship the payment retry as agreed\"" },
        { at: 90, out: <KV k="CONTEXT" v="212 source documents · 7 retrieved" /> },
        { at: 104, out: <KV k="REPOSITORY" v="acme/checkout @ 9f1c2ae" /> },
        { at: 118, out: <Row gap={10}><GeminiMark size={18} /><span style={{ color: c.dim }}>planning with gemini-2.5-flash …</span></Row> },
      ]}
    />
  </Beat>
);

/* 11 The plan */
export const PlanView: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat
    duration={duration}
    chapter={CH}
    sentence={[
      { from: 0, text: "Gemini plans from the real conversation, not a guess." },
      { from: 130, text: "Every step cites the message or the pull request it came from." },
    ]}
  >
    <Terminal
      width={1440}
      height={730}
      fontSize={18}
      title="shadowqa — plan"
      lines={[
        { at: 0, out: <span>{"  "}<Mark size={14} /> <b style={{ fontWeight: 500 }}>SHADOWQA</b><span style={{ color: c.dim }}>  observe → plan → verify → repair</span></span> },
        { at: 8, out: <KV k="PLAN" v="pl_7f3a1c" /> },
        { at: 14, out: <KV k="STATE" v="awaiting approval" /> },
        { at: 20, out: <KV k="BASE" v="9f1c2ae" /> },
        { at: 32, out: <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: 21 }}>{"\n"}  Make payment retry opt-in per merchant, default off, timeouts only.{"\n"}</span> },
        { at: 48, out: <span>  ◇ Add merchant flag <span style={{ color: c.dim }}>retry_payments</span> (default false) to settings schema</span> },
        { at: 58, out: <span>  ◇ Gate PaymentClient.retry() on the flag <span style={{ color: c.dim }}>[after 1]</span></span> },
        { at: 68, out: <span>  ◇ Retry only on timeout / 5xx; never on 4xx <span style={{ color: c.dim }}>[after 2]</span></span> },
        { at: 78, out: <span>  ◇ Regression test: 4xx is not retried; default is off</span> },
        { at: 96, out: <KV k="ACCEPTANCE" v={<span><span style={{ color: c.good }}>✓</span> npm test passes with the new regression test</span>} /> },
        { at: 108, out: <KV k="REGRESSION" v="baseline checks at 9f1c2ae compared after the change" /> },
        { at: 136, out: <KV k="CONFIRMED SOURCE" v={<Row gap={8}><SlackMark size={14} /><span>slack://acme/checkout/p1718012345 @ revision 3</span></Row>} /> },
        { at: 148, out: <KV k="CONFIRMED SOURCE" v={<Row gap={8}><SlackMark size={14} /><span>slack://acme/checkout/p1718012501 @ revision 3</span></Row>} /> },
        { at: 160, out: <KV k="SOURCE" v={<Row gap={8}><GitHubMark size={14} /><span>github.com/acme/checkout/pull/412 @ 9f1c2ae</span></Row>} /> },
      ]}
    />
  </Beat>
);

/* 12 Approve */
export const Approve: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Approve this exact plan — or, in full-auto, it has already started.">
    <Terminal
      width={1240}
      height={380}
      lines={[
        { at: 6, cmd: "shadowqa approve pl_7f3a1c" },
        { at: 52, out: <span style={{ color: c.dim }}>  Approve this exact plan, its base and command profile? [y/N] <span style={{ color: c.offwhite }}>y</span></span> },
        { at: 76, out: <span><span style={{ color: c.good }}>  ✓ </span>Approved. Job 4c1e… queued for runner acme-runner-1.</span> },
        { at: 92, out: <KV k="DIGEST" v="sha256:6b0e…a91f  (plan is frozen)" /> },
      ]}
    />
  </Beat>
);

/* 13 Execute in the IDE through OpenCode */
const DIFF = `--- a/src/payments/client.ts
+++ b/src/payments/client.ts
@@ -41,9 +41,14 @@ export class PaymentClient {
-  async retry(intent: Intent) {
-    for (let i = 0; i < 3; i++) {
-      const r = await this.send(intent);
-      if (r.ok) return r;
-    }
+  async retry(intent: Intent) {
+    if (!this.merchant.flags.retry_payments) return this.send(intent);
+    for (let i = 0; i < 3; i++) {
+      const r = await this.send(intent);
+      if (r.ok) return r;
+      if (r.status < 500 && !r.timedOut) return r;   // never retry 4xx
+    }
+    return this.send(intent);
   }`;
export const Execute: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat
    duration={duration}
    chapter={CH}
    sentence={[
      { from: 0, text: "OpenCode executes the plan in an isolated sandbox, inside your IDE." },
      { from: 150, text: "The session is attached to your terminal; you can watch or step in." },
    ]}
  >
    <Editor
      files={["client.ts", "settings.ts", "client.test.ts"]}
      title="Visual Studio Code — acme/checkout"
      side={
        <Col gap={6}>
          <Row gap={8}><OpenCodeMark size={16} /><span style={{ color: c.dim }}>opencode attach · job 4c1e</span></Row>
          <Between from={20}><span style={{ color: c.dim }}>▸ read src/payments/client.ts</span></Between>
          <Between from={44}><span style={{ color: c.dim }}>▸ read src/settings.ts</span></Between>
          <Between from={70}><span>▸ edit client.ts <span style={{ color: c.good }}>+7</span> <span style={{ color: c.bad }}>−5</span></span></Between>
          <Between from={100}><span>▸ edit settings.ts <span style={{ color: c.good }}>+3</span></span></Between>
          <Between from={126}><span>▸ write client.test.ts <span style={{ color: c.good }}>+18</span></span></Between>
          <Between from={160}><span style={{ color: c.dim }}>▸ run npm test</span></Between>
          <Between from={196}><span><span style={{ color: c.good }}>✓</span> 41 passing</span></Between>
        </Col>
      }
    >
      <Code code={DIFF} lang="diff" fontSize={18} reveal={{ start: 60, lps: 0.32 }} />
    </Editor>
  </Beat>
);

/* 14 Verified */
export const Verified: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Code done. Then ShadowQA verifies it independently, in a clean container.">
    <Terminal
      width={1240}
      height={460}
      title="shadowqa — job 4c1e"
      lines={[
        { at: 4, cmd: "shadowqa logs 4c1e" },
        { at: 40, out: <KV k="preparing" v="fresh clone at 9f1c2ae · profile node-v1" /> },
        { at: 54, out: <KV k="running" v="opencode session complete · 3 files changed" /> },
        { at: 70, out: <KV k="verifying" v="baseline checks vs. patched checks (isolated)" /> },
        { at: 96, out: <Row gap={16}><Status ok label="lint" size={22} /><Status ok label="unit · 41 passing" size={22} delay={10} /><Status ok label="regression · 4xx not retried" size={22} delay={20} /></Row> },
        { at: 130, out: <KV k="ready_to_publish" v="patch frozen · sha256:6b0e…a91f" /> },
        { at: 146, out: <span><span style={{ color: c.good }}>  ✓ </span>Pull request opened: github.com/acme/checkout/pull/413</span> },
      ]}
    />
  </Beat>
);

/* 15 Findings + repair */
export const FindingsRepair: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat
    duration={duration}
    chapter={CH}
    sentence={[
      { from: 0, text: "Then it keeps looking." },
      { from: 90, text: "When a check breaks, it reproduces the failure and repairs it — under the same rules." },
    ]}
  >
    <Terminal
      width={1440}
      height={540}
      fontSize={19}
      lines={[
        { at: 4, cmd: "shadowqa findings" },
        { at: 40, out: <span style={{ color: c.dim }}>{"     ID          PROJECT   RULE          STATE   CLASSIFICATION  SEEN"}</span> },
        { at: 48, out: <span>  ◇  f_2a91c0    checkout  unit          open    <span style={{ color: c.bad }}>regression</span>      2</span> },
        { at: 56, out: <span>  ◇  f_88d1e4    checkout  e2e           open    reproduced      3</span> },
        { at: 100, cmd: "shadowqa repair f_2a91c0" },
        { at: 150, out: <KV k="PLAN" v="pl_c31d09  (repair · attempt 1 of 2 · cooldown 30m)" /> },
        { at: 162, out: <span>  ◇ Reproduce unit failure at 9f1c2ae before changing anything</span> },
        { at: 172, out: <span>  ◇ Fix the null merchant flag read in PaymentClient.retry</span> },
        { at: 182, out: <span>  ◇ Do not remove or weaken any check</span> },
        { at: 210, out: <Row gap={16}><Status ok label="reproduced" size={22} /><Status ok label="repaired · 41 passing" size={22} delay={14} /></Row> },
      ]}
    />
  </Beat>
);

export { Brand };
