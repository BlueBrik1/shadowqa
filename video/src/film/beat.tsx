import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Frame, Sentence, Chapter, Label } from "./ui";
import { clamp, type Tone } from "../theme";

/**
 * The film's one layout: a single sentence at the top, one visual below it. When the sentence
 * must change inside a scene, `sentence` may be an array of {from, text} — only one is shown.
 */
export type Line = { from: number; text: string; emphasis?: string[]; emphasisColor?: string };

export const Beat: React.FC<{
  duration: number;
  tone?: Tone;
  chapter?: { index: string; title: string };
  eyebrow?: string;
  sentence: string | Line[];
  emphasis?: string[];
  emphasisColor?: string;
  sentenceSize?: number;
  children?: React.ReactNode;
  /** Vertical placement of the visual: start, centre or end of the space below the sentence. */
  visualAt?: "start" | "center" | "end";
}> = ({ duration, tone = "dark", chapter, eyebrow, sentence, emphasis, emphasisColor, sentenceSize = 50, children, visualAt = "center" }) => {
  const lines: Line[] = typeof sentence === "string" ? [{ from: 0, text: sentence, emphasis, emphasisColor }] : sentence;
  return (
    <Frame duration={duration} tone={tone}>
      {chapter ? <Chapter index={chapter.index} title={chapter.title} /> : null}
      <AbsoluteFill style={{ padding: "96px 120px 0" }}>
        {eyebrow ? <Label delay={2} style={{ marginBottom: 18 }}>{eyebrow}</Label> : null}
        <div style={{ height: 150, position: "relative" }}>
          {lines.map((l, i) => (
            <Shown key={i} from={l.from} until={lines[i + 1]?.from}>
              <Sentence text={l.text} size={sentenceSize} maxWidth={1560} emphasis={l.emphasis} emphasisColor={l.emphasisColor} />
            </Shown>
          ))}
        </div>
      </AbsoluteFill>
      {children ? (
        <div
          style={{
            position: "absolute",
            top: 290,
            left: 0,
            right: 0,
            bottom: 0,
            padding: "0 120px 48px",
            display: "flex",
            alignItems: visualAt === "start" ? "flex-start" : visualAt === "end" ? "flex-end" : "center",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      ) : null}
    </Frame>
  );
};

/** Mounts children from `from` (restarting their animations) and fades them before `until`. */
export const Shown: React.FC<{ children: React.ReactNode; from: number; until?: number; style?: React.CSSProperties }> = ({ children, from, until, style }) => {
  const frame = useCurrentFrame();
  const end = until ?? 1e9;
  if (frame < from || frame >= end) return null;
  const out = interpolate(frame, [end - 10, end], [1, 0], clamp);
  return (
    <Sequence from={from} layout="none">
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, opacity: out, ...style }}>{children}</div>
    </Sequence>
  );
};

/** A sentence alone in the frame: for the statements between chapters. */
export const Statement: React.FC<{
  duration: number;
  tone?: Tone;
  text: string;
  emphasis?: string[];
  emphasisColor?: string;
  size?: number;
  sub?: string;
}> = ({ duration, tone = "light", text, emphasis, emphasisColor, size = 76, sub }) => (
  <Frame duration={duration} tone={tone}>
    <AbsoluteFill style={{ padding: "0 200px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 34 }}>
      <Sentence text={text} size={size} align="center" maxWidth={1520} emphasis={emphasis} emphasisColor={emphasisColor} />
      {sub ? <Label delay={20} size={17}>{sub}</Label> : null}
    </AbsoluteFill>
  </Frame>
);
