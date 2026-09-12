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
import { CheckRow, Panel, Pill } from "../components/Surfaces";
import { Flow, type Edge, type Node } from "../components/Flow";
import { Panelette } from "../components/Panelette";
import { ClaudeMark, OpenAIMark, ShadowMark } from "../components/Marks";
import { snippet } from "../generated/source";
import { c, clamp, enter, POP, SOFT } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

export const Watching: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 11);
  const nodes: Node[] = [
    {
      id: "chatgpt",
      x: 165,
      y: 50,
      label: "ChatGPT",
      sub: "browser, tracked tabs",
      color: c.openai,
      icon: <OpenAIMark size={18} color={c.openai} />,
      delay: 16,
      w: 235,
    },
    {
      id: "claude",
      x: 165,
      y: 148,
      label: "Claude",
      sub: "browser, tracked tabs",
      color: c.claude,
      icon: <ClaudeMark size={18} />,
      delay: 22,
      w: 235,
    },
    {
      id: "cc",
      x: 165,
      y: 246,
      label: "Claude Code",
      sub: "local transcripts",
      color: c.text,
      delay: 28,
      w: 235,
    },
    {
      id: "codex",
      x: 165,
      y: 344,
      label: "Codex",
      sub: "local rollouts",
      color: c.text,
      delay: 34,
      w: 235,
    },
    {
      id: "companion",
      x: 570,
      y: 148,
      label: "Companion",
      sub: "native messaging",
      color: c.blue,
      delay: 48,
      w: 215,
    },
    {
      id: "dedupe",
      x: 570,
      y: 300,
      label: "Identity + revisions",
      sub: "edits update in place",
      color: c.violet,
      delay: 56,
      w: 235,
    },
    {
      id: "context",
      x: 950,
      y: 224,
      label: "Project context",
      sub: "embedded PostgreSQL",
      color: c.cyan,
      delay: 70,
      w: 245,
    },
  ];
  const edges: Edge[] = [
    {
      from: "chatgpt",
      to: "companion",
      delay: 42,
      every: 24,
      color: c.openai,
      curve: 10,
    },
    { from: "claude", to: "companion", delay: 46, every: 26, color: c.claude },
    { from: "cc", to: "dedupe", delay: 50, every: 28, color: c.dim },
    {
      from: "codex",
      to: "dedupe",
      delay: 54,
      every: 30,
      color: c.dim,
      curve: -10,
    },
    {
      from: "companion",
      to: "context",
      delay: 64,
      every: 22,
      color: c.blue,
      curve: 22,
    },
    {
      from: "dedupe",
      to: "context",
      delay: 70,
      every: 22,
      color: c.violet,
      curve: -22,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop />
      <SceneLabel index="06" title="context accrues" />
      <Safe>
        <Row align="center" gap={20} style={{ marginBottom: 6 }}>
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
            size={56}
            stagger={2}
          />
        </Row>
        <Body delay={12} size={22} maxWidth={1180} style={{ marginBottom: 20 }}>
          Only the conversations you tracked, and only the coding sessions you
          opted in. Duplicates collapse, a streamed reply completes in place,
          and an edit updates the turn it edited.
        </Body>

        <Row gap={28} align="flex-start">
          <div style={{ position: "relative", width: 1180, height: 420 }}>
            <Flow nodes={nodes} edges={edges} width={1180} height={400} />
          </div>
          <Panelette
            delay={26}
            width={400}
            height={520}
            state={{
              paired: true,
              tracked: true,
              site: "Claude",
              title: "Retry banner",
              turns: 6,
              status: "tracking",
              conversations: data.conversations.map((conversation) => ({
                title: conversation.title,
                meta: `${conversation.origin} · payments · ${conversation.turns} turns · ${conversation.coverage}`,
              })),
            }}
          />
        </Row>

        <Row gap={20} style={{ marginTop: 18 }}>
          <Panel delay={96} padding={"22px 26px"} width={330}>
            <div
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: 2.4,
                color: c.faint,
              }}
            >
              TURNS CAPTURED
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: c.cyan,
                marginTop: 8,
              }}
            >
              <Counter to={69} start={100} duration={80} />
            </div>
            <div style={{ fontSize: 16, color: c.dim, marginTop: 6 }}>
              across 4 sources
            </div>
          </Panel>
          <Panel delay={104} padding={"22px 26px"} style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: 2.4,
                color: c.faint,
              }}
            >
              WHAT IT SAYS OUT LOUD
            </div>
            <Row gap={10} style={{ flexWrap: "wrap", marginTop: 14 }}>
              <Pill delay={112} color={c.amber}>
                partial capture, labelled partial
              </Pill>
              <Pill delay={117} color={c.faint}>
                an unloaded turn is not a deleted turn
              </Pill>
              <Pill delay={122} color={c.faint}>
                timestamps only when the site shows one
              </Pill>
              <Pill delay={127} color={c.faint}>
                delete removes derived context too
              </Pill>
            </Row>
          </Panel>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Extract: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colours: Record<string, string> = {
    requirement: c.cyan,
    decision: c.green,
    constraint: c.blue,
    suggestion: c.amber,
    question: c.violet,
  };
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.cyan} />
      <SceneLabel index="07" title="what was actually decided" />
      <Safe>
        <Stack gap={13} style={{ marginBottom: 26 }}>
          <Eyebrow delay={2}>Extract</Eyebrow>
          <Kinetic
            text="An assistant suggesting something is not you deciding it."
            delay={5}
            size={50}
            stagger={1.8}
            accentWords={["not"]}
            maxWidth={1500}
          />
        </Stack>
        <Row gap={34} align="flex-start">
          <Stack gap={12} style={{ width: 1000 }}>
            {data.items.map((item, i) => {
              const at = 26 + i * 12;
              const p = enter(frame, fps, at, SOFT);
              const colour = colours[item.kind];
              return (
                <div
                  key={item.text}
                  style={{
                    display: "flex",
                    gap: 18,
                    alignItems: "flex-start",
                    padding: "18px 22px",
                    borderRadius: 14,
                    background: "rgba(13,18,24,0.86)",
                    border: `1px solid ${item.status === "confirmed" ? `${colour}44` : c.stroke}`,
                    opacity: p,
                    transform: `translateX(${(1 - p) * 22}px)`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 14,
                      letterSpacing: 1.2,
                      color: colour,
                      width: 118,
                      flexShrink: 0,
                      paddingTop: 3,
                    }}
                  >
                    {item.kind}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 21,
                        lineHeight: 1.4,
                      }}
                    >
                      {item.text}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontFamily: mono,
                        fontSize: 14,
                        color: c.faint,
                        marginTop: 6,
                      }}
                    >
                      {item.source}
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 14,
                      color: item.status === "confirmed" ? c.green : c.amber,
                      paddingTop: 3,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.status === "confirmed"
                      ? "✓ confirmed"
                      : "? " + item.status}
                  </span>
                </div>
              );
            })}
          </Stack>
          <Stack gap={18}>
            <CodeCard
              snippet={snippet("extractionPrompt")}
              delay={40}
              width={640}
              fontSize={14}
              revealPerLine={1.6}
            />
            <Panel delay={130} width={640} padding={"22px 26px"}>
              <Stack gap={11}>
                <CheckRow
                  text="Every item cites the turns it came from"
                  at={136}
                  done={150}
                />
                <CheckRow
                  text="A citation outside the excerpts is dropped"
                  at={142}
                  done={158}
                />
                <CheckRow
                  text="Your correction is never overwritten"
                  at={148}
                  done={166}
                />
              </Stack>
            </Panel>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

