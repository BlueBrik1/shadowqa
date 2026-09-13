import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Beat, Statement } from "./beat";
import { Row, Col, Between, Status, Label, Frame, Wordmark, Rise, Text } from "./ui";
import { Browser, StoreCheckout, LiveCard, Cursor, Editor, Code, DesktopApp, AppCard, AppBadge } from "./windows";
import { ClaudeMark, OpenAIMark, Brand } from "./marks";
import { c } from "../theme";
import { snippet } from "../generated/source";
import { serifFamily, sansFamily } from "../fonts";

const CH = { index: "04", title: "Live" };

export const LiveIntro: React.FC<{ duration: number }> = ({ duration }) => (
  <Statement duration={duration} tone="light" text="Plans and checks cover the code. ShadowQA Live covers the running app." emphasis={["Live"]} size={68} sub="new · the desktop app's Live tab" />
);

/* 24 Something breaks */
export const LiveBreak: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <Beat duration={duration} chapter={CH} sentence={[{ from: 0, text: "Your app is running. You click Pay." }, { from: 96, text: "It breaks." }]}>
      <div style={{ position: "relative" }}>
        <Browser delay={2}>
          <StoreCheckout error={frame > 92 ? "TypeError: Cannot read properties of undefined (reading 'total')" : undefined} />
        </Browser>
        <Cursor x={208} y={520} clickAt={84} start={20} from={{ x: 700, y: 640 }} />
      </div>
    </Beat>
  );
};

/* 25 Live saw everything */
export const LiveCapture: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={CH} sentence="Live saw the click, the request and the exception — and joined them into one incident.">
    <div style={{ position: "relative" }}>
      <Browser delay={0}>
        <StoreCheckout error="TypeError: Cannot read properties of undefined (reading 'total')" />
        <LiveCard
          delay={14}
          status="captured"
          title="Pay button throws on /checkout"
          rows={[
            ["chain", <span>click <i>Pay</i> → POST /api/demo/payment → 500 → TypeError in Checkout.jsx:42</span>],
            ["where", <span style={{ fontFamily: "Consolas, monospace", fontSize: 13 }}>frontend/src/demo/pages/Checkout.jsx:42 · backend/demo_store/router.py:254</span>],
            ["seen", "first time · not a regression"],
          ]}
        />
      </Browser>
    </div>
  </Beat>
);

/* 26 Diagnosis + patch */
const PATCH = `--- a/frontend/src/demo/pages/Checkout.jsx
+++ b/frontend/src/demo/pages/Checkout.jsx
@@ -39,7 +39,8 @@ export default function Checkout() {
-  const amount = order.total;
+  const amount = cart.total ?? sumLines(cart.items);
   const res = await pay({ amount, currency: "USD", items, customer, card });
--- a/backend/demo_store/router.py
+++ b/backend/demo_store/router.py
@@ -252,3 +252,3 @@ async def create_payment(
-    return {"transactionId": txn_id, "orderId": order_id}
+    return {"transactionId": txn_id, "orderId": order_id, "amount": order["amount"]}`;
export const LiveDiagnose: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat
    duration={duration}
    chapter={CH}
    sentence={[
      { from: 0, text: "Claude diagnoses the root cause, with GPT as the fallback." },
      { from: 110, text: "A patch is proposed and risk-scored. Nothing is written yet." },
    ]}
  >
    <Editor
      files={["Checkout.jsx", "router.py"]}
      title="Visual Studio Code — lumen"
      sideTitle="ShadowQA Live · diagnosis"
      side={
        <Col gap={10}>
          <Row gap={8}><ClaudeMark size={16} /><span style={{ color: c.dim }}>claude-sonnet-4-6</span><span style={{ color: c.faint }}>→</span><OpenAIMark size={16} /><span style={{ color: c.dim }}>gpt-5.4</span></Row>
          <Between from={26}>
            <div style={{ fontFamily: sansFamily, fontSize: 16, lineHeight: 1.45 }}>
              <span style={{ color: c.dim }}>root cause · </span>
              Checkout reads <code>order.total</code>, but the payment response no longer includes the order; the amount must come from the cart.
            </div>
          </Between>
          <Between from={70}><span>confidence <b style={{ fontWeight: 500 }}>0.91</b></span></Between>
          <Between from={90}>
            <Col gap={4}>
              <span>risk <b style={{ fontWeight: 500, color: c.good }}>LOW</b></span>
              <span style={{ color: c.dim, fontSize: 15 }}>4 lines · 2 files · no auth, schema or config paths</span>
            </Col>
          </Between>
          <Between from={130}><span style={{ color: c.dim }}>awaiting approval · project mode: approval</span></Between>
        </Col>
      }
    >
      <Code code={PATCH} lang="diff" fontSize={17} reveal={{ start: 40, lps: 0.3 }} />
    </Editor>
  </Beat>
);

