import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, clamp, easeOut, enter, font, SOFT } from "../theme";

/** Per-word spring stagger. Words rise and unblur; letters never wobble independently. */
export const Kinetic: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  weight?: number;
  color?: string;
  accent?: string;
  accentWords?: string[];
  stagger?: number;
  lineHeight?: number;
  maxWidth?: number;
}> = ({
  text,
  delay = 0,
  size = 84,
  weight = 700,
  color = c.text,
  accent = c.cyan,
  accentWords = [],
  stagger = 3,
  lineHeight = 1.08,
  maxWidth,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <h1
      style={{
        margin: 0,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: size > 60 ? -2.4 : -1,
        lineHeight,
        color,
        maxWidth,
        display: "flex",
        flexWrap: "wrap",
        gap: `0 ${size * 0.26}px`,
      }}
    >
      {words.map((word, i) => {
        const p = enter(frame, fps, delay + i * stagger, SOFT);
        const bare = word.replace(/[^A-Za-z0-9-]/g, "");
        const isAccent =
          accentWords.includes(bare) || accentWords.includes(word);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.42}px)`,
              filter: `blur(${(1 - p) * 10}px)`,
              color: isAccent ? accent : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </h1>
  );
};

export const Eyebrow: React.FC<{
  children: React.ReactNode;
  delay?: number;
  color?: string;
}> = ({ children, delay = 0, color = c.cyan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: font.mono,
        fontSize: 19,
        letterSpacing: 4,
        textTransform: "uppercase",
        color,
        opacity: p,
        transform: `translateX(${(1 - p) * -18}px)`,
      }}
    >
      <span
        style={{
          width: 30 * p,
          height: 2,
          background: color,
          boxShadow: `0 0 14px ${color}`,
        }}
      />
      {children}
    </div>
  );
};

export const Body: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  maxWidth?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  delay = 0,
  size = 26,
  color = c.dim,
  maxWidth = 760,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <p
      style={{
        margin: 0,
        fontSize: size,
        lineHeight: 1.5,
        color,
        maxWidth,
        opacity: p,
        transform: `translateY(${(1 - p) * 16}px)`,
        ...style,
      }}
    >
      {children}
    </p>
  );
};

/** Character reveal used where the text should feel typed rather than placed. */
export const Typed: React.FC<{
  text: string;
  start: number;
  cps?: number;
  style?: React.CSSProperties;
  caret?: boolean;
  caretColor?: string;
}> = ({ text, start, cps = 36, style, caret = true, caretColor = c.cyan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = Math.max(0, Math.floor(((frame - start) / fps) * cps));
  const shown = text.slice(0, chars);
  const done = chars >= text.length;
  const blink = Math.floor(frame / 8) % 2 === 0;
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
            background: caretColor,
            opacity: done ? (blink ? 1 : 0) : 1,
          }}
        />
      ) : null}
    </span>
  );
};

/** Odometer-style counter; values land on integers so no frame shows a fractional count. */
export const Counter: React.FC<{
  to: number;
  start: number;
  duration?: number;
  suffix?: string;
  style?: React.CSSProperties;
}> = ({ to, start, duration = 40, suffix = "", style }) => {
  const frame = useCurrentFrame();
  const value = Math.round(
    interpolate(frame, [start, start + duration], [0, to], {
      ...clamp,
      easing: easeOut,
    }),
  );
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {value}
      {suffix}
    </span>
  );
};