/** Mirrors renderPlan() in individual/cli/ui.ts. */
const PlanBlock: React.FC<{ delay: number; width?: number }> = ({
  delay,
  width = 960,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  let index = 0;
  const row = (i: number) =>
    interpolate(frame - (delay + 8 + i * 3), [0, 8], [0, 1], clamp);
  const L: React.FC<{
    label: string;
    value: React.ReactNode;
    color?: string;
  }> = ({ label, value, color }) => {
    const i = index++;
    return (
      <div
        style={{
          display: "flex",
          opacity: row(i),
          transform: `translateX(${(1 - row(i)) * 8}px)`,
        }}
      >
        <span style={{ color: c.faint, whiteSpace: "pre" }}>
          {label.padEnd(18)}
        </span>
        <span style={{ color: color ?? c.text }}>{value}</span>
      </div>
    );
  };
  return (
    <div
      style={{
        width,
        borderRadius: 16,
        background: "rgba(8,11,15,0.94)",
        border: `1px solid ${c.stroke}`,
        padding: "26px 30px",
        fontFamily: mono,
        fontSize: 17.5,
        lineHeight: 1.6,
        opacity: p,
        transform: `translateY(${(1 - p) * 20}px)`,
      }}
    >
      <div style={{ paddingBottom: 12 }}>
        <span style={{ color: c.cyan, letterSpacing: 2 }}>◈ SHADOWQA</span>
        <span style={{ color: c.faint }}>
          {" individual  conversations → plan → verify → repair"}
        </span>
      </div>
      <L label="PLAN" value={data.planId} />
      <L label="STATE" value="awaiting_approval" color={c.amber} />
      <L label="BACKEND" value={data.project.backend} color={c.claude} />
      <L label="BASE" value={data.baseSha} />
      <L label="DIGEST" value={data.planDigest} color={c.cyan} />
      <div
        style={{
          padding: "14px 0 12px",
          fontWeight: 700,
          opacity: row(index++),
        }}
      >
        Set the in-flight submit guard before awaiting save()
      </div>
      <L
        label="SCOPE"
        value="src/submit.js only; the retry banner is untouched."
      />
      {data.planSteps.map((step) => {
        const i = index++;
        return (
          <div key={step.id} style={{ opacity: row(i) }}>
            <span style={{ color: c.cyan }}>◇ </span>
            <span>{step.text}</span>
            {step.after.length ? (
              <span style={{ color: c.faint }}>
                {" "}
                [after {step.after.join(", ")}]
              </span>
            ) : null}
          </div>
        );
      })}
      <div style={{ height: 12 }} />
      <L label="FILES" value="src/submit.js" />
      {data.acceptance.map((item) => (
        <L key={item} label="ACCEPTANCE" value={"✓ " + item} color={c.green} />
      ))}
      <L label="TEST" value="tests/submit.test.js" />
      <L label="OUT OF SCOPE" value="Retry banner" />
      <L
        label="QUESTION"
        value="? Should a failed save re-enable the button immediately?"
        color={c.amber}
      />
      <L label="ROLLBACK" value="Delete the ShadowQA branch" />
      <L
        label="CONFIRMED SOURCE"
        value="chatgpt https://chatgpt.com/c/…"
        color={c.dim}
      />
      <L
        label="CONFIRMED SOURCE"
        value="claude https://claude.ai/chat/…"
        color={c.dim}
      />
    </div>
  );
};

export const PlanScene: React.FC<{ duration: number }> = ({ duration }) => {
  const lines: TermLine[] = [
    {
      kind: "prompt",
      text: 'shadowqa-individual plan payments -o "Stop duplicate submissions"',
      at: 4,
      cps: 44,
    },
    { kind: "spinner", text: "retrieve project context", at: 50, until: 70 },
    {
      kind: "spinner",
      text: "inspect C:\\work\\payments-ui at HEAD",
      at: 72,
      until: 98,
    },
    {
      kind: "label",
      label: "BASE",
      value: data.baseSha.slice(0, 12) + "…",
      at: 100,
    },
    {
      kind: "spinner",
      text: "gemini-2.5-flash · structured output",
      at: 108,
      until: 150,
    },
    { kind: "ok", text: "Plan " + data.planId + " compiled.", at: 152 },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.violet} />
      <SceneLabel index="08" title="you ask, in the cli" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 22 }}>
          <Eyebrow delay={2} color={c.violet}>
            Plan
          </Eyebrow>
          <Kinetic
            text="One command. Your context, plus the repository as it actually is."
            delay={5}
            size={46}
            stagger={1.6}
            accent={c.violet}
            maxWidth={1520}
          />
        </Stack>
        <Row gap={34} align="flex-start">
          <PlanBlock delay={16} width={1000} />
          <Stack gap={18}>
            <Terminal
              lines={lines}
              delay={2}
              width={650}
              fontSize={16}
              title="shadowqa-individual"
            />
            <Panel delay={120} width={650} padding={"22px 26px"}>
              <Stack gap={11}>
                <CheckRow
                  text="Paths outside the project's scope are refused"
                  at={126}
                  done={140}
                  color={c.violet}
                />
                <CheckRow
                  text="A cited item that does not exist fails the compile"
                  at={132}
                  done={148}
                  color={c.violet}
                />
                <CheckRow
                  text="Open questions are carried, never answered"
                  at={138}
                  done={156}
                  color={c.violet}
                />
                <CheckRow
                  text="No key configured means no plan, not a fake one"
                  at={144}
                  done={164}
                  color={c.rose}
                />
              </Stack>
            </Panel>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Approve: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seal = enter(frame, fps, 96, POP);
  const lines: TermLine[] = [
    {
      kind: "prompt",
      text: "shadowqa-individual approve " + data.planId,
      at: 4,
      cps: 34,
    },
    {
      kind: "out",
      text: "  …plan redisplayed in full…",
      at: 34,
      color: c.faint,
    },
    {
      kind: "prompt",
      text: "Run this exact plan through claude-code? [y/N] y",
      at: 44,
      cps: 30,
    },
    {
      kind: "ok",
      text:
        "Approved. Task " + data.taskId.slice(0, 8) + " queued on claude-code.",
      at: 92,
    },
    {
      kind: "label",
      label: "FOLLOW",
      value: "shadowqa-individual task " + data.taskId.slice(0, 8),
      at: 102,
    },
  ];
  const bindings = [
    { label: "plan digest", value: data.planDigest.slice(0, 22) + "…" },
    { label: "base commit", value: data.baseSha.slice(0, 22) + "…" },
    { label: "backend", value: "claude-code" },
    { label: "policy version", value: "2" },
    { label: "context digest", value: "matches the items you confirmed" },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.amber} />
      <SceneLabel index="09" title="one yes, one plan" />
      <Safe>
        <Stack gap={13} style={{ marginBottom: 28 }}>
          <Eyebrow delay={2} color={c.amber}>
            Approval
          </Eyebrow>
          <Kinetic
            text="Approve the plan, and pick the tool that runs it."
            delay={5}
            size={52}
            stagger={2}
            accent={c.amber}
          />
        </Stack>
        <Row gap={38} align="flex-start">
          <Terminal lines={lines} delay={2} width={900} fontSize={19} />
          <Panel delay={40} width={700} padding={"28px 32px"}>
            <Row gap={14} style={{ marginBottom: 20 }}>
              <div style={{ opacity: 0.4 + seal * 0.6 }}>
                <ShadowMark size={42} delay={96} glow={seal > 0.2} />
              </div>
              <span style={{ fontSize: 23, fontWeight: 600 }}>
                Bound to this approval
              </span>
            </Row>
            {bindings.map((binding, i) => {
              const p = interpolate(
                frame - (48 + i * 7),
                [0, 10],
                [0, 1],
                clamp,
              );
              return (
                <div
                  key={binding.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "11px 0",
                    borderBottom: `1px solid ${c.stroke}`,
                    opacity: p,
                  }}
                >
                  <span
                    style={{ fontFamily: mono, fontSize: 16, color: c.faint }}
                  >
                    {binding.label}
                  </span>
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 16,
                      textAlign: "right",
                    }}
                  >
                    {binding.value}
                  </span>
                </div>
              );
            })}
            <div style={{ height: 20 }} />
            <Body delay={112} size={19} maxWidth={620}>
              Correct an extracted item, switch the backend, or commit to the
              repository, and the plan stops authorising anything.
            </Body>
          </Panel>
        </Row>
      </Safe>
    </Scene>
  );
};
