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
import { type TermLine } from "../components/Terminal";
import { CodeCard, Diff } from "../components/Code";
import {
  CheckRow,
  Divider,
  Panel,
  Pill,
  StateTrack,
  Window,
} from "../components/Surfaces";
import { DockerMark, GitHubMark, ShadowMark, Glyph } from "../components/Marks";
import { Flow, type Edge, type Node } from "../components/Flow";
import { snippet, source } from "../generated/source";
import { c, clamp } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

export const Execute: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const activeAt = [10, 28, 48, 78, 150, 196, 224];
  const agentLines: TermLine[] = [
    {
      kind: "out",
      text: "opencode " + data.opencodeVersion + "  ·  session ses_04Kx9",
      at: 92,
      color: c.faint,
    },
    { kind: "out", text: "read  src/submit.js", at: 104 },
    { kind: "out", text: "read  tests/submit.test.js", at: 114 },
    {
      kind: "out",
      text: "edit  src/submit.js  (1 hunk)",
      at: 128,
      color: c.cyan,
    },
    {
      kind: "out",
      text: "no shell · no network · no subagents",
      at: 142,
      color: c.faint,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.blue} />
      <SceneLabel index="09" title="execution, walled in" />
      <Safe>
        <Stack gap={10} style={{ marginBottom: 34 }}>
          <Eyebrow delay={2} color={c.blue}>
            Execute
          </Eyebrow>
          <Kinetic
            text="A real OpenCode session, inside a container with nothing in it."
            delay={5}
            size={46}
            stagger={1.6}
            accent={c.blue}
            maxWidth={1500}
          />
        </Stack>

        <div style={{ margin: "6px 0 30px" }}>
          <StateTrack
            states={data.states}
            activeAt={activeAt}
            delay={8}
            width={1680}
          />
        </div>

        <Row gap={34} align="flex-start">
          <Stack gap={16}>
            <Window
              title={
                <>
                  <DockerMark size={16} /> shadowqa-{data.jobId.slice(0, 8)} ·
                  isolated workspace
                </>
              }
              delay={60}
              width={880}
              height={296}
              accent={`${c.blue}44`}
            >
              <div
                style={{
                  padding: "18px 24px",
                  fontFamily: mono,
                  fontSize: 18,
                  lineHeight: 1.6,
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
                        color: (line as any).color ?? c.text,
                      }}
                    >
                      {(line as any).text}
                    </div>
                  );
                })}
                <div
                  style={{
                    marginTop: 22,
                    opacity: interpolate(frame - 160, [0, 12], [0, 1], clamp),
                  }}
                >
                  <Row gap={10} style={{ flexWrap: "wrap" }}>
                    <Pill delay={162} color={c.blue}>
                      --network none
                    </Pill>
                    <Pill delay={167} color={c.blue}>
                      --cap-drop ALL
                    </Pill>
                    <Pill delay={172} color={c.blue}>
                      --read-only
                    </Pill>
                    <Pill delay={177} color={c.blue}>
                      --user 1000:1000
                    </Pill>
                    <Pill delay={182} color={c.blue}>
                      --pids-limit 128
                    </Pill>
                  </Row>
                </div>
              </div>
            </Window>
            <Panel delay={186} width={880} padding={"20px 24px"}>
              <Row gap={16} align="center">
                <Glyph color={c.cyan} size={42} delay={188}>
                  <span style={{ fontSize: 20, color: c.cyan }}>◈</span>
                </Glyph>
                <Stack gap={4}>
                  <span style={{ fontSize: 19, fontWeight: 600 }}>
                    shadowqa attach {data.jobId.slice(0, 8)}
                  </span>
                  <span
                    style={{ fontFamily: mono, fontSize: 14, color: c.faint }}
                  >
                    Your IDE attaches to that exact session — it does not start
                    a second agent.
                  </span>
                </Stack>
              </Row>
            </Panel>
            <CodeCard
              snippet={snippet("lease")}
              delay={200}
              width={880}
              fontSize={14}
              accent={c.amber}
              caption="One live job per repository, held by a fencing token and a 60-second lease."
            />
          </Stack>

          <CodeCard
            snippet={snippet("isolation")}
            delay={70}
            width={740}
            fontSize={14}
            revealPerLine={1.2}
            accent={c.blue}
          />
        </Row>
      </Safe>
    </Scene>
  );
};

