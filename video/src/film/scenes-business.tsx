import React from "react";
import { useCurrentFrame } from "remotion";
import { Beat } from "./beat";
import { Row, Col, Rise, Between, Label, Arrow, Status } from "./ui";
import { Slack, PullRequest, Editor, Code, DesktopApp, AppCard, AppBadge, AppButton, AppLabel } from "./windows";
import { Brand, GeminiMark, OpenCodeMark, SlackMark, GitHubMark } from "./marks";
import { c } from "../theme";
import { serifFamily } from "../fonts";

const CH = { index: "02", title: "For teams" };

/* 06 Connect Slack */
export const SetupSlack: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Connect Slack — from the app, in your browser.">
    <Row gap={60}>
      <DesktopApp width={900} height={520}>
        <AppLabel>Team setup</AppLabel>
        <div style={{ fontFamily: serifFamily, fontSize: 26, marginBottom: 18 }}>Slack</div>
        <AppCard delay={30}>
          <Row gap={10}>
            <AppBadge tone="good">connected</AppBadge>
            <span style={{ fontSize: 16 }}>mara in Acme Engineering</span>
          </Row>
        </AppCard>
        <AppLabel>
          <span style={{ marginTop: 18, display: "block" }}>Channels the bot has joined — pick which ones ShadowQA observes:</span>
        </AppLabel>
        <Col gap={10} style={{ fontSize: 16 }}>
          <Between from={52}><Row gap={10}>☑ <span>#checkout</span></Row></Between>
          <Between from={64}><Row gap={10}>☑ <span>#incidents</span></Row></Between>
          <Between from={76}><Row gap={10}>☑ <span>#engineering</span></Row></Between>
        </Col>
      </DesktopApp>
      <Rise delay={20}>
        <SlackMark size={140} />
      </Rise>
    </Row>
  </Beat>
);

/* 07 Connect GitHub */
export const SetupGitHub: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Connect GitHub — no private key to download by hand.">
    <Row gap={60}>
      <DesktopApp width={900} height={520}>
        <AppLabel>Team setup</AppLabel>
        <div style={{ fontFamily: serifFamily, fontSize: 26, marginBottom: 18 }}>GitHub</div>
        <AppCard delay={26}>
          <Row gap={10}>
            <AppBadge tone="good">verified</AppBadge>
            <span style={{ fontSize: 16 }}>acme/checkout</span>
          </Row>
        </AppCard>
        <Col gap={10} style={{ marginTop: 18, fontSize: 16 }}>
          <Between from={50}><Row gap={12}><span style={{ color: c.dim }}>Default branch</span><span>main</span></Row></Between>
          <Between from={64}><Row gap={12}><span style={{ color: c.dim }}>Local clone</span><span>~/src/checkout</span></Row></Between>
          <Between from={80}><Row gap={12}><span style={{ color: c.good }}>✓</span><span>Repository verified at ~/src/checkout</span></Row></Between>
        </Col>
      </DesktopApp>
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
      <DesktopApp width={1100} height={520}>
        <AppLabel>Automation mode</AppLabel>
        <Col gap={8} style={{ marginTop: 10 }}>
          {MODES.map(([m, help], i) => (
            <ModeRow key={m} name={m} help={help} active={pick === i} />
          ))}
        </Col>
      </DesktopApp>
    </Beat>
  );
};
const ModeRow: React.FC<{ name: string; help: string; active: boolean }> = ({ name, help, active }) => (
  <span style={{ display: "block", padding: "10px 14px", margin: "0 -14px", background: active ? "rgba(244,241,234,0.1)" : "transparent", borderRadius: 8 }}>
    <span style={{ display: "inline-block", width: 130, fontWeight: active ? 600 : 400 }}>{name}</span>
    <span style={{ color: c.dim, fontSize: 15 }}>{help}</span>
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
  <Beat duration={duration} chapter={CH} sentence="When you are ready, one button asks for a plan.">
    <DesktopApp width={1200} height={420} tab="Watching">
      <div style={{ fontFamily: serifFamily, fontSize: 24, marginBottom: 6 }}>ShadowQA is watching.</div>
      <AppLabel>212 source documents · acme/checkout @ 9f1c2ae</AppLabel>
      <AppCard delay={20} style={{ marginTop: 16 }}>
        <Row gap={16} style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>checkout</div>
            <span style={{ color: c.dim, fontSize: 14 }}>approval</span>
          </div>
          <AppButton delay={50}>Generate plan</AppButton>
        </Row>
      </AppCard>
      <Between from={90}>
        <Row gap={10} style={{ marginTop: 20 }}>
          <GeminiMark size={18} />
          <span style={{ color: c.dim }}>planning with gemini-2.5-flash …</span>
        </Row>
      </Between>
    </DesktopApp>
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
    <DesktopApp width={1440} height={730} tab="Plans">
      <Row gap={16} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: serifFamily, fontSize: 26, marginBottom: 6 }}>Make payment retry opt-in per merchant, default off, timeouts only.</div>
          <span style={{ color: c.dim, fontSize: 14 }}>Base 9f1c2ae · digest 6b0e…a91f</span>
        </div>
        <AppBadge>awaiting approval</AppBadge>
      </Row>
      <Row gap={20} style={{ marginTop: 22, alignItems: "flex-start" }}>
        <AppCard delay={20} style={{ flex: 1 }}>
          <AppLabel>Steps</AppLabel>
          <Col gap={10} style={{ fontSize: 16 }}>
            <Between from={40}><span>◇ Add merchant flag <span style={{ color: c.dim }}>retry_payments</span> (default false) to settings schema</span></Between>
            <Between from={54}><span>◇ Gate PaymentClient.retry() on the flag</span></Between>
            <Between from={68}><span>◇ Retry only on timeout / 5xx; never on 4xx</span></Between>
            <Between from={82}><span>◇ Regression test: 4xx is not retried; default is off</span></Between>
          </Col>
        </AppCard>
        <Col gap={16} style={{ width: 420 }}>
          <AppCard delay={40}>
            <AppLabel>Acceptance</AppLabel>
            <Between from={96}><span style={{ fontSize: 16 }}><span style={{ color: c.good }}>✓</span> npm test passes with the new regression test</span></Between>
          </AppCard>
          <AppCard delay={60}>
            <AppLabel>Sources</AppLabel>
            <Col gap={8} style={{ fontSize: 15 }}>
              <Between from={130}><Row gap={8}><SlackMark size={14} /><span>#checkout @ revision 3</span></Row></Between>
              <Between from={144}><Row gap={8}><SlackMark size={14} /><span>#checkout @ revision 3</span></Row></Between>
              <Between from={158}><Row gap={8}><GitHubMark size={14} /><span>PR #412 @ 9f1c2ae</span></Row></Between>
            </Col>
          </AppCard>
        </Col>
      </Row>
    </DesktopApp>
  </Beat>
);

