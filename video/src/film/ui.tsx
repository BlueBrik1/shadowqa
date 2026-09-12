import React, { createContext, useContext } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, clamp, easeInOut, enter, envelope, font, SOFT, tone, type Tone } from "../theme";
import { sansFamily, serifFamily } from "../fonts";

/* ------------------------------------------------------------------------------------------ */
/* Tone: every scene is dark ground / light ink or the reverse. Children read it from context. */
/* ------------------------------------------------------------------------------------------ */

const ToneContext = createContext<Tone>("dark");
export const useTone = () => tone(useContext(ToneContext));
export const useToneName = () => useContext(ToneContext);

/** A scene: owns its fade envelope, its ground and its type. One idea per frame lives inside. */
export const Frame: React.FC<{
  children: React.ReactNode;
  duration: number;
  tone?: Tone;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ children, duration, tone: t = "dark", fadeIn = 12, fadeOut = 12 }) => {
  const frame = useCurrentFrame();
  const opacity = envelope(frame, duration, fadeIn, fadeOut);
  const palette = tone(t);
  return (
    <ToneContext.Provider value={t}>
      <AbsoluteFill style={{ background: palette.bg, opacity, color: palette.ink, fontFamily: sansFamily }}>
        {children}
      </AbsoluteFill>
    </ToneContext.Provider>
  );
};

/** Constant margins so cuts never jitter the frame. */
export const Safe: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill
    style={{ padding: "84px 120px", display: "flex", flexDirection: "column", justifyContent: "center", ...style }}
  >
    {children}
  </AbsoluteFill>
);

export const Row: React.FC<{
  children: React.ReactNode;
  gap?: number;
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  style?: React.CSSProperties;
}> = ({ children, gap = 24, align = "center", justify = "flex-start", style }) => (
  <div style={{ display: "flex", flexDirection: "row", gap, alignItems: align, justifyContent: justify, ...style }}>
    {children}
  </div>
);

export const Col: React.FC<{
  children: React.ReactNode;
  gap?: number;
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  style?: React.CSSProperties;
}> = ({ children, gap = 24, align = "flex-start", justify = "center", style }) => (
  <div style={{ display: "flex", flexDirection: "column", gap, alignItems: align, justifyContent: justify, ...style }}>
    {children}
  </div>
);

