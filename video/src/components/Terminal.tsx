import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, clamp, easeOut, enter, font, shadow, SOFT } from "../theme";
import { code as mono } from "../fonts";

export type TermLine =
  | { kind: "prompt"; text: string; at: number; cps?: number }
  | { kind: "out"; text: string; at: number; color?: string }
  | { kind: "label"; label: string; value: string; at: number; color?: string }
  | { kind: "ok"; text: string; at: number }
  | { kind: "err"; text: string; at: number }
  | { kind: "step"; text: string; at: number; note?: string }
  | { kind: "rule"; at: number }
  | { kind: "banner"; at: number }
  | { kind: "spinner"; text: string; at: number; until: number }
  | { kind: "choice"; text: string; at: number; selected?: boolean };

const GLYPH = { mark: "◈", step: "◇", ok: "✓", err: "✕" };
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const Caret: React.FC<{ frame: number }> = ({ frame }) => (
  <span
    style={{
      display: "inline-block",
      width: "0.55em",
      height: "1.05em",
      background: c.cyan,
      transform: "translateY(0.18em)",
      marginLeft: 1,
      opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0.15,
    }}
  />
);

/** Mirrors `line()` in src/cli/ui.ts: dim label padded to 18, then the sanitized value. */
const Labelled: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div style={{ display: "flex", gap: 0 }}>
    <span style={{ color: c.faint, whiteSpace: "pre" }}>
      {label.toUpperCase().padEnd(18)}
    </span>
    <span style={{ color: color ?? c.text }}>{value}</span>
  </div>
);

const Line: React.FC<{ line: TermLine; frame: number; fps: number }> = ({
  line,
  frame,
  fps,
}) => {
  if (frame < line.at) return null;
  const age = frame - line.at;
  const p = interpolate(age, [0, 6], [0, 1], clamp);
  const base: React.CSSProperties = {
    opacity: p,
    transform: `translateY(${(1 - p) * 6}px)`,
    minHeight: "1.55em",
  };

  if (line.kind === "banner")
    return (
      <div style={{ ...base, padding: "6px 0 14px" }}>
        <span style={{ color: c.cyan, letterSpacing: 2 }}>
          {GLYPH.mark} SHADOWQA
        </span>
        <span style={{ color: c.faint }}>
          {"  "}observe → plan → verify → repair
        </span>
      </div>
    );

  if (line.kind === "rule")
    return (
      <div
        style={{
          ...base,
          height: 1,
          minHeight: 1,
          margin: "12px 0",
          background: c.stroke,
          width: `${p * 100}%`,
        }}
      />
    );

  if (line.kind === "prompt") {
    const chars = Math.max(0, Math.floor((age / fps) * (line.cps ?? 30)));
    const shown = line.text.slice(0, chars);
    return (
      <div style={base}>
        <span style={{ color: c.cyanDeep }}>❯ </span>
        <span style={{ color: c.text }}>{shown}</span>
        {chars < line.text.length ? <Caret frame={frame} /> : null}
      </div>
    );
  }

  if (line.kind === "label")
    return (
      <div style={base}>
        <Labelled label={line.label} value={line.value} color={line.color} />
      </div>
    );

  if (line.kind === "ok")
    return (
      <div style={base}>
        <span style={{ color: c.cyan }}>{GLYPH.ok} </span>
        <span>{line.text}</span>
      </div>
    );

  if (line.kind === "err")
    return (
      <div style={base}>
        <span style={{ color: c.rose }}>{GLYPH.err} </span>
        <span style={{ color: c.rose }}>{line.text}</span>
      </div>
    );

  if (line.kind === "step")
    return (
      <div style={base}>
        <span style={{ color: c.cyan }}>{GLYPH.step} </span>
        <span>{line.text}</span>
        {line.note ? (
          <span style={{ color: c.faint }}> [{line.note}]</span>
        ) : null}
      </div>
    );

  if (line.kind === "choice")
    return (
      <div
        style={{
          ...base,
          color: line.selected ? c.cyan : c.dim,
          background: line.selected ? "rgba(115,227,211,0.07)" : undefined,
          borderLeft: `2px solid ${line.selected ? c.cyan : "transparent"}`,
          paddingLeft: 10,
          marginLeft: -12,
        }}
      >
        {line.text}
      </div>
    );

  if (line.kind === "spinner") {
    const done = frame >= line.until;
    return (
      <div style={base}>
        <span style={{ color: done ? c.cyan : c.amber }}>
          {done ? GLYPH.ok : SPIN[Math.floor(age / 2) % SPIN.length]}{" "}
        </span>
        <span style={{ color: done ? c.text : c.dim }}>{line.text}</span>
      </div>
    );
  }

  return <div style={{ ...base, color: line.color ?? c.dim }}>{line.text}</div>;
};

export const Terminal: React.FC<{
  lines: TermLine[];
  title?: string;
  width?: number;
  height?: number;
  delay?: number;
  fontSize?: number;
  scrollFrom?: number;
  style?: React.CSSProperties;
}> = ({
  lines,
  title = "shadowqa",
  width = 1180,
  height,
  delay = 0,
  fontSize = 21,
  scrollFrom,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  const visible = lines.filter((l) => frame >= l.at).length;
  const overflow = scrollFrom ? Math.max(0, visible - scrollFrom) : 0;
  const scroll = interpolate(overflow, [0, 1], [0, fontSize * 1.55], {
    extrapolateRight: "extend",
    easing: easeOut,
  });

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 16,
        background: "rgba(8,11,15,0.92)",
        border: `1px solid ${c.stroke}`,
        boxShadow: shadow.lift,
        overflow: "hidden",
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px) scale(${0.985 + p * 0.015})`,
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 18px",
          borderBottom: `1px solid ${c.stroke}`,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {[c.faint, c.faint, c.faint].map((dot, i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: dot,
              opacity: 0.45,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 10,
            fontFamily: mono,
            fontSize: 15,
            color: c.faint,
            letterSpacing: 1,
          }}
        >
          {title}
        </span>
      </div>
      <div
        style={{
          padding: "22px 26px",
          fontFamily: mono,
          fontSize,
          lineHeight: 1.55,
          color: c.text,
          height: height ? height - 52 : undefined,
          overflow: "hidden",
        }}
      >
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          {lines.map((line, i) => (
            <Line key={i} line={line} frame={frame} fps={fps} />
          ))}
        </div>
      </div>
    </div>
  );
};

export const termFont = font.mono;