/* 12 Approve */
export const Approve: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Approve this exact plan — or, in full-auto, it has already started.">
    <DesktopApp width={1200} height={380} tab="Plans">
      <Row gap={16} style={{ justifyContent: "space-between" }}>
        <div style={{ fontFamily: serifFamily, fontSize: 22 }}>Make payment retry opt-in per merchant</div>
        <AppBadge>awaiting approval</AppBadge>
      </Row>
      <AppLabel><span style={{ marginTop: 8, display: "block" }}>Base 9f1c2ae · digest sha256:6b0e…a91f (frozen once approved)</span></AppLabel>
      <Row gap={14} style={{ marginTop: 30 }}>
        <AppButton delay={30}>Approve &amp; launch agent</AppButton>
        <AppButton delay={40} primary={false}>Reject</AppButton>
      </Row>
      <Between from={70}>
        <Row gap={10} style={{ marginTop: 26 }}>
          <span style={{ color: c.good }}>✓</span>
          <span>Approved. Job 4c1e… queued for runner acme-runner-1.</span>
        </Row>
      </Between>
    </DesktopApp>
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
      { from: 150, text: "Open its job in the app any time to watch or step in." },
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
    <DesktopApp width={1200} height={460} tab="Jobs">
      <Row gap={16} style={{ justifyContent: "space-between" }}>
        <div style={{ fontFamily: serifFamily, fontSize: 22 }}>Job 4c1e…</div>
        <AppBadge tone="good">ready</AppBadge>
      </Row>
      <Col gap={10} style={{ marginTop: 18, fontSize: 16 }}>
        <Between from={20}><span style={{ color: c.dim }}>fresh clone at 9f1c2ae · profile node-v1</span></Between>
        <Between from={34}><span style={{ color: c.dim }}>opencode session complete · 3 files changed</span></Between>
        <Between from={48}><span style={{ color: c.dim }}>baseline checks vs. patched checks (isolated)</span></Between>
      </Col>
      <Between from={70}>
        <Row gap={16} style={{ marginTop: 20 }}>
          <Status ok label="lint" size={22} />
          <Status ok label="unit · 41 passing" size={22} delay={10} />
          <Status ok label="regression · 4xx not retried" size={22} delay={20} />
        </Row>
      </Between>
      <Between from={126}>
        <Row gap={14} style={{ marginTop: 24 }}>
          <AppButton>Open pull request</AppButton>
          <span style={{ color: c.good }}>✓ github.com/acme/checkout/pull/413</span>
        </Row>
      </Between>
    </DesktopApp>
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
    <DesktopApp width={1440} height={540} tab="Findings">
      <Col gap={12}>
        <Between from={20}>
          <AppCard>
            <Row gap={16} style={{ justifyContent: "space-between" }}>
              <Row gap={14}><span>unit</span><AppBadge tone="bad">regression</AppBadge></Row>
              <span style={{ color: c.dim }}>seen 2×</span>
            </Row>
          </AppCard>
        </Between>
        <Between from={32}>
          <AppCard>
            <Row gap={16} style={{ justifyContent: "space-between" }}>
              <Row gap={14}><span>e2e</span><AppBadge>reproduced</AppBadge></Row>
              <Row gap={14}><span style={{ color: c.dim }}>seen 3×</span><AppButton delay={0}>Repair</AppButton></Row>
            </Row>
          </AppCard>
        </Between>
      </Col>
      <Between from={110}>
        <AppCard delay={0} style={{ marginTop: 20 }}>
          <AppLabel>Repair plan · attempt 1 of 2 · cooldown 30m</AppLabel>
          <Col gap={8} style={{ fontSize: 16 }}>
            <Between from={130}><span>◇ Reproduce unit failure at 9f1c2ae before changing anything</span></Between>
            <Between from={142}><span>◇ Fix the null merchant flag read in PaymentClient.retry</span></Between>
            <Between from={154}><span>◇ Do not remove or weaken any check</span></Between>
          </Col>
          <Between from={180}>
            <Row gap={16} style={{ marginTop: 16 }}>
              <Status ok label="reproduced" size={22} />
              <Status ok label="repaired · 41 passing" size={22} delay={14} />
            </Row>
          </Between>
        </AppCard>
      </Between>
    </DesktopApp>
  </Beat>
);

export { Brand };
