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
import { Body, Eyebrow, Kinetic } from "../components/Type";
import { Terminal, type TermLine } from "../components/Terminal";
import { CodeCard } from "../components/Code";
import { Panel, Pill, Divider, CheckRow } from "../components/Surfaces";
import { GeminiMark, ShadowMark } from "../components/Marks";
import { snippet } from "../generated/source";
import { c, clamp, enter, POP, SOFT } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

/** Mirrors renderPlan() in src/cli/ui.ts line-for-line, including its label column width. */
const PlanBlock: React.FC<{ delay: number; width?: number }> = ({
  delay,
  width = 940,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  const row = (i: number) =>
    interpolate(frame - (delay + 8 + i * 3), [0, 8], [0, 1], clamp);
  const L: React.FC<{
    i: number;
    label: string;
    value: React.ReactNode;
    color?: string;
  }> = ({ i, label, value, color }) => (
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
  let i = 0;
  return (
    <div
      style={{
        width,
        borderRadius: 16,
        background: "rgba(8,11,15,0.94)",
        border: `1px solid ${c.stroke}`,
        padding: "28px 32px",
        fontFamily: mono,
        fontSize: 18,
        lineHeight: 1.6,
        opacity: p,
        transform: `translateY(${(1 - p) * 20}px)`,
        boxShadow: "0 40px 110px -50px rgba(0,0,0,0.95)",
      }}
    >
      <div style={{ paddingBottom: 12 }}>
        <span style={{ color: c.cyan, letterSpacing: 2 }}>◈ SHADOWQA</span>
        <span style={{ color: c.faint }}>
          {"  "}observe → plan → verify → repair
        </span>
      </div>
      <L i={i++} label="PLAN" value={data.planId} />
      <L i={i++} label="STATE" value="awaiting_approval" color={c.amber} />
      <L i={i++} label="BASE" value={data.baseSha} />
      <L i={i++} label="DIGEST" value={data.planDigest} color={c.cyan} />
      <div
        style={{
          padding: "16px 0 14px",
          fontWeight: 700,
          color: c.text,
          opacity: row(i++),
        }}
      >
        {data.objective}
      </div>
      {data.planSteps.map((step, k) => (
        <div key={step.id} style={{ opacity: row(i + k) }}>
          <span style={{ color: c.cyan }}>◇ </span>
          <span>{step.text}</span>
          {step.after.length ? (
            <span style={{ color: c.faint }}>
              {" "}
              [after {step.after.join(", ")}]
            </span>
          ) : null}
        </div>
      ))}
      <div style={{ height: 14 }} />
      {((i += data.planSteps.length), null)}
      <L i={i++} label="FILES" value="src/submit.js" />
      <L i={i++} label="CHECK PROFILE" value="node-v1" />
      <L i={i++} label="LIMIT" value="1200s / 2 attempts" />
      {data.acceptance.map((a, k) => (
        <L
          key={a}
          i={i + k}
          label="ACCEPTANCE"
          value={"✓ " + a}
          color={c.green}
        />
      ))}
      {((i += data.acceptance.length), null)}
      <L
        i={i++}
        label="REGRESSION"
        value="Run the committed duplicate-submission test at the approved base"
      />
      <L
        i={i++}
        label="ROLLBACK"
        value="Revert the repair commit on shadowqa/<job-id>"
      />
      <L
        i={i++}
        label="QUESTION"
        value="? Should the retry banner also debounce?"
        color={c.amber}
      />
      {data.sources.map((s, k) => (
        <L
          key={s.url}
          i={i + k}
          label={s.confirmed ? "CONFIRMED SOURCE" : "SOURCE"}
          value={`${s.url} @ ${s.revision}`}
          color={s.confirmed ? c.dim : c.faint}
        />
      ))}
    </div>
  );
};

export const Compile: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const spin = enter(frame, fps, 96, SOFT);
  const lines: TermLine[] = [
    {
      kind: "prompt",
      text: 'shadowqa compile payments-ui --objective "Prevent duplicate submissions"',
      at: 4,
      cps: 46,
    },
    {
      kind: "spinner",
      text: "retrieve confirmed context (tenant, project scoped)",
      at: 56,
      until: 84,
    },
    {
      kind: "spinner",
      text: "inspect repository at origin/main",
      at: 86,
      until: 118,
    },
    {
      kind: "label",
      label: "BASE",
      value: data.baseSha.slice(0, 12) + "…",
      at: 120,
    },
    {
      kind: "label",
      label: "INSPECTED",
      value: "src/submit.js, tests/submit.test.js",
      at: 128,
    },
    {
      kind: "spinner",
      text: "gemini-2.5-flash · structured output",
      at: 136,
      until: 186,
    },
    {
      kind: "ok",
      text: "Plan " + data.planId + " compiled. 1 model call.",
      at: 188,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.violet} />
      <SceneLabel index="06" title="you ask, then it plans" />
      <Safe>
        <Stack gap={14} style={{ marginBottom: 28 }}>
          <Eyebrow delay={2} color={c.violet}>
            Compile
          </Eyebrow>
          <Kinetic
            text="Context is not a plan until you say so."
            delay={5}
            size={56}
            stagger={2}
            accent={c.violet}
            accentWords={["plan"]}
          />
          <Body delay={14} size={22} maxWidth={1150}>
            One explicit command. Retrieval is scoped to the project, the
            repository is read at the exact base commit, and Gemini returns a
            schema-validated plan or nothing.
          </Body>
        </Stack>
        <Row gap={40} align="flex-start">
          <Terminal lines={lines} delay={2} width={980} fontSize={19} />
          <Stack gap={20}>
            <Panel delay={94} width={620} padding={"26px 28px"}>
              <Row gap={16}>
                <div
                  style={{
                    transform: `scale(${0.9 + spin * 0.1}) rotate(${interpolate(
                      frame - 96,
                      [0, 120],
                      [0, 180],
                      clamp,
                    )}deg)`,
                  }}
                >
                  <GeminiMark size={42} />
                </div>
                <Stack gap={4}>
                  <span style={{ fontSize: 22, fontWeight: 600 }}>
                    {data.model}
                  </span>
                  <span
                    style={{ fontFamily: mono, fontSize: 15, color: c.faint }}
                  >
                    the only inference provider
                  </span>
                </Stack>
              </Row>
              <div style={{ height: 20 }} />
              <Divider delay={104} />
              <div style={{ height: 18 }} />
              <Stack gap={12}>
                <CheckRow
                  text="Structured output validated against the plan schema"
                  at={110}
                  done={122}
                />
                <CheckRow
                  text="One schema repair attempt, then a visible failure"
                  at={118}
                  done={132}
                />
                <CheckRow
                  text="Every cited source must exist in the retrieved set"
                  at={126}
                  done={142}
                />
                <CheckRow
                  text="Daily call budget reserved before the request"
                  at={134}
                  done={152}
                />
              </Stack>
            </Panel>
            <CodeCard
              snippet={snippet("citation")}
              delay={150}
              width={620}
              fontSize={16}
              accent={c.violet}
              caption="A fabricated citation fails the compile; it never reaches a plan."
            />
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const PlanReview: React.FC<{ duration: number }> = ({ duration }) => {
  return (
    <Scene duration={duration}>
      <Backdrop />
      <SceneLabel index="07" title="the plan, in full" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 24 }}>
          <Eyebrow delay={2}>Plan {data.planId}</Eyebrow>
          <Kinetic
            text="Scope, files, checks, acceptance, and what it still does not know."
            delay={5}
            size={48}
            stagger={1.6}
            maxWidth={1500}
          />
        </Stack>
        <Row gap={40} align="flex-start">
          <PlanBlock delay={16} width={980} />
          <Stack gap={20}>
            <CodeCard
              snippet={snippet("planShape")}
              delay={40}
              width={620}
              fontSize={15}
              revealPerLine={1.4}
              highlight={[7, 8, 9, 10]}
            />
            <Panel delay={120} width={620} padding={"24px 26px"}>
              <Body delay={126} size={20} maxWidth={560} color={c.dim}>
                The plan is immutable. Its digest covers the objective, the
                steps, the expected paths, the base commit, the command-profile
                digest and the policy version.
              </Body>
              <div style={{ height: 16 }} />
              <Row gap={10} style={{ flexWrap: "wrap" }}>
                <Pill delay={134} color={c.amber}>
                  1 unanswered question surfaced
                </Pill>
                <Pill delay={140} color={c.faint}>
                  conflicts preserved, not resolved
                </Pill>
              </Row>
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
  const seal = enter(frame, fps, 104, POP);
  const bindings = [
    { label: "plan digest", value: data.planDigest.slice(0, 24) + "…" },
    { label: "base sha", value: data.baseSha.slice(0, 24) + "…" },
    { label: "profile digest", value: data.profileDigest },
    { label: "policy version", value: "4" },
    { label: "actor", value: "alice (admin)" },
    { label: "expires", value: "in 60 minutes" },
  ];
  const lines: TermLine[] = [
    { kind: "prompt", text: "shadowqa approve " + data.planId, at: 4, cps: 28 },
    {
      kind: "out",
      text: "  …plan redisplayed in full…",
      at: 30,
      color: c.faint,
    },
    {
      kind: "prompt",
      text: "Approve this exact plan, its base and command profile? [y/N] y",
      at: 40,
      cps: 34,
    },
    { kind: "ok", text: "Approved. One-use nonce consumed.", at: 100 },
    { kind: "label", label: "JOB", value: data.jobId, at: 110 },
    { kind: "label", label: "STATE", value: "queued", at: 118, color: c.amber },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.amber} />
      <SceneLabel index="08" title="approval binds" />
      <Safe>
        <Stack gap={14} style={{ marginBottom: 30 }}>
          <Eyebrow delay={2} color={c.amber}>
            Approval
          </Eyebrow>
          <Kinetic
            text="You approve one exact plan — not a standing permission."
            delay={5}
            size={54}
            stagger={2}
            accent={c.amber}
            accentWords={["exact"]}
            maxWidth={1400}
          />
        </Stack>
        <Row gap={40} align="flex-start">
          <Terminal lines={lines} delay={2} width={900} fontSize={20} />
          <Panel delay={44} width={700} padding={"30px 32px"}>
            <Row gap={14} style={{ marginBottom: 22 }}>
              <div
                style={{
                  transform: `scale(${0.85 + seal * 0.15})`,
                  opacity: 0.4 + seal * 0.6,
                }}
              >
                <ShadowMark size={44} delay={104} glow={seal > 0.2} />
              </div>
              <span style={{ fontSize: 24, fontWeight: 600 }}>
                Bound to this approval
              </span>
            </Row>
            {bindings.map((b, i) => {
              const p = interpolate(
                frame - (52 + i * 7),
                [0, 10],
                [0, 1],
                clamp,
              );
              return (
                <div
                  key={b.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "11px 0",
                    borderBottom: `1px solid ${c.stroke}`,
                    opacity: p,
                    transform: `translateX(${(1 - p) * 12}px)`,
                  }}
                >
                  <span
                    style={{ fontFamily: mono, fontSize: 16, color: c.faint }}
                  >
                    {b.label}
                  </span>
                  <span
                    style={{ fontFamily: mono, fontSize: 16, color: c.text }}
                  >
                    {b.value}
                  </span>
                </div>
              );
            })}
            <div style={{ height: 22 }} />
            <Body delay={120} size={19} maxWidth={620}>
              Edit a source, revoke an installation, change the mode or move the
              default branch and this approval stops authorising anything.
            </Body>
            <div style={{ height: 16 }} />
            <Row gap={10} style={{ flexWrap: "wrap" }}>
              <Pill delay={132} color={c.rose}>
                no model-generated shell command
              </Pill>
              <Pill delay={138} color={c.rose}>
                never becomes a blanket grant
              </Pill>
            </Row>
          </Panel>
        </Row>
      </Safe>
    </Scene>
  );
};