/* 27 Apply → validate → replay */
export const LiveReplay: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const phase = frame < 60 ? "applying" : frame < 100 ? "validating" : frame < 150 ? "replaying" : "verified";
  return (
    <Beat
      duration={duration}
      chapter={CH}
      sentence={[
        { from: 0, text: "Approve. Live applies the patch behind a checkpoint and runs your checks." },
        { from: 100, text: "Then it replays your exact click to prove the fix — or rolls back." },
      ]}
    >
      <div style={{ position: "relative" }}>
        <Browser delay={0}>
          <StoreCheckout fixed={phase === "verified"} error={phase === "applying" ? "TypeError: Cannot read properties of undefined (reading 'total')" : undefined} />
          <LiveCard
            status={phase}
            tone={phase === "verified" ? "good" : "ink"}
            title={phase === "verified" ? "Fixed and verified by replay" : "Pay button throws on /checkout"}
            rows={
              phase === "verified"
                ? [
                    ["validate", <span><span style={{ color: c.good }}>✓</span> eslint · <span style={{ color: c.good }}>✓</span> pytest · 3.1s</span>],
                    ["replay", <span><span style={{ color: c.good }}>✓</span> click Pay → 200 → order placed · 1.4s</span>],
                    ["total", "8.7s from failure to verified fix"],
                  ]
                : [
                    ["checkpoint", "2 files saved · rollback ready"],
                    ["step", <span style={{ textTransform: "capitalize" }}>{phase}…</span>],
                  ]
            }
            actions={phase === "verified" ? ["Open PR", "Undo"] : []}
          />
        </Browser>
        {phase === "replaying" ? <Cursor x={208} y={520} clickAt={128} start={102} from={{ x: 560, y: 600 }} /> : null}
      </div>
    </Beat>
  );
};

/* 28 One product */
export const LiveOne: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat
    duration={duration}
    chapter={CH}
    sentence={[
      { from: 0, text: "Runtime incidents sit beside failed checks in the same findings list." },
      { from: 110, text: "The project's mode decides what Live may do on its own. One product." },
    ]}
  >
    <DesktopApp width={1440} height={520} tab="Findings">
      <Col gap={12}>
        <Between from={20}>
          <AppCard>
            <Row gap={16} style={{ justifyContent: "space-between" }}>
              <Row gap={14}><span>◉ lumen · live:/checkout</span><AppBadge tone="good">resolved</AppBadge></Row>
              <span style={{ color: c.dim }}>repaired · seen 1×</span>
            </Row>
          </AppCard>
        </Between>
        <Between from={32}>
          <AppCard>
            <Row gap={16} style={{ justifyContent: "space-between" }}>
              <Row gap={14}><span>◇ checkout · unit</span><AppBadge>reproduced</AppBadge></Row>
              <span style={{ color: c.dim }}>seen 2×</span>
            </Row>
          </AppCard>
        </Between>
      </Col>
      <Between from={60}>
        <div style={{ color: c.dim, fontSize: 15, marginTop: 14 }}>◉ runtime incident from ShadowQA Live · ◇ check failure from a scan</div>
      </Between>
      <Between from={120}>
        <Row gap={10} style={{ marginTop: 26 }}>
          <span style={{ color: c.good }}>✓</span>
          <span>Branch pushed; PR requested — github.com/acme/lumen/pull/88 · verified by replay · risk LOW</span>
        </Row>
      </Between>
    </DesktopApp>
  </Beat>
);

