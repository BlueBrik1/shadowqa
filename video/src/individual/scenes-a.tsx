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
import { Terminal, type TermLine } from "../components/Terminal";
import { CodeCard } from "../components/Code";
import { Panel, Pill, CheckRow } from "../components/Surfaces";
import { Panelette } from "../components/Panelette";
import {
  ClaudeMark,
  OpenAIMark,
  ShadowMark,
  Glyph,
  GeminiMark,
} from "../components/Marks";
import { snippet } from "../generated/source";
import { c, clamp, easeOut, enter, SOFT } from "../theme";
import { code as mono } from "../fonts";
import * as data from "./data";

const Header: React.FC<{
  step?: string;
  title: string;
  note?: string;
  accent?: string;
  size?: number;
}> = ({ step, title, note, accent = c.cyan, size = 52 }) => (
  <Stack gap={13} style={{ marginBottom: 28 }}>
    {step ? (
      <Eyebrow delay={2} color={accent}>
        {step}
      </Eyebrow>
    ) : null}
    <Kinetic
      text={title}
      delay={5}
      size={size}
      stagger={1.8}
      accent={accent}
      maxWidth={1500}
    />
    {note ? (
      <Body delay={14} size={22} maxWidth={1120}>
        {note}
      </Body>
    ) : null}
  </Stack>
);

export const Open: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <Scene duration={duration} fadeIn={1} fadeOut={16}>
      <Backdrop />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 26 }}
      >
        <ShadowMark size={140} delay={4} />
        <Kinetic
          text="ShadowQA"
          delay={20}
          size={112}
          weight={800}
          stagger={0}
        />
        <div
          style={{
            fontFamily: mono,
            fontSize: 24,
            letterSpacing: 8,
            color: c.cyan,
            opacity: interpolate(frame - 40, [0, 14], [0, 1], clamp),
          }}
        >
          INDIVIDUAL
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 23,
            letterSpacing: 3,
            color: c.dim,
            marginTop: 8,
          }}
        >
          <Typed
            text="conversations → plan → verify → repair"
            start={52}
            cps={26}
          />
        </div>
        <div style={{ height: 18 }} />
        <Row gap={14}>
          <Pill delay={84} color={c.openai}>
            <OpenAIMark size={15} color={c.openai} /> ChatGPT
          </Pill>
          <Pill delay={88} color={c.claude}>
            <ClaudeMark size={15} /> Claude
          </Pill>
          <Pill delay={92} color={c.text}>
            Claude Code
          </Pill>
          <Pill delay={96} color={c.text}>
            Codex
          </Pill>
          <Pill delay={100} color={c.violet}>
            Gemini plan
          </Pill>
          <Pill delay={104} color={c.green}>
            verified diff
          </Pill>
        </Row>
      </AbsoluteFill>
    </Scene>
  );
};

export const Problem: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const tabs = [
    {
      label: "ChatGPT",
      text: "We double-charge on double click.",
      color: c.openai,
      icon: <OpenAIMark size={16} color={c.openai} />,
    },
    {
      label: "Claude",
      text: "Don't touch the retry banner.",
      color: c.claude,
      icon: <ClaudeMark size={16} />,
    },
    {
      label: "Claude Code",
      text: "41 turns of decisions, on disk.",
      color: c.text,
      icon: null,
    },
    {
      label: "Codex",
      text: "A rollout nobody will read again.",
      color: c.text,
      icon: null,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.claude} />
      <SceneLabel index="01" title="the scatter" />
      <Safe style={{ justifyContent: "flex-start", paddingTop: 150 }}>
        <Stack gap={20} style={{ maxWidth: 1060 }}>
          <Eyebrow delay={4} color={c.claude}>
            Before
          </Eyebrow>
          <Kinetic
            text="You already decided all of this. In four tabs and two terminals."
            delay={8}
            size={58}
            accent={c.claude}
            accentWords={["terminals."]}
            maxWidth={1040}
          />
          <Body delay={26} maxWidth={900} size={24}>
            The requirement is in one chat, the constraint in another, and the
            reasoning in a CLI transcript you will never open again. The code
            never hears about any of it.
          </Body>
        </Stack>
        <Row
          gap={20}
          style={{ position: "absolute", left: 120, bottom: 120, width: 1680 }}
        >
          {tabs.map((tab, i) => {
            const at = 44 + i * 11;
            const p = interpolate(frame - at, [0, 14], [0, 1], {
              ...clamp,
              easing: easeOut,
            });
            const drift = interpolate(
              frame - (at + 70),
              [0, 80],
              [0, -14],
              clamp,
            );
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  padding: "22px 24px",
                  borderRadius: 14,
                  background: "rgba(13,18,24,0.9)",
                  border: `1px solid ${c.stroke}`,
                  opacity:
                    p * interpolate(frame - 132, [0, 34], [1, 0.3], clamp),
                  transform: `translateY(${(1 - p) * 24 + drift}px)`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    fontFamily: mono,
                    fontSize: 14,
                    color: tab.color,
                    letterSpacing: 1,
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 19,
                    color: c.dim,
                    lineHeight: 1.45,
                  }}
                >
                  {tab.text}
                </div>
              </div>
            );
          })}
        </Row>
      </Safe>
    </Scene>
  );
};

