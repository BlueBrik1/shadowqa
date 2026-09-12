import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { c, clamp, easeInOut, envelope, font } from "../theme";
import { display } from "../fonts";

export const Backdrop: React.FC<{ tint?: string; drift?: boolean }> = ({
  tint = c.cyan,
  drift = true,
}) => {
  const frame = useCurrentFrame();
  const t = drift ? frame / 90 : 0;
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 700px at ${50 + Math.sin(t) * 8}% ${
            18 + Math.cos(t * 0.8) * 6
          }%, ${tint}1A, transparent 62%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 600px at ${18 + Math.cos(t * 0.6) * 10}% ${
            85 + Math.sin(t * 0.5) * 5
          }%, ${c.violet}12, transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${c.stroke} 1px, transparent 1px), linear-gradient(90deg, ${c.stroke} 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(1400px 900px at 50% 45%, rgba(0,0,0,0.55), transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(1400px 900px at 50% 45%, rgba(0,0,0,0.55), transparent 75%)",
          opacity: 0.6,
        }}
      />
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 260px 90px rgba(0,0,0,0.75)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * A scene owns its own fade envelope and a small parallax push, so scenes can be dropped into
 * a Series in any order without a parent choreographing them.
 */
export const Scene: React.FC<{
  children: React.ReactNode;
  duration: number;
  fadeIn?: number;
  fadeOut?: number;
  push?: number;
  style?: React.CSSProperties;
}> = ({ children, duration, fadeIn = 12, fadeOut = 12, push = 18, style }) => {
  const frame = useCurrentFrame();
  const opacity = envelope(frame, duration, fadeIn, fadeOut);
  const y = interpolate(
    frame,
    [0, fadeIn, duration - fadeOut, duration],
    [push, 0, 0, -push * 0.6],
    { ...clamp, easing: easeInOut },
  );
  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        fontFamily: display,
        color: c.text,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const Stack: React.FC<{
  children: React.ReactNode;
  gap?: number;
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  style?: React.CSSProperties;
}> = ({
  children,
  gap = 24,
  align = "flex-start",
  justify = "center",
  style,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap,
      alignItems: align,
      justifyContent: justify,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Row: React.FC<{
  children: React.ReactNode;
  gap?: number;
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  style?: React.CSSProperties;
}> = ({
  children,
  gap = 24,
  align = "center",
  justify = "flex-start",
  style,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "row",
      gap,
      alignItems: align,
      justifyContent: justify,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Keeps every scene on the same margin so cuts do not jitter the frame. */
export const Safe: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <AbsoluteFill
    style={{
      padding: "96px 120px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const SceneLabel: React.FC<{
  index: string;
  title: string;
  opacity?: number;
}> = ({ index, title, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: 120,
      top: 64,
      display: "flex",
      gap: 14,
      alignItems: "center",
      fontFamily: font.mono,
      fontSize: 18,
      letterSpacing: 2,
      color: c.faint,
      opacity,
    }}
  >
    <span style={{ color: c.cyan }}>{index}</span>
    <span style={{ width: 26, height: 1, background: c.stroke }} />
    <span style={{ textTransform: "uppercase" }}>{title}</span>
  </div>
);

export const Progress: React.FC<{ total: number; value: number }> = ({
  total,
  value,
}) => {
  const { width } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        height: 3,
        width,
        background: "rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          height: 3,
          width: width * Math.min(1, Math.max(0, value / total)),
          background: `linear-gradient(90deg, ${c.cyanDeep}, ${c.cyan})`,
          boxShadow: `0 0 24px ${c.cyan}66`,
        }}
      />
    </div>
  );
};