/* Feature cards — one at a time */
const F = { index: "05", title: "Built in" };
export const FeatureIsolation: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={F} sentence="Every run happens in a locked-down container.">
    <CodeCard title="src/runner/sandbox.ts" code={snippet("isolation").code} lang="typescript" />
  </Beat>
);
export const FeatureNoWeakening: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={F} sentence="A repair may never delete or weaken a test.">
    <CodeCard title="src/policy/engine.ts" code={snippet("testWeakening").code} lang="typescript" />
  </Beat>
);
export const FeatureModes: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={F} sentence="One automation vocabulary, from planning to the running app.">
    <Col gap={36} align="stretch" style={{ width: 1400 }}>
      <CodeCard title="src/core/contracts.ts" code={snippet("modeEnum").code} lang="typescript" width={1400} />
      <CodeCard title="live/backend/shadowqa/config.py" code={snippet("modeToAutonomy").code} lang="python" width={1400} delay={12} />
    </Col>
  </Beat>
);
export const FeatureRisk: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={F} sentence="Live grades every patch; only LOW risk may ever apply on its own.">
    <CodeCard title="live/backend/shadowqa/risk.py" code={snippet("sensitivePaths").code} lang="python" />
  </Beat>
);
export const FeatureCited: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={F} sentence="A plan that cites a source that does not exist is rejected.">
    <CodeCard title="src/planner/planner.ts" code={snippet("citation").code} lang="typescript" />
  </Beat>
);
export const FeatureKill: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} chapter={F} sentence="And one switch stops everything.">
    <DesktopApp width={900} height={260}>
      <AppCard delay={20}>
        <Row gap={16} style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>Workspace</div>
            <span style={{ color: c.bad, fontSize: 15 }}>Paused — no new jobs will start.</span>
          </div>
          <AppBadge tone="bad">paused</AppBadge>
        </Row>
      </AppCard>
    </DesktopApp>
  </Beat>
);

const CodeCard: React.FC<{ title: string; code: string; lang: string; width?: number; delay?: number }> = ({ title, code, lang, width = 1400, delay = 0 }) => (
  <Rise delay={delay}>
    <div style={{ width, border: `1px solid rgba(244,241,234,0.2)`, borderRadius: 10, background: c.charcoalLift, padding: "18px 26px 22px" }}>
      <Label size={13} style={{ marginBottom: 12 }}>{title}</Label>
      <Code code={code} lang={lang} fontSize={22} reveal={{ start: 10 + delay, lps: 0.6 }} />
    </div>
  </Rise>
);

/* Close */
export const Close: React.FC<{ duration: number }> = ({ duration }) => (
  <Frame duration={duration} tone="light" fadeOut={24}>
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
      <Wordmark size={64} delay={4} />
      <Text delay={26} size={26} style={{ fontFamily: serifFamily, color: c.faint }}>Context-aware QA, from the first message to the running app.</Text>
      <Row gap={40} style={{ marginTop: 30 }}>
        {(["slack", "github", "gemini", "claude", "openai", "opencode", "codex"] as const).map((w, i) => (
          <Rise key={w} delay={40 + i * 5}><Brand which={w} size={26} /></Rise>
        ))}
      </Row>
      <Label delay={80} size={16} style={{ marginTop: 24 }}>github.com/BlueBrik1/shadowqa</Label>
    </AbsoluteFill>
  </Frame>
);

export { Status };