export const SetupClaude: React.FC<{ duration: number }> = ({ duration }) => {
  const lines: TermLine[] = [
    { kind: "prompt", text: "shadowqa-individual setup", at: 2, cps: 26 },
    { kind: "banner", at: 26 },
    { kind: "out", text: "  1/4  CLAUDE", at: 34, color: c.cyan },
    { kind: "spinner", text: "claude --version", at: 44, until: 62 },
    { kind: "ok", text: "Claude Code CLI found (2.1.269).", at: 64 },
    {
      kind: "ok",
      text: "3 local Claude Code session transcript(s) at ~/.claude/projects.",
      at: 74,
    },
    {
      kind: "out",
      text: "  Claude Chat (claude.ai) is captured by the extension in step 3.",
      at: 84,
    },
    {
      kind: "out",
      text: "  ShadowQA reads only sessions you opt in, never your account credentials.",
      at: 92,
    },
    {
      kind: "prompt",
      text: "Install Claude Code session hooks so new sessions are noticed? [y/N] y",
      at: 104,
      cps: 36,
    },
    {
      kind: "ok",
      text: "Hooks written to ~/.claude/settings.json (SessionStart, Stop, SessionEnd).",
      at: 150,
    },
    {
      kind: "err",
      text: "Claude Code asks you to review changed hooks in /hooks first.",
      at: 160,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.claude} />
      <SceneLabel index="02" title="connect claude" />
      <Safe>
        <Header
          step="Step 1 of 4"
          title="Claude, on your machine."
          note="The CLI, its own transcripts, and hooks that tell ShadowQA a session moved."
          accent={c.claude}
        />
        <Row gap={38} align="flex-start">
          <Terminal lines={lines} delay={2} width={900} fontSize={19} />
          <Stack gap={18}>
            <CodeCard
              snippet={snippet("claudeCodeTranscript")}
              delay={50}
              width={720}
              fontSize={15}
              accent={c.claude}
              caption="The documented, user-owned location — not a private endpoint."
            />
            <Panel delay={120} width={720} padding={"22px 26px"}>
              <Stack gap={11}>
                <CheckRow
                  text="Reads only sessions you subscribe to"
                  at={126}
                  done={140}
                  color={c.claude}
                />
                <CheckRow
                  text="Skips subagent and tool traffic"
                  at={132}
                  done={148}
                  color={c.claude}
                />
                <CheckRow
                  text="Never touches your Claude credentials"
                  at={138}
                  done={156}
                  color={c.claude}
                />
              </Stack>
            </Panel>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const SetupOpenAI: React.FC<{ duration: number }> = ({ duration }) => {
  const lines: TermLine[] = [
    { kind: "out", text: "  2/4  OPENAI", at: 4, color: c.cyan },
    { kind: "spinner", text: "codex --version", at: 14, until: 34 },
    { kind: "ok", text: "Codex CLI found (0.133.0).", at: 36 },
    {
      kind: "ok",
      text: "12 local Codex session file(s) at ~/.codex/sessions.",
      at: 46,
    },
    {
      kind: "out",
      text: "  ChatGPT (chatgpt.com) is captured by the extension in step 3.",
      at: 56,
    },
    {
      kind: "err",
      text: "Codex threads never written to this machine are not visible to ShadowQA.",
      at: 68,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.openai} />
      <SceneLabel index="03" title="connect openai" />
      <Safe>
        <Header
          step="Step 2 of 4"
          title="OpenAI, and an honest boundary."
          note="Local Codex rollouts are readable. Cloud threads that never reached this machine are not, and ShadowQA says so."
          accent={c.openai}
        />
        <Row gap={38} align="flex-start">
          <Terminal lines={lines} delay={2} width={900} fontSize={19} />
          <Stack gap={18}>
            <CodeCard
              snippet={snippet("codexSessions")}
              delay={30}
              width={720}
              fontSize={15}
              accent={c.openai}
            />
            <Panel delay={96} width={720} padding={"24px 26px"}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 14,
                  letterSpacing: 2.2,
                  textTransform: "uppercase",
                  color: c.faint,
                  marginBottom: 16,
                }}
              >
                what it will never claim
              </div>
              <Row gap={10} style={{ flexWrap: "wrap" }}>
                <Pill delay={104} color={c.faint}>
                  no unopened conversations
                </Pill>
                <Pill delay={109} color={c.faint}>
                  no desktop apps
                </Pill>
                <Pill delay={114} color={c.faint}>
                  no attachments
                </Pill>
                <Pill delay={119} color={c.faint}>
                  no full account history
                </Pill>
              </Row>
            </Panel>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

export const SetupExtension: React.FC<{ duration: number }> = ({
  duration,
}) => {
  const lines: TermLine[] = [
    { kind: "out", text: "  3/4  EXTENSION", at: 4, color: c.cyan },
    { kind: "ok", text: "Built extension is ready to load unpacked.", at: 14 },
    {
      kind: "label",
      label: "1.",
      value: "Open chrome://extensions and turn on Developer mode",
      at: 24,
    },
    {
      kind: "label",
      label: "2.",
      value: "Choose Load unpacked and select individual/extension/dist",
      at: 32,
    },
    {
      kind: "label",
      label: "3.",
      value: "Copy the extension ID shown on its card",
      at: 40,
    },
    {
      kind: "prompt",
      text: "Extension ID: mhjfbmdgcfjbbpaeojofohoefgiehjai",
      at: 52,
      cps: 44,
    },
    {
      kind: "spinner",
      text: "registering native messaging host",
      at: 84,
      until: 104,
    },
    {
      kind: "ok",
      text: "Native messaging host registered for chrome, edge, chromium.",
      at: 106,
    },
    { kind: "rule", at: 116 },
    { kind: "prompt", text: "shadowqa-individual pair", at: 122, cps: 24 },
    { kind: "out", text: "  K 7 F 2 Q A 9 M", at: 146, color: c.cyan },
    {
      kind: "out",
      text: "  Type it into the ShadowQA side panel within 10 minutes.",
      at: 154,
    },
  ];
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.blue} />
      <SceneLabel index="04" title="load unpacked, then pair" />
      <Safe>
        <Header
          step="Step 3 of 4"
          title="A side panel you load yourself."
          note="No store listing. The companion registers a native messaging host for one exact extension ID, and pairing is a code you read from your own terminal."
          accent={c.blue}
          size={48}
        />
        <Row gap={38} align="flex-start">
          <Terminal lines={lines} delay={2} width={880} fontSize={18} />
          <Panelette
            delay={40}
            width={430}
            height={560}
            state={{
              paired: false,
              pairAt: 150,
              code: "K7F2QA9M",
              trackAt: 190,
              site: "ChatGPT",
              title: "Duplicate submissions",
              turns: 4,
              status: "tracking",
              conversations: [],
            }}
          />
          <Stack gap={16} style={{ paddingTop: 8, width: 300 }}>
            <Pill delay={60} color={c.dim}>
              storage
            </Pill>
            <Pill delay={66} color={c.dim}>
              sidePanel
            </Pill>
            <Pill delay={72} color={c.dim}>
              nativeMessaging
            </Pill>
            <div style={{ height: 6 }} />
            <Body delay={80} size={18} maxWidth={300}>
              Three permissions, plus the two sites it reads. No tabs
              permission, no cookies, no undocumented endpoints.
            </Body>
          </Stack>
        </Row>
      </Safe>
    </Scene>
  );
};

