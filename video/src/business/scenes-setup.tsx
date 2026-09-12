import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Backdrop,
  Row,
  Safe,
  Scene,
  SceneLabel,
  Stack,
} from "../components/Layout";
import { Body, Counter, Eyebrow, Kinetic } from "../components/Type";
import { Terminal, type TermLine } from "../components/Terminal";
import { CodeCard } from "../components/Code";
import { Panel, Pill, StatTile } from "../components/Surfaces";
import { Flow, SourceCard, type Edge, type Node } from "../components/Flow";
import { GitHubMark, SlackMark } from "../components/Marks";
import { snippet } from "../generated/source";
import { c, clamp, easeOut, enter, SOFT } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

const Header: React.FC<{
  step: string;
  title: string;
  note?: string;
  accent?: string;
}> = ({ step, title, note, accent = c.cyan }) => (
  <Stack gap={14} style={{ marginBottom: 30 }}>
    <Eyebrow delay={2} color={accent}>
      {step}
    </Eyebrow>
    <Kinetic text={title} delay={5} size={54} stagger={2} accent={accent} />
    {note ? (
      <Body delay={14} size={22} maxWidth={1100}>
        {note}
      </Body>
    ) : null}
  </Stack>
);

export const SetupSlack: React.FC<{ duration: number }> = ({ duration }) => {
  const lines: TermLine[] = [
    { kind: "prompt", text: "shadowqa setup", at: 2, cps: 22 },
    { kind: "banner", at: 24 },
    { kind: "out", text: "  1/4  SLACK", at: 32, color: c.cyan },
    {
      kind: "out",
      text: "  Socket Mode app with channels:history and chat:write. See infra/slack-manifest.json.",
      at: 38,
    },
    { kind: "spinner", text: "auth.test", at: 48, until: 72 },
    { kind: "ok", text: "Connected as shadowqa in T024BE7LH.", at: 74 },
    { kind: "label", label: "CHANNELS", value: "6 joined", at: 82 },
    {
      kind: "choice",
      text: "   1  #payments            C08PAY",
      at: 90,
      selected: true,
    },
    { kind: "choice", text: "   2  #design             C08DSG", at: 95 },
    {
      kind: "choice",
      text: "   3  #eng-frontend       C08EFE",
      at: 100,
      selected: true,
    },
    { kind: "choice", text: "   4  #random            C08RND", at: 105 },
    {
      kind: "prompt",
      text: "Numbers to observe, comma separated: 1,3",
      at: 116,
      cps: 30,
    },
    { kind: "label", label: "OBSERVING", value: "#payments", at: 150 },
    { kind: "label", label: "OBSERVING", value: "#eng-frontend", at: 158 },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.slack} />
      <SceneLabel index="02" title="connect slack" />
      <Safe>
        <Header
          step="Step 1 of 4"
          title="Slack, verified live."
          note="The wizard calls auth.test, then lists only the channels the bot actually joined."
          accent={c.slack}
        />
        <Row gap={40} align="flex-start">
          <Terminal lines={lines} delay={4} width={880} fontSize={19} />
          <Stack gap={20}>
            <CodeCard
              snippet={snippet("slackChannels")}
              delay={52}
              width={740}
              fontSize={15}
              revealPerLine={1.6}
              highlight={[11, 12, 13]}
              accent={c.slack}
            />
            <Row gap={10} style={{ flexWrap: "wrap", width: 740 }}>
              <Pill delay={120} color={c.dim}>
                no DM scopes
              </Pill>
              <Pill delay={126} color={c.dim}>
                no attachments
              </Pill>
              <Pill delay={132} color={c.dim}>
                one channel → one project
              </Pill>
            </Row>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const SetupGithub: React.FC<{ duration: number }> = ({ duration }) => {
  const lines: TermLine[] = [
    { kind: "out", text: "  2/4  GITHUB", at: 4, color: c.cyan },
    {
      kind: "out",
      text: "  A GitHub App you administer, installed on the repository ShadowQA may read.",
      at: 10,
    },
    { kind: "spinner", text: "GET /app", at: 20, until: 42 },
    { kind: "ok", text: "Authenticated as GitHub App shadowqa-local.", at: 44 },
    {
      kind: "choice",
      text: "   1  acme    installation 58213094",
      at: 54,
      selected: true,
    },
    { kind: "prompt", text: "Installation number: 1", at: 62, cps: 26 },
    {
      kind: "choice",
      text: "   1  acme/payments-ui   (private, main)",
      at: 82,
      selected: true,
    },
    {
      kind: "choice",
      text: "   2  acme/billing-api   (private, main)",
      at: 87,
    },
    { kind: "prompt", text: "Repository number: 1", at: 96, cps: 26 },
    {
      kind: "prompt",
      text: "Local clone folder for read-only planning: C:\\work\\payments-ui",
      at: 116,
      cps: 30,
    },
    {
      kind: "spinner",
      text: "git rev-parse --show-toplevel",
      at: 142,
      until: 160,
    },
    {
      kind: "ok",
      text: "Repository acme/payments-ui verified at C:\\work\\payments-ui.",
      at: 162,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.blue} />
      <SceneLabel index="03" title="connect github" />
      <Safe>
        <Header
          step="Step 2 of 4"
          title="GitHub, and the clone that proves it."
          note="ShadowQA refuses a folder whose origin does not match the repository you picked."
          accent={c.blue}
        />
        <Row gap={40} align="flex-start">
          <Terminal lines={lines} delay={2} width={880} fontSize={19} />
          <Stack gap={20}>
            <CodeCard
              snippet={snippet("verifyClone")}
              delay={40}
              width={740}
              fontSize={15}
              revealPerLine={1.6}
              highlight={[3, 4]}
              accent={c.blue}
            />
            <Row gap={10} style={{ flexWrap: "wrap", width: 740 }}>
              <Pill delay={130} color={c.dim}>
                read-only for planning
              </Pill>
              <Pill delay={136} color={c.dim}>
                write scope only at publish
              </Pill>
            </Row>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

const MODES = [
  {
    id: "observe",
    text: "Watch and check only. ShadowQA never edits or publishes.",
    color: c.dim,
  },
  {
    id: "approval",
    text: "Ask first. Every plan and every repair waits for you.",
    color: c.cyan,
  },
  {
    id: "auto-fix",
    text: "Bounded automatic repair inside configured automatic paths; humans still merge.",
    color: c.amber,
  },
  {
    id: "full-auto",
    text: "Same bounded scope plus policy-gated merging. Requires an explicit merge policy.",
    color: c.violet,
  },
];

export const SetupMode: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chosen = 1;
  const pick = frame >= 116;
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.violet} />
      <SceneLabel index="04" title="choose the leash" />
      <Safe>
        <Header
          step="Step 3 of 4"
          title="How much should ShadowQA do on its own?"
          note="Four modes, one enum, enforced in the policy engine — not a setting that only changes the copy."
          accent={c.violet}
        />
        <Row gap={22} align="stretch" style={{ marginTop: 8 }}>
          {MODES.map((mode, i) => {
            const p = enter(frame, fps, 24 + i * 7, SOFT);
            const active = pick && i === chosen;
            const dimmed = pick && i !== chosen;
            const lift = active
              ? interpolate(frame - 116, [0, 16], [0, -18], {
                  ...clamp,
                  easing: easeOut,
                })
              : 0;
            return (
              <div
                key={mode.id}
                style={{
                  flex: 1,
                  padding: "30px 28px",
                  borderRadius: 18,
                  background: active
                    ? `${mode.color}12`
                    : "rgba(13,18,24,0.85)",
                  border: `1px solid ${active ? `${mode.color}77` : c.stroke}`,
                  boxShadow: active
                    ? `0 30px 70px -30px ${mode.color}`
                    : undefined,
                  opacity: p * (dimmed ? 0.4 : 1),
                  transform: `translateY(${(1 - p) * 22 + lift}px) scale(${active ? 1.03 : 1})`,
                }}
              >
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 22,
                    color: mode.color,
                    letterSpacing: 0.5,
                  }}
                >
                  {mode.id}
                </div>
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 19,
                    lineHeight: 1.5,
                    color: c.dim,
                    minHeight: 110,
                  }}
                >
                  {mode.text}
                </div>
                {active ? (
                  <div style={{ marginTop: 6 }}>
                    <Pill delay={124} color={mode.color} filled>
                      selected
                    </Pill>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Row>
        <Row gap={30} style={{ marginTop: 40 }} align="flex-start">
          <CodeCard
            snippet={snippet("modeHelp")}
            delay={62}
            width={880}
            fontSize={15}
            revealPerLine={1.6}
            accent={c.violet}
          />
          <Stack gap={16} style={{ paddingTop: 10 }}>
            <Body delay={140} size={21} maxWidth={640}>
              Changing the mode bumps the policy version, which invalidates
              every approval that was signed against the old one.
            </Body>
            <Row gap={10} style={{ flexWrap: "wrap", maxWidth: 640 }}>
              <Pill delay={152} color={c.faint}>
                policy.version++
              </Pill>
              <Pill delay={158} color={c.faint}>
                approvals invalidated
              </Pill>
              <Pill delay={164} color={c.faint}>
                autoMerge stays off
              </Pill>
            </Row>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Watching: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 11);

  const nodes: Node[] = [
    {
      id: "slack",
      x: 190,
      y: 70,
      label: "Slack",
      sub: "Socket Mode",
      color: c.slack,
      icon: <SlackMark size={20} />,
      delay: 18,
    },
    {
      id: "github",
      x: 190,
      y: 210,
      label: "GitHub",
      sub: "App + webhooks",
      color: c.text,
      icon: <GitHubMark size={18} />,
      delay: 24,
    },
    {
      id: "inbox",
      x: 560,
      y: 140,
      label: "Durable inbox",
      sub: "delivery id dedupe",
      color: c.blue,
      delay: 40,
      w: 230,
    },
    {
      id: "revisions",
      x: 900,
      y: 140,
      label: "Source revisions",
      sub: "monotonic, edit-aware",
      color: c.violet,
      delay: 56,
      w: 240,
    },
    {
      id: "context",
      x: 1250,
      y: 140,
      label: "Project context",
      sub: "PostgreSQL full-text",
      color: c.cyan,
      delay: 72,
      w: 250,
    },
  ];
  const edges: Edge[] = [
    {
      from: "slack",
      to: "inbox",
      delay: 34,
      every: 22,
      color: c.slack,
      curve: 18,
    },
    {
      from: "github",
      to: "inbox",
      delay: 38,
      every: 26,
      color: c.dim,
      curve: -18,
    },
    { from: "inbox", to: "revisions", delay: 54, every: 20, color: c.blue },
    { from: "revisions", to: "context", delay: 70, every: 20, color: c.violet },
  ];

  const cards = [
    {
      ...data.slackMessages[0],
      icon: <SlackMark size={18} />,
      at: 86,
      x: 30,
      y: 340,
      color: c.slack,
    },
    {
      ...data.githubEvents[0],
      icon: <GitHubMark size={16} />,
      at: 104,
      x: 400,
      y: 380,
      color: c.text,
    },
    {
      ...data.slackMessages[1],
      icon: <SlackMark size={18} />,
      at: 122,
      x: 770,
      y: 340,
      color: c.slack,
    },
    {
      ...data.githubEvents[1],
      icon: <GitHubMark size={16} />,
      at: 140,
      x: 1140,
      y: 380,
      color: c.rose,
    },
  ];

  return (
    <Scene duration={duration}>
      <Backdrop />
      <SceneLabel index="05" title="context accrues" />
      <Safe>
        <Row align="center" gap={22} style={{ marginBottom: 8 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: c.cyan,
              opacity: 0.4 + pulse * 0.6,
              boxShadow: `0 0 ${10 + pulse * 22}px ${c.cyan}`,
            }}
          />
          <Kinetic
            text="ShadowQA is watching."
            delay={2}
            size={62}
            stagger={2}
          />
        </Row>
        <Body delay={12} size={23} maxWidth={1180} style={{ marginBottom: 26 }}>
          Ordinary Slack messages and ordinary GitHub activity accumulate as
          source-linked context. Nothing is compiled, planned, or executed until
          you ask.
        </Body>

        <div style={{ position: "relative", height: 500, width: 1680 }}>
          <Flow nodes={nodes} edges={edges} width={1500} height={300} />
          {cards.map((card, i) => (
            <SourceCard
              key={i}
              icon={card.icon}
              who={card.who}
              text={card.text}
              at={card.at}
              x={card.x}
              y={card.y}
              color={card.color}
              travel={{ x: 1130, y: 110 }}
            />
          ))}
        </div>

        <Row gap={22} style={{ marginTop: 10 }}>
          <StatTile
            label="source documents"
            value={<Counter to={1284} start={90} duration={110} />}
            hint="deduplicated by delivery id"
            delay={92}
            width={300}
          />
          <StatTile
            label="revisions"
            value={<Counter to={2911} start={100} duration={110} />}
            hint="edits update the same identity"
            delay={100}
            color={c.violet}
            width={300}
          />
          <StatTile
            label="gemini calls"
            value="0"
            hint="accumulating only"
            delay={108}
            color={c.faint}
            width={300}
          />
          <Panel delay={116} padding={"26px 28px"} style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: mono,
                fontSize: 14,
                letterSpacing: 2.4,
                color: c.faint,
                textTransform: "uppercase",
              }}
            >
              what it never does
            </div>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Pill delay={124} color={c.faint}>
                no DMs
              </Pill>
              <Pill delay={129} color={c.faint}>
                no keystrokes
              </Pill>
              <Pill delay={134} color={c.faint}>
                no unsaved buffers
              </Pill>
              <Pill delay={139} color={c.faint}>
                no message becomes a command
              </Pill>
            </div>
          </Panel>
        </Row>
      </Safe>
    </Scene>
  );
};
