import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Beat, Statement } from "./beat";
import { Frame, Wordmark, Label, Row, Between, Rise } from "./ui";
import { Slack, PullRequest, Chat } from "./windows";
import { ClaudeMark, OpenAIMark, Brand } from "./marks";
import { c } from "../theme";
import { serifFamily } from "../fonts";

const CH = { index: "01", title: "The problem" };

/** Open: mark, wordmark, one line. */
export const Open: React.FC<{ duration: number }> = ({ duration }) => (
  <Frame duration={duration} tone="light" fadeIn={18}>
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
      <Wordmark size={64} delay={6} />
      <Label delay={30} size={18}>observe → plan → verify → repair</Label>
    </AbsoluteFill>
  </Frame>
);

/** Slack is where the decision is made. */
export const ProblemSlack: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} tone="light" chapter={CH} sentence="The decision is made in Slack.">
    <Slack
      delay={6}
      messages={[
        { who: "Mara", at: "10:12", text: "Payments retry: let's make it opt-in per merchant. Default off." },
        { who: "Dev", at: "10:14", text: "Agreed. Flag name retry_payments, default false. I'll open the PR." },
        { who: "Priya", at: "10:15", text: "And no retries on 4xx — only on timeouts." },
      ]}
    />
  </Beat>
);

/** The PR ships something else. */
export const ProblemPR: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} tone="light" chapter={CH} sentence="The code ships something else.">
    <PullRequest
      delay={6}
      title="Retry failed payments"
      body={
        <>
          Adds automatic retry for failed payment intents.
          <br />
          Retries up to 3× on any non-200 response. <span style={{ color: c.faint }}>Enabled by default.</span>
        </>
      }
      checks={[
        { name: "lint", ok: true },
        { name: "unit", ok: true },
        { name: "e2e", ok: true },
      ]}
    />
  </Beat>
);

/** Side by side; the two disagree, and nothing says so. */
export const ProblemDrift: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <Beat duration={duration} tone="light" chapter={CH} sentence="Nobody notices the drift until it is in production." emphasis={["drift"]}>
      <Row gap={40} align="flex-start">
        <Card delay={4} title="# checkout · Slack">
          <Quote>“opt-in per merchant. Default off.”</Quote>
          <Quote>“no retries on 4xx”</Quote>
        </Card>
        <div style={{ width: 120, display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
          <Between from={34}>
            <span style={{ fontSize: 96, color: c.bad, fontFamily: serifFamily, lineHeight: 1, opacity: frame > 34 ? 1 : 0 }}>✕</span>
          </Between>
        </div>
        <Card delay={14} title="PR #412 · GitHub">
          <Quote>“Enabled by default.”</Quote>
          <Quote>“Retries on any non-200.”</Quote>
        </Card>
      </Row>
    </Beat>
  );
};

/** The individual version of the same problem. */
export const ProblemChats: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} tone="light" chapter={CH} sentence="Your Claude and your ChatGPT have never met.">
    <Row gap={60} align="flex-start">
      <Chat
        product="claude"
        delay={4}
        mark={<ClaudeMark size={14} color={c.faint} />}
        turns={[
          { who: "you", text: "Design the retry policy for our payment client." },
          { who: "ai", text: "Retry only on timeouts and 5xx. Cap at 3 attempts with jittered backoff. Never retry 4xx." },
        ]}
      />
      <div style={{ width: 90, display: "flex", alignItems: "center", justifyContent: "center", height: 560 }}>
        <Between from={40}>
          <span style={{ fontSize: 60, color: c.faint, fontFamily: serifFamily }}>?</span>
        </Between>
      </div>
      <Chat
        product="chatgpt"
        delay={14}
        mark={<OpenAIMark size={14} color={c.faint} />}
        turns={[
          { who: "you", text: "Write the payment client retry loop.", delay: 24 },
          { who: "ai", text: "Here's a loop that retries any failed request up to 5 times…", delay: 40 },
        ]}
      />
    </Row>
  </Beat>
);

/** Where the context lives, and where it doesn't. */
export const ProblemPlaces: React.FC<{ duration: number }> = ({ duration }) => (
  <Beat duration={duration} tone="light" chapter={CH} sentence="Context lives in five places. Your code sees none of it.">
    <Row gap={54} justify="center" style={{ width: "100%", marginTop: 20 }}>
      {(["slack", "github", "claude", "chatgpt", "claude-code"] as const).map((w, i) => (
        <Rise key={w} delay={8 + i * 7}>
          <Brand which={w} size={44} />
        </Rise>
      ))}
    </Row>
  </Beat>
);

export const Turn: React.FC<{ duration: number }> = ({ duration }) => (
  <Statement duration={duration} tone="dark" text="ShadowQA watches where you already work, and turns it into verified code." emphasis={["verified"]} size={70} />
);

/* helpers */
const Card: React.FC<{ children: React.ReactNode; title: string; delay?: number }> = ({ children, title, delay = 0 }) => (
  <Rise delay={delay}>
    <div style={{ width: 560, border: `1px solid rgba(28,28,28,0.2)`, borderRadius: 10, padding: "22px 26px", background: c.offwhiteLift }}>
      <Label size={14} style={{ marginBottom: 14 }}>{title}</Label>
      {children}
    </div>
  </Rise>
);
const Quote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: serifFamily, fontSize: 30, lineHeight: 1.3, color: c.charcoal, marginBottom: 10 }}>{children}</div>
);