const MODES = [
  { id: "observe", text: "Watch and check only.", color: c.dim },
  {
    id: "approval",
    text: "Ask first. Plans and repairs wait for your yes.",
    color: c.cyan,
  },
  {
    id: "auto-fix",
    text: "Bounded automatic repair inside the automatic paths.",
    color: c.amber,
  },
  {
    id: "full-auto",
    text: "Approved plans run without a second confirmation.",
    color: c.violet,
  },
];

export const SetupMode: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pickedMode = 1;
  const pickedBackend = 1;
  const modeChosen = frame >= 92;
  const backendChosen = frame >= 150;
  return (
    <Scene duration={duration}>
      <Backdrop tint={c.violet} />
      <SceneLabel index="05" title="how much, and with what" />
      <Safe>
        <Header
          step="Step 4 of 4"
          title="How much should it do, and which tool should do it?"
          accent={c.violet}
          size={46}
        />
        <Row gap={18} align="stretch">
          {MODES.map((mode, i) => {
            const p = enter(frame, fps, 18 + i * 6, SOFT);
            const active = modeChosen && i === pickedMode;
            const dimmed = modeChosen && i !== pickedMode;
            return (
              <div
                key={mode.id}
                style={{
                  flex: 1,
                  padding: "22px 22px",
                  borderRadius: 16,
                  background: active
                    ? `${mode.color}12`
                    : "rgba(13,18,24,0.85)",
                  border: `1px solid ${active ? `${mode.color}77` : c.stroke}`,
                  opacity: p * (dimmed ? 0.35 : 1),
                  transform: `translateY(${(1 - p) * 18}px) scale(${active ? 1.02 : 1})`,
                }}
              >
                <div
                  style={{ fontFamily: mono, fontSize: 19, color: mode.color }}
                >
                  {mode.id}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 17,
                    color: c.dim,
                    minHeight: 74,
                  }}
                >
                  {mode.text}
                </div>
              </div>
            );
          })}
        </Row>

        <div style={{ height: 34 }} />
        <Row gap={18} align="stretch">
          {data.backendRows.map((backend, i) => {
            const p = enter(frame, fps, 60 + i * 8, SOFT);
            const active = backendChosen && i === pickedBackend;
            const dimmed = backendChosen && i !== pickedBackend;
            const colour = [c.blue, c.claude, c.openai][i];
            return (
              <div
                key={backend.id}
                style={{
                  flex: 1,
                  padding: "24px 24px",
                  borderRadius: 16,
                  background: active ? `${colour}12` : "rgba(13,18,24,0.85)",
                  border: `1px solid ${active ? `${colour}77` : c.stroke}`,
                  boxShadow: active ? `0 30px 70px -34px ${colour}` : undefined,
                  opacity: p * (dimmed ? 0.35 : 1),
                  transform: `translateY(${(1 - p) * 18}px) scale(${active ? 1.02 : 1})`,
                }}
              >
                <Row gap={12}>
                  {i === 1 ? (
                    <ClaudeMark size={20} />
                  ) : i === 2 ? (
                    <OpenAIMark size={20} color={c.openai} />
                  ) : null}
                  <span
                    style={{ fontFamily: mono, fontSize: 20, color: colour }}
                  >
                    {backend.id}
                  </span>
                </Row>
                <div style={{ marginTop: 10, fontSize: 18, color: c.dim }}>
                  {backend.detail}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    fontFamily: mono,
                    fontSize: 14,
                    color: c.faint,
                    overflowWrap: "anywhere",
                  }}
                >
                  {backend.attach}
                </div>
                {active ? (
                  <div style={{ marginTop: 14 }}>
                    <Pill delay={154} color={colour} filled>
                      selected
                    </Pill>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Row>

        <div style={{ height: 30 }} />
        <Row gap={26} align="flex-start">
          <CodeCard
            snippet={snippet("backends")}
            delay={172}
            width={900}
            fontSize={17}
            accent={c.violet}
          />
          <Row gap={14} style={{ paddingTop: 14 }}>
            <Glyph color={c.violet} size={48} delay={176}>
              <GeminiMark size={24} />
            </Glyph>
            <Stack gap={5}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>
                Planning stays on Gemini
              </span>
              <span style={{ fontFamily: mono, fontSize: 15, color: c.faint }}>
                {data.model} — the coding tool is a separate choice
              </span>
            </Stack>
          </Row>
        </Row>
      </Safe>
    </Scene>
  );
};
