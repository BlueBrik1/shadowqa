import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Backdrop,
  Row,
  Safe,
  Scene,
  SceneLabel,
  Stack,
} from "../components/Layout";
import { Body, Eyebrow, Kinetic, Typed } from "../components/Type";
import { ShadowMark, SlackMark, GitHubMark } from "../components/Marks";
import { CodeCard } from "../components/Code";
import { Panel, Pill } from "../components/Surfaces";
import { snippet } from "../generated/source";
import { c, clamp, easeOut, enter, POP } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

export const Open: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const swatch = enter(frame, fps, 74, POP);
  return (
    <Scene duration={duration} fadeIn={1} fadeOut={16}>
      <Backdrop />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 30 }}
      >
        <ShadowMark size={148} delay={4} />
        <Kinetic
          text="ShadowQA"
          delay={22}
          size={124}
          weight={800}
          stagger={0}
        />
        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            letterSpacing: 5,
            color: c.dim,
            opacity: interpolate(frame - 44, [0, 14], [0, 1], clamp),
          }}
        >
          <Typed text="observe → plan → verify → repair" start={46} cps={26} />
        </div>
        <div style={{ height: 14 }} />
        <Row gap={14}>
          <Pill delay={78} color={c.slack}>
            <SlackMark size={16} /> Slack
          </Pill>
          <Pill delay={82} color={c.text}>
            <GitHubMark size={15} /> GitHub
          </Pill>
          <Pill delay={86} color={c.violet}>
            Gemini plan
          </Pill>
          <Pill delay={90} color={c.blue}>
            isolated OpenCode
          </Pill>
          <Pill delay={94} color={c.green}>
            verified repair PR
          </Pill>
        </Row>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          right: 96,
          bottom: 84,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: swatch,
          transform: `translateY(${(1 - swatch) * 18}px)`,
        }}
      >
        <Panel delay={74} padding={"16px 20px"}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: c.cyan,
                boxShadow: `0 0 30px ${c.cyan}88`,
              }}
            />
            <span style={{ fontFamily: mono, fontSize: 15, color: c.dim }}>
              <span style={{ color: c.faint }}>src/cli/ui.ts</span>
              <br />
              chalk.hex("#73e3d3")
            </span>
          </div>
        </Panel>
      </div>
    </Scene>
  );
};

export const Problem: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.rose} />
      <SceneLabel index="01" title="the gap" />
      <Safe style={{ justifyContent: "flex-start", paddingTop: 140 }}>
        <Stack gap={22} style={{ maxWidth: 1000 }}>
          <Eyebrow delay={4} color={c.rose}>
            Before
          </Eyebrow>
          <Kinetic
            text="The decision lives in Slack. The regression ships from main."
            delay={8}
            size={60}
            accent={c.rose}
            accentWords={["Slack.", "main."]}
            maxWidth={1000}
          />
          <Body delay={26} maxWidth={860} size={24}>
            Someone already explained the fix. Someone else already reviewed the
            PR. None of it reaches the code.
          </Body>
        </Stack>

        <div
          style={{
            position: "absolute",
            right: 120,
            top: 155,
            width: 620,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {data.slackMessages.map((m, i) => {
            const at = 40 + i * 12;
            const p = interpolate(frame - at, [0, 12], [0, 1], {
              ...clamp,
              easing: easeOut,
            });
            const drift = interpolate(
              frame - (at + 60),
              [0, 70],
              [0, -22],
              clamp,
            );
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "16px 20px",
                  borderRadius: 14,
                  background: "rgba(13,18,24,0.9)",
                  border: `1px solid ${c.stroke}`,
                  opacity:
                    p * interpolate(frame - 150, [0, 30], [1, 0.25], clamp),
                  transform: `translate(${(1 - p) * 30}px, ${drift}px)`,
                }}
              >
                <SlackMark size={22} />
                <span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: mono,
                      fontSize: 14,
                      color: c.faint,
                    }}
                  >
                    {m.who}
                  </span>
                  <span
                    style={{ display: "block", fontSize: 18, marginTop: 4 }}
                  >
                    {m.text}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ position: "absolute", left: 120, bottom: 80 }}>
          <CodeCard
            snippet={snippet("buggy")}
            delay={78}
            width={740}
            fontSize={17}
            highlight={[4]}
            accent={c.rose}
            caption="fixtures/duplicate-submit — the guard is never set before the await."
          />
        </div>
      </Safe>
    </Scene>
  );
};