/* ------------------------------------------------------------------------------------------ */
/* Type                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** The one sentence on screen. Serif, word-staggered, never more than two lines. */
export const Sentence: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  maxWidth?: number;
  align?: "left" | "center";
  emphasis?: string[];
  emphasisColor?: string;
  weight?: 400 | 600;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 64, maxWidth = 1280, align = "left", emphasis = [], emphasisColor, weight = 400, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const words = text.split(" ");
  return (
    <p
      style={{
        margin: 0,
        fontFamily: serifFamily,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.18,
        letterSpacing: -0.5,
        color: t.ink,
        maxWidth,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        textAlign: align,
        gap: `0 ${size * 0.24}px`,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const p = enter(frame, fps, delay + i * 2.2, SOFT);
        const bare = word.replace(/[^A-Za-z0-9-]/g, "");
        const hit = emphasis.includes(bare);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.3}px)`,
              color: hit ? (emphasisColor ?? t.ink) : undefined,
              fontStyle: hit && !emphasisColor ? "italic" : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </p>
  );
};

/** Small sans label: an eyebrow above a sentence, a step name, a caption under a window. */
export const Label: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, size = 18, color, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const p = enter(frame, fps, delay);
  return (
    <div
      style={{
        fontFamily: sansFamily,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: color ?? t.dim,
        opacity: p,
        transform: `translateX(${(1 - p) * -12}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Body copy in Work Sans. Used sparingly; the film is mostly one sentence at a time. */
export const Text: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, size = 24, color, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <div
      style={{
        fontFamily: sansFamily,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.45,
        color: color ?? t.dim,
        opacity: p,
        transform: `translateY(${(1 - p) * 12}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Typed text with a block caret; used in terminals and chat inputs. */
export const Typed: React.FC<{
  text: string;
  start: number;
  cps?: number;
  caret?: boolean;
  style?: React.CSSProperties;
}> = ({ text, start, cps = 34, caret = true, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const chars = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  const shown = text.slice(0, chars);
  const done = chars >= text.length;
  const blink = Math.floor(frame / 9) % 2 === 0;
  return (
    <span style={{ fontFamily: font.mono, whiteSpace: "pre-wrap", ...style }}>
      {shown}
      {caret && frame >= start && (!done || blink) ? (
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            height: "1.05em",
            marginLeft: 2,
            transform: "translateY(0.18em)",
            background: t.ink,
          }}
        />
      ) : null}
    </span>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Motion helpers                                                                             */
/* ------------------------------------------------------------------------------------------ */

/** Fade + rise for any block. */
export const Rise: React.FC<{
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, distance = 22, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>{children}</div>
  );
};

/** Visible only between two frames (with a short fade). */
export const Between: React.FC<{
  children: React.ReactNode;
  from: number;
  to?: number;
  fade?: number;
  style?: React.CSSProperties;
}> = ({ children, from, to = 1e9, fade = 8, style }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + fade, to - fade, to], [0, 1, 1, 0], clamp);
  if (frame < from || frame > to) return null;
  return <div style={{ opacity, ...style }}>{children}</div>;
};

/** A horizontal rule that draws itself. */
export const Rule: React.FC<{ delay?: number; width?: number | string; style?: React.CSSProperties }> = ({
  delay = 0,
  width = "100%",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <div style={{ width, height: 1, background: t.ruleStrong, transformOrigin: "left", transform: `scaleX(${p})`, ...style }} />
  );
};

/** The brand mark: a diamond outline with a filled centre. */
export const Mark: React.FC<{ size?: number; color?: string; style?: React.CSSProperties }> = ({ size = 40, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={style}>
      <path d="M20 2 L38 20 L20 38 L2 20 Z" fill="none" stroke={ink} strokeWidth={2.4} strokeLinejoin="miter" />
      <path d="M20 12 L28 20 L20 28 L12 20 Z" fill={ink} />
    </svg>
  );
};

/** The wordmark. */
export const Wordmark: React.FC<{ size?: number; sub?: string; delay?: number }> = ({ size = 56, sub, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <Row gap={size * 0.4} style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      <Mark size={size * 0.9} />
      <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: size, letterSpacing: size * 0.16, color: t.ink }}>
        SHADOWQA
      </span>
      {sub ? (
        <span style={{ fontFamily: serifFamily, fontSize: size * 0.5, color: t.dim, marginLeft: size * 0.1 }}>{sub}</span>
      ) : null}
    </Row>
  );
};

/** Progress hairline at the bottom of the film. */
export const Progress: React.FC<{ total: number; value: number }> = ({ total, value }) => {
  const { width } = useVideoConfig();
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width, background: "rgba(128,128,128,0.18)" }}>
      <div style={{ height: 2, width: width * Math.min(1, Math.max(0, value / total)), background: c.dim }} />
    </div>
  );
};

/** ✓ or ✕ badge in the two permitted status colours. */
export const Status: React.FC<{ ok: boolean; size?: number; delay?: number; label?: string }> = ({ ok, size = 28, delay = 0, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay);
  const color = ok ? c.good : c.bad;
  return (
    <Row gap={size * 0.4} style={{ opacity: p, transform: `scale(${0.85 + p * 0.15})` }}>
      <span style={{ fontFamily: sansFamily, fontWeight: 600, fontSize: size, color, lineHeight: 1 }}>{ok ? "✓" : "✕"}</span>
      {label ? <span style={{ fontFamily: sansFamily, fontSize: size * 0.75, color }}>{label}</span> : null}
    </Row>
  );
};

/** Chapter marker top-left, so the viewer knows which half of the product they are in. */
export const Chapter: React.FC<{ index: string; title: string }> = ({ index, title }) => {
  const t = useTone();
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        top: 56,
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: sansFamily,
        fontSize: 16,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: t.faint,
      }}
    >
      <span style={{ color: t.dim }}>{index}</span>
      <span style={{ width: 22, height: 1, background: t.ruleStrong }} />
      <span>{title}</span>
    </div>
  );
};

/** Draw-on arrow between two points, for flows. */
export const Arrow: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  delay?: number; length?: number; color?: string; width?: number; dashed?: boolean;
}> = ({ x1, y1, x2, y2, delay = 0, length = 26, color, width = 2, dashed }) => {
  const frame = useCurrentFrame();
  const t = useTone();
  const p = interpolate(frame, [delay, delay + length], [0, 1], { ...clamp, easing: easeInOut });
  const ink = color ?? t.dim;
  const ex = x1 + (x2 - x1) * p, ey = y1 + (y2 - y1) * p;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 12;
  return (
    <g>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={ink} strokeWidth={width} strokeDasharray={dashed ? "6 8" : undefined} />
      {p > 0.98 ? (
        <polygon
          points={`${x2},${y2} ${x2 - head * Math.cos(angle - 0.45)},${y2 - head * Math.sin(angle - 0.45)} ${x2 - head * Math.cos(angle + 0.45)},${y2 - head * Math.sin(angle + 0.45)}`}
          fill={ink}
        />
      ) : null}
    </g>
  );
};

export const fonts = { sans: sansFamily, serif: serifFamily, mono: font.mono };
