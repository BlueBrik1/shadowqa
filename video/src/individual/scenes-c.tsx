import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  Backdrop,
  Row,
  Safe,
  Scene,
  SceneLabel,
  Stack,
} from "../components/Layout";
import { Body, Counter, Eyebrow, Kinetic } from "../components/Type";
import { CodeCard, Diff } from "../components/Code";
import {
  CheckRow,
  Panel,
  Pill,
  StateTrack,
  Window,
} from "../components/Surfaces";
import { Flow, type Edge, type Node } from "../components/Flow";
import { ClaudeMark, ShadowMark, Glyph } from "../components/Marks";
import { snippet, source } from "../generated/source";
import { c, clamp } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

const STATES = [
  "queued",
  "preparing",
  "running",
  "verifying",
  "ready",
] as const;

export const Execute: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const activeAt = [8, 26, 56, 150, 205];
  const agentLines = [
    {
      text: "claude -p --session-id 749d66b5… --permission-mode acceptEdits",
      at: 66,
      color: c.faint,
    },
    { text: "read  src/submit.js", at: 80, color: c.text },
    { text: "read  tests/submit.test.js", at: 92, color: c.text },
    { text: "edit  src/submit.js  (1 hunk)", at: 108, color: c.cyan },
    {
      text: "result  Set the guard before the await; nothing else changed.",
      at: 126,
      color: c.dim,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.claude} />
      <SceneLabel index="10" title="it runs in your tool" />
      <Safe>
        <Stack gap={10} style={{ marginBottom: 24 }}>
          <Eyebrow delay={2} color={c.claude}>
            Execute
          </Eyebrow>
          <Kinetic
            text="Your own Claude Code session, in a copy of your repository."
            delay={5}
            size={46}
            stagger={1.6}
            accent={c.claude}
            maxWidth={1520}
          />
        </Stack>

        <div style={{ margin: "4px 0 28px" }}>
          <StateTrack
            states={STATES}
            activeAt={activeAt}
            delay={6}
            width={1400}
          />
        </div>

        <Row gap={28} align="flex-start">
          <Stack gap={16}>
            <Window
              title={
                <>
                  <ClaudeMark size={15} /> isolated workspace · base{" "}
                  {data.baseSha.slice(0, 8)}
                </>
              }
              delay={48}
              width={900}
              height={280}
              accent={`${c.claude}44`}
            >
              <div
                style={{
                  padding: "18px 24px",
                  fontFamily: mono,
                  fontSize: 17,
                  lineHeight: 1.62,
                }}
              >
                {agentLines.map((line, i) => {
                  if (frame < line.at) return null;
                  const p = interpolate(frame - line.at, [0, 8], [0, 1], clamp);
                  return (
                    <div
                      key={i}
                      style={{
                        opacity: p,
                        transform: `translateY(${(1 - p) * 6}px)`,
                        color: line.color,
                      }}
                    >
                      {line.text}
                    </div>
                  );
                })}
                <div
                  style={{
                    marginTop: 20,
                    opacity: interpolate(frame - 140, [0, 12], [0, 1], clamp),
                  }}
                >
                  <Row gap={10} style={{ flexWrap: "wrap" }}>
                    <Pill delay={142} color={c.green}>
                      your clone untouched
                    </Pill>
                    <Pill delay={147} color={c.green}>
                      uncommitted work preserved
                    </Pill>
                  </Row>
                </div>
              </div>
            </Window>
            <Panel delay={170} width={900} padding={"20px 24px"}>
              <Row gap={16} align="center">
                <Glyph color={c.cyan} size={42} delay={172}>
                  <span style={{ fontSize: 20, color: c.cyan }}>◈</span>
                </Glyph>
                <Stack gap={4}>
                  <span
                    style={{ fontSize: 19, fontWeight: 600, fontFamily: mono }}
                  >
                    claude --resume {data.sessionId.slice(0, 8)}…
                  </span>
                  <span
                    style={{ fontFamily: mono, fontSize: 14, color: c.faint }}
                  >
                    Paste it into your IDE terminal and you are inside the same
                    session.
                  </span>
                </Stack>
              </Row>
            </Panel>
          </Stack>

          <Stack gap={16}>
            <Panel delay={60} width={620} padding={"24px 26px"}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: 2.4,
                  color: c.faint,
                  marginBottom: 16,
                }}
              >
                SAME PLAN, YOUR CHOICE OF TOOL
              </div>
              <Stack gap={11}>
                {data.backendRows.map((backend, i) => (
                  <div
                    key={backend.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: `1px solid ${i === 1 ? c.claude + "55" : c.stroke}`,
                      background: i === 1 ? `${c.claude}10` : "transparent",
                      opacity: interpolate(
                        frame - (66 + i * 8),
                        [0, 12],
                        [0, 1],
                        clamp,
                      ),
                    }}
                  >
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 16,
                        color: i === 1 ? c.claude : c.dim,
                      }}
                    >
                      {backend.id}
                    </span>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 13.5,
                        color: c.faint,
                      }}
                    >
                      {backend.attach}
                    </span>
                  </div>
                ))}
              </Stack>
            </Panel>
            <CodeCard
              snippet={snippet("nativeHost")}
              delay={120}
              width={620}
              fontSize={13.5}
            />
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Verify: React.FC<{ duration: number }> = ({ duration }) => {
  const nodes: Node[] = [
    {
      id: "freeze",
      x: 140,
      y: 55,
      label: "Freeze the diff",
      sub: "agent finished",
      color: c.amber,
      delay: 12,
      w: 210,
    },
    {
      id: "fresh",
      x: 500,
      y: 55,
      label: "Fresh copy",
      sub: "from the base commit",
      color: c.blue,
      delay: 30,
      w: 220,
    },
    {
      id: "apply",
      x: 860,
      y: 55,
      label: "Apply + review",
      sub: "scope, size, secrets",
      color: c.violet,
      delay: 48,
      w: 230,
    },
    {
      id: "checks",
      x: 1230,
      y: 55,
      label: "Run your checks",
      sub: "exit codes, not claims",
      color: c.green,
      delay: 66,
      w: 240,
    },
  ];
  const edges: Edge[] = [
    { from: "freeze", to: "fresh", delay: 24, every: 26, color: c.blue },
    { from: "fresh", to: "apply", delay: 42, every: 26, color: c.violet },
    { from: "apply", to: "checks", delay: 60, every: 26, color: c.green },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.green} />
      <SceneLabel index="11" title="checked, not believed" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 24 }}>
          <Eyebrow delay={2} color={c.green}>
            Verify
          </Eyebrow>
          <Kinetic
            text="The agent said it worked. That is not the evidence."
            delay={5}
            size={50}
            stagger={2}
            accent={c.green}
            accentWords={["evidence."]}
          />
        </Stack>
        <div style={{ height: 120 }}>
          <Flow nodes={nodes} edges={edges} width={1450} height={110} />
        </div>
        <Row gap={32} align="flex-start" style={{ marginTop: 14 }}>
          <Diff
            text={data.patch}
            delay={88}
            width={880}
            fontSize={16.5}
            title={"frozen patch · task " + data.taskId.slice(0, 8)}
          />
          <Stack gap={16}>
            <Panel delay={140} width={720} padding={"26px 28px"}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: 2.4,
                  color: c.faint,
                  marginBottom: 16,
                }}
              >
                YOUR CHECK COMMAND, RUN BY SHADOWQA
              </div>
              <Stack gap={13}>
                {data.checks.map((check) => (
                  <CheckRow
                    key={check.id}
                    text={check.argv}
                    at={146}
                    done={162}
                    detail={`exit ${check.exit} · ${check.ms} ms`}
                    color={c.green}
                  />
                ))}
                <CheckRow
                  text="Patch stays inside the plan's files"
                  at={152}
                  done={172}
                  color={c.green}
                />
                <CheckRow
                  text="Nothing else in the copy was modified"
                  at={158}
                  done={180}
                  color={c.green}
                />
                <CheckRow
                  text="A patch that deletes an assertion stops here"
                  at={164}
                  done={190}
                  color={c.rose}
                  failed
                />
              </Stack>
            </Panel>
            <CodeCard
              snippet={snippet("dedupe")}
              delay={150}
              width={720}
              fontSize={13.5}
              caption="The same identity rule that keeps an edited message from becoming a second one."
            />
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Deliver: React.FC<{ duration: number }> = ({ duration }) => {
  const nodes: Node[] = [
    {
      id: "saved",
      x: 115,
      y: 52,
      label: "Saved files",
      sub: "opt-in watch",
      color: c.dim,
      delay: 14,
      w: 190,
    },
    {
      id: "agent",
      x: 115,
      y: 166,
      label: "Agent changes",
      sub: "every task",
      color: c.claude,
      delay: 20,
      w: 190,
    },
    {
      id: "sched",
      x: 115,
      y: 280,
      label: "Scheduled scan",
      sub: "while running",
      color: c.dim,
      delay: 26,
      w: 190,
    },
    {
      id: "checks",
      x: 560,
      y: 166,
      label: "Your checks",
      sub: "fresh copy of HEAD",
      color: c.green,
      delay: 40,
      w: 220,
    },
    {
      id: "findings",
      x: 980,
      y: 166,
      label: "Findings",
      sub: "fingerprinted",
      color: c.rose,
      delay: 56,
      w: 200,
    },
    {
      id: "repair",
      x: 1380,
      y: 166,
      label: "Bounded repair",
      sub: "2 attempts, cooldown",
      color: c.amber,
      delay: 72,
      w: 220,
    },
  ];
  const edges: Edge[] = [
    {
      from: "saved",
      to: "checks",
      delay: 34,
      every: 30,
      color: c.dim,
      curve: 12,
    },
    { from: "agent", to: "checks", delay: 36, every: 24, color: c.claude },
    {
      from: "sched",
      to: "checks",
      delay: 38,
      every: 30,
      color: c.dim,
      curve: -12,
    },
    { from: "checks", to: "findings", delay: 52, every: 22, color: c.rose },
    { from: "findings", to: "repair", delay: 68, every: 24, color: c.amber },
    {
      from: "repair",
      to: "checks",
      delay: 88,
      every: 0,
      color: c.faint,
      curve: -150,
      dashed: true,
      label: "re-verified, never trusted",
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.rose} />
      <SceneLabel index="12" title="then it keeps going" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 22 }}>
          <Eyebrow delay={2} color={c.rose}>
            Deliver, then watch
          </Eyebrow>
          <Kinetic
            text="A branch you can read, and a loop that does not stop there."
            delay={5}
            size={48}
            stagger={1.8}
            accent={c.rose}
            maxWidth={1500}
          />
        </Stack>

        <div style={{ position: "relative", width: 1680, height: 330 }}>
          <Flow nodes={nodes} edges={edges} width={1680} height={320} />
        </div>

        <Row gap={22} align="stretch" style={{ marginTop: 6 }}>
          <Panel
            delay={20}
            width={620}
            padding={"24px 26px"}
            accent={c.green}
            active
          >
            <div
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: 2.4,
                color: c.faint,
                marginBottom: 14,
              }}
            >
              RESULT
            </div>
            <Stack gap={11}>
              <CheckRow
                text={"Branch shadowqa/" + data.taskId.slice(0, 8)}
                at={26}
                done={40}
                color={c.green}
              />
              <CheckRow
                text="HEAD did not move"
                at={32}
                done={48}
                color={c.green}
              />
              <CheckRow
                text="Uncommitted edits untouched"
                at={38}
                done={56}
                color={c.green}
              />
              <CheckRow
                text="No checkout, no index, no stash"
                at={44}
                done={64}
                color={c.green}
              />
              <CheckRow
                text="PR only when GitHub is connected"
                at={50}
                done={74}
                color={c.dim}
              />
            </Stack>
          </Panel>

          <Panel delay={96} width={560} padding={"24px 26px"}>
            <Row gap={12} align="center" style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: mono, fontSize: 15, color: c.rose }}>
                87e1ee9e56
              </span>
              <Pill delay={102} color={c.rose}>
                reproduced
              </Pill>
              <Pill delay={107} color={c.faint}>
                <Counter to={2} start={106} duration={16} />× seen
              </Pill>
            </Row>
            <div
              style={{
                fontFamily: mono,
                fontSize: 14,
                color: c.dim,
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(251,113,133,0.07)",
                border: `1px solid ${c.rose}26`,
                lineHeight: 1.5,
              }}
            >
              duplicate submissions save exactly once … expected 1, got 2
            </div>
          </Panel>

          <Panel delay={112} style={{ flex: 1 }} padding={"24px 26px"}>
            <div
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: 2.4,
                color: c.faint,
                marginBottom: 14,
              }}
            >
              BOUNDS
            </div>
            <Stack gap={10}>
              <Pill delay={118} color={c.faint}>
                environment failures classified apart
              </Pill>
              <Pill delay={123} color={c.faint}>
                flaky is not reproduced
              </Pill>
              <Pill delay={128} color={c.amber}>
                two attempts, then it escalates
              </Pill>
              <Pill delay={133} color={c.amber}>
                auto repair only inside auto paths
              </Pill>
            </Stack>
          </Panel>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Close: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const steps = [
    "shadowqa-individual setup",
    "shadowqa-individual serve",
    "shadowqa-individual pair",
    "shadowqa-individual ui",
  ];
  return (
    <Scene duration={duration} fadeOut={30}>
      <Backdrop />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 22 }}
      >
        <ShadowMark size={100} delay={2} />
        <Kinetic
          text="ShadowQA"
          delay={14}
          size={80}
          weight={800}
          stagger={0}
        />
        <div
          style={{
            fontFamily: mono,
            fontSize: 20,
            letterSpacing: 7,
            color: c.cyan,
            opacity: interpolate(frame - 26, [0, 12], [0, 1], clamp),
          }}
        >
          INDIVIDUAL
        </div>
        <Body
          delay={34}
          size={25}
          style={{ textAlign: "center" }}
          maxWidth={940}
        >
          Your ChatGPT, Claude, Claude Code and Codex conversations become
          project context, a plan you approve, a session in the tool you already
          pay for, and a diff that was actually checked.
        </Body>
        <div style={{ height: 14 }} />
        <Row
          gap={12}
          style={{ flexWrap: "wrap", justifyContent: "center", maxWidth: 1300 }}
        >
          {steps.map((step, i) => (
            <Pill key={step} delay={52 + i * 6} color={c.cyan}>
              {step}
            </Pill>
          ))}
        </Row>
        <div
          style={{
            marginTop: 24,
            fontFamily: mono,
            fontSize: 15.5,
            color: c.faint,
            letterSpacing: 1.4,
            opacity: interpolate(frame - 86, [0, 16], [0, 1], clamp),
          }}
        >
          {source.individualCommands.length} commands ·{" "}
          {source.moduleCount.individual} modules · MV3 side panel · native
          messaging · Gemini {source.geminiModel}
        </div>
      </AbsoluteFill>
    </Scene>
  );
};