export const Verify: React.FC<{ duration: number }> = ({ duration }) => {
  const nodes: Node[] = [
    {
      id: "freeze",
      x: 150,
      y: 60,
      label: "Freeze the diff",
      sub: "agent paused",
      color: c.amber,
      delay: 14,
      w: 220,
    },
    {
      id: "fresh",
      x: 540,
      y: 60,
      label: "Fresh snapshot",
      sub: "from the approved SHA",
      color: c.blue,
      delay: 34,
      w: 240,
    },
    {
      id: "apply",
      x: 930,
      y: 60,
      label: "Apply the patch",
      sub: "scope + secret checks",
      color: c.violet,
      delay: 54,
      w: 240,
    },
    {
      id: "checks",
      x: 1320,
      y: 60,
      label: "Run required checks",
      sub: "separate containers",
      color: c.green,
      delay: 74,
      w: 250,
    },
  ];
  const edges: Edge[] = [
    { from: "freeze", to: "fresh", delay: 28, every: 26, color: c.blue },
    { from: "fresh", to: "apply", delay: 48, every: 26, color: c.violet },
    { from: "apply", to: "checks", delay: 68, every: 26, color: c.green },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.green} />
      <SceneLabel index="10" title="independent verification" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 26 }}>
          <Eyebrow delay={2} color={c.green}>
            Verify
          </Eyebrow>
          <Kinetic
            text="The agent saying it worked is not evidence."
            delay={5}
            size={54}
            stagger={2}
            accent={c.green}
            accentWords={["evidence."]}
          />
        </Stack>

        <div style={{ height: 130 }}>
          <Flow nodes={nodes} edges={edges} width={1500} height={120} />
        </div>

        <Row gap={34} align="flex-start" style={{ marginTop: 16 }}>
          <Diff
            text={data.patch}
            delay={96}
            width={900}
            fontSize={17}
            title={"frozen patch · job " + data.jobId.slice(0, 8)}
          />
          <Stack gap={18}>
            <Panel delay={150} width={700} padding={"28px 30px"}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 14,
                  letterSpacing: 2.4,
                  textTransform: "uppercase",
                  color: c.faint,
                  marginBottom: 18,
                }}
              >
                required checks · exit codes read, not narrated
              </div>
              <Stack gap={14}>
                {data.checks.map((check, i) => (
                  <CheckRow
                    key={check.id}
                    text={check.argv}
                    at={156 + i * 10}
                    done={172 + i * 16}
                    detail={`exit ${check.exit} · ${check.ms} ms`}
                    color={c.green}
                  />
                ))}
                <CheckRow
                  text="Patch stays inside the plan's expected paths"
                  at={178}
                  done={200}
                  color={c.green}
                />
                <CheckRow
                  text="No tracked file mutated outside the patch"
                  at={186}
                  done={208}
                  color={c.green}
                />
              </Stack>
            </Panel>
            <CodeCard
              snippet={snippet("testWeakening")}
              delay={196}
              width={700}
              fontSize={14}
              accent={c.rose}
              caption="A patch that deletes an assertion stops here, in every mode."
            />
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const Publish: React.FC<{ duration: number }> = ({ duration }) => {
  return (
    <Scene duration={duration}>
      <Backdrop />
      <SceneLabel index="11" title="one safe pull request" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 30 }}>
          <Eyebrow delay={2}>Publish</Eyebrow>
          <Kinetic
            text="A pull request that carries evidence, not context."
            delay={5}
            size={54}
            stagger={2}
            accentWords={["evidence,"]}
          />
        </Stack>
        <Row gap={40} align="flex-start">
          <Window
            title={
              <>
                <GitHubMark size={15} /> acme/payments-ui · pull/1041
              </>
            }
            delay={26}
            width={980}
            height={510}
          >
            <div style={{ padding: "26px 30px" }}>
              <Row gap={12} style={{ marginBottom: 18 }}>
                <Pill delay={40} color={c.green} filled>
                  open
                </Pill>
                <span
                  style={{ fontFamily: mono, fontSize: 16, color: c.faint }}
                >
                  shadowqa/{data.jobId.slice(0, 8)} → main
                </span>
              </Row>
              <div style={{ fontSize: 27, fontWeight: 650, marginBottom: 18 }}>
                Automated maintenance verified by ShadowQA.
              </div>
              <Divider delay={52} />
              <div style={{ height: 20 }} />
              <Stack gap={13}>
                <CheckRow
                  text="Base commit"
                  at={58}
                  done={70}
                  detail={data.baseSha.slice(0, 12)}
                />
                <CheckRow
                  text="Plan digest"
                  at={64}
                  done={78}
                  detail={data.planDigest.slice(0, 12)}
                />
                <CheckRow
                  text="npm test"
                  at={70}
                  done={86}
                  detail="exit 0"
                  color={c.green}
                />
                <CheckRow
                  text="npm run typecheck"
                  at={76}
                  done={94}
                  detail="exit 0"
                  color={c.green}
                />
                <CheckRow
                  text="1 file, 1 line changed, inside the approved scope"
                  at={82}
                  done={102}
                />
              </Stack>
              <div style={{ height: 24 }} />
              <Row gap={10} style={{ flexWrap: "wrap" }}>
                <Pill delay={110} color={c.faint}>
                  no Slack excerpts
                </Pill>
                <Pill delay={115} color={c.faint}>
                  no private objective
                </Pill>
                <Pill delay={120} color={c.faint}>
                  fixed, approved summary
                </Pill>
              </Row>
            </div>
          </Window>
          <Stack gap={20} style={{ paddingTop: 10 }}>
            <Body delay={60} size={23} maxWidth={600} color={c.text}>
              The publisher rebuilds the changed files from the frozen patch,
              writes Git objects to its own branch, and never touches a
              human-owned branch.
            </Body>
            <Panel delay={92} width={600} padding={"26px 28px"}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 14,
                  letterSpacing: 2.2,
                  textTransform: "uppercase",
                  color: c.faint,
                }}
              >
                merging
              </div>
              <Stack gap={12} style={{ marginTop: 16 }}>
                <Row gap={12}>
                  <span
                    style={{ fontFamily: mono, color: c.cyan, fontSize: 16 }}
                  >
                    approval
                  </span>
                  <span style={{ color: c.dim, fontSize: 18 }}>
                    a human merges
                  </span>
                </Row>
                <Row gap={12}>
                  <span
                    style={{ fontFamily: mono, color: c.amber, fontSize: 16 }}
                  >
                    auto-fix
                  </span>
                  <span style={{ color: c.dim, fontSize: 18 }}>
                    a human merges
                  </span>
                </Row>
                <Row gap={12}>
                  <span
                    style={{ fontFamily: mono, color: c.violet, fontSize: 16 }}
                  >
                    full-auto
                  </span>
                  <span style={{ color: c.dim, fontSize: 18 }}>
                    exact head, required checks, branch rules
                  </span>
                </Row>
              </Stack>
              <div style={{ height: 18 }} />
              <Body delay={120} size={18} maxWidth={540}>
                Required human review always blocks the automatic merge.
              </Body>
            </Panel>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const ContinuousQA: React.FC<{ duration: number }> = ({ duration }) => {
  const nodes: Node[] = [
    {
      id: "saved",
      x: 170,
      y: 60,
      label: "Saved files",
      sub: "opt-in watch",
      color: c.dim,
      delay: 16,
      w: 200,
    },
    {
      id: "agent",
      x: 170,
      y: 180,
      label: "Agent changes",
      sub: "every job",
      color: c.blue,
      delay: 22,
      w: 200,
    },
    {
      id: "ci",
      x: 170,
      y: 300,
      label: "PR + CI",
      sub: "when connected",
      color: c.text,
      delay: 28,
      w: 200,
    },
    {
      id: "scan",
      x: 560,
      y: 180,
      label: "Independent checks",
      sub: "fresh containers",
      color: c.green,
      delay: 44,
      w: 250,
    },
    {
      id: "find",
      x: 950,
      y: 180,
      label: "Findings",
      sub: "fingerprinted",
      color: c.rose,
      delay: 62,
      w: 220,
    },
    {
      id: "repair",
      x: 1330,
      y: 180,
      label: "Bounded repair",
      sub: "2 attempts, cooldown",
      color: c.amber,
      delay: 80,
      w: 240,
    },
  ];
  const edges: Edge[] = [
    {
      from: "saved",
      to: "scan",
      delay: 38,
      every: 30,
      color: c.dim,
      curve: 14,
    },
    { from: "agent", to: "scan", delay: 40, every: 24, color: c.blue },
    { from: "ci", to: "scan", delay: 42, every: 30, color: c.dim, curve: -14 },
    { from: "scan", to: "find", delay: 58, every: 22, color: c.rose },
    { from: "find", to: "repair", delay: 76, every: 24, color: c.amber },
    {
      from: "repair",
      to: "scan",
      delay: 96,
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
      <SceneLabel index="12" title="it keeps watching" />
      <Safe>
        <Stack gap={12} style={{ marginBottom: 22 }}>
          <Eyebrow delay={2} color={c.rose}>
            Continuous QA
          </Eyebrow>
          <Kinetic
            text="The loop does not end at the merge."
            delay={5}
            size={54}
            stagger={2}
            accent={c.rose}
          />
        </Stack>
        <div style={{ height: 360 }}>
          <Flow nodes={nodes} edges={edges} width={1560} height={360} />
        </div>
        <Row gap={30} align="flex-start" style={{ marginTop: 10 }}>
          <CodeCard
            snippet={snippet("fingerprint")}
            delay={110}
            width={820}
            fontSize={15}
            accent={c.rose}
            caption="SHAs, durations and line numbers are normalised out, so the same failure is one finding."
          />
          <Panel delay={130} width={800} padding={"26px 30px"}>
            <Row gap={14} align="center" style={{ marginBottom: 18 }}>
              <span style={{ fontFamily: mono, fontSize: 17, color: c.rose }}>
                {data.finding.id}
              </span>
              <Pill delay={136} color={c.rose}>
                {data.finding.classification}
              </Pill>
              <Pill delay={141} color={c.faint}>
                <Counter
                  to={data.finding.occurrences}
                  start={140}
                  duration={20}
                />{" "}
                occurrences
              </Pill>
            </Row>
            <div
              style={{
                fontFamily: mono,
                fontSize: 16,
                color: c.dim,
                padding: "14px 16px",
                borderRadius: 10,
                background: "rgba(251,113,133,0.07)",
                border: `1px solid ${c.rose}26`,
              }}
            >
              {data.finding.signature}
            </div>
            <div style={{ height: 20 }} />
            <Stack gap={11}>
              <CheckRow
                text="Reproduced at the current base, not merely suspected"
                at={150}
                done={164}
                color={c.rose}
              />
              <CheckRow
                text="Flaky and environment failures classified separately"
                at={156}
                done={172}
                color={c.amber}
              />
              <CheckRow
                text="Two failed attempts stop the loop and escalate"
                at={162}
                done={180}
                color={c.amber}
              />
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
    "shadowqa setup",
    "shadowqa serve",
    "shadowqa runner start",
    "shadowqa ui",
  ];
  return (
    <Scene duration={duration} fadeOut={30}>
      <Backdrop />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 26 }}
      >
        <ShadowMark size={104} delay={2} />
        <Kinetic
          text="ShadowQA"
          delay={14}
          size={86}
          weight={800}
          stagger={0}
        />
        <Body
          delay={26}
          size={26}
          style={{ textAlign: "center" }}
          maxWidth={900}
        >
          Slack and GitHub context, a Gemini plan you approve, an isolated
          OpenCode session, and checks that run whether or not the agent says it
          worked.
        </Body>
        <div style={{ height: 16 }} />
        <Row
          gap={14}
          style={{ flexWrap: "wrap", justifyContent: "center", maxWidth: 1200 }}
        >
          {steps.map((step, i) => (
            <Pill key={step} delay={44 + i * 6} color={c.cyan}>
              {step}
            </Pill>
          ))}
        </Row>
        <div
          style={{
            marginTop: 26,
            fontFamily: mono,
            fontSize: 16,
            color: c.faint,
            letterSpacing: 1.4,
            opacity: interpolate(frame - 82, [0, 16], [0, 1], clamp),
          }}
        >
          {source.commands.length} commands · {source.moduleCount.business}{" "}
          modules · PostgreSQL · Docker · Gemini {source.geminiModel}
        </div>
      </AbsoluteFill>
    </Scene>
  );
};
