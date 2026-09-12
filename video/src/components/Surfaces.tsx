import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, clamp, easeOut, enter, font, POP, shadow, SOFT } from "../theme";
import { code as mono } from "../fonts";

export const Panel: React.FC<{
  children: React.ReactNode;
  delay?: number;
  width?: number | string;
  padding?: number | string;
  accent?: string;
  active?: boolean;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, width, padding = 28, accent, active, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <div
      style={{
        width,
        padding,
        borderRadius: 18,
        background: active ? "rgba(115,227,211,0.06)" : "rgba(13,18,24,0.82)",
        border: `1px solid ${active ? `${accent ?? c.cyan}55` : c.stroke}`,
        boxShadow: active
          ? `0 0 42px -14px ${accent ?? c.cyan}66`
          : shadow.panel,
        opacity: p,
        transform: `translateY(${(1 - p) * 20}px) scale(${0.985 + p * 0.015})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Pill: React.FC<{
  children: React.ReactNode;
  color?: string;
  delay?: number;
  size?: number;
  filled?: boolean;
}> = ({ children, color = c.cyan, delay = 0, size = 17, filled = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, POP);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: `${size * 0.34}px ${size * 0.8}px`,
        borderRadius: 999,
        fontFamily: font.mono,
        fontSize: size,
        letterSpacing: 0.8,
        color: filled ? c.bg : color,
        background: filled ? color : `${color}16`,
        border: `1px solid ${color}44`,
        opacity: p,
        transform: `scale(${0.86 + p * 0.14})`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  delay?: number;
  color?: string;
  width?: number;
}> = ({ label, value, hint, delay = 0, color = c.cyan, width = 280 }) => (
  <Panel delay={delay} width={width} padding={"26px 28px"}>
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 14,
        letterSpacing: 2.4,
        textTransform: "uppercase",
        color: c.faint,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 46,
        fontWeight: 700,
        marginTop: 10,
        color,
        letterSpacing: -1.4,
      }}
    >
      {value}
    </div>
    {hint ? (
      <div style={{ marginTop: 8, fontSize: 16, color: c.dim }}>{hint}</div>
    ) : null}
  </Panel>
);

/** Checklist row that ticks over at a given frame. Used for setup steps and verification. */
export const CheckRow: React.FC<{
  text: string;
  at: number;
  done: number;
  detail?: string;
  color?: string;
  failed?: boolean;
}> = ({ text, at, done, detail, color = c.cyan, failed = false }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - at, [0, 8], [0, 1], clamp);
  const complete = frame >= done;
  const tick = interpolate(frame - done, [0, 10], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const mark = failed ? c.rose : color;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: p,
        transform: `translateX(${(1 - p) * 16}px)`,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${complete ? mark : c.stroke}`,
          background: complete ? `${mark}1E` : "transparent",
          color: mark,
          fontFamily: font.mono,
          fontSize: 15,
          flexShrink: 0,
        }}
      >
        <span
          style={{ opacity: tick, transform: `scale(${0.6 + tick * 0.4})` }}
        >
          {failed ? "✕" : "✓"}
        </span>
      </span>
      <span style={{ fontSize: 22, color: complete ? c.text : c.dim }}>
        {text}
      </span>
      {detail ? (
        <span
          style={{
            fontFamily: mono,
            fontSize: 16,
            color: c.faint,
            opacity: tick,
          }}
        >
          {detail}
        </span>
      ) : null}
    </div>
  );
};

/** Horizontal state machine rendered from the product's real `States` list. */
export const StateTrack: React.FC<{
  states: readonly string[];
  activeAt: number[];
  delay?: number;
  width?: number;
}> = ({ states, activeAt, delay = 0, width = 1300 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  const current = activeAt.filter((f) => frame >= f).length - 1;
  return (
    <div
      style={{
        width,
        display: "flex",
        alignItems: "center",
        gap: 0,
        opacity: p,
      }}
    >
      {states.map((state, i) => {
        const reached = i <= current;
        const isNow = i === current;
        const glow = isNow
          ? interpolate(frame - (activeAt[i] ?? 0), [0, 12], [1, 0.35], clamp)
          : 0;
        return (
          <React.Fragment key={state}>
            {i > 0 ? (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: reached
                    ? `linear-gradient(90deg, ${c.cyanDeep}, ${c.cyan})`
                    : c.stroke,
                  opacity: reached ? 1 : 0.5,
                }}
              />
            ) : null}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: isNow ? 18 : 12,
                  height: isNow ? 18 : 12,
                  borderRadius: 999,
                  background: reached ? c.cyan : "transparent",
                  border: `2px solid ${reached ? c.cyan : c.strokeStrong}`,
                  boxShadow: isNow
                    ? `0 0 ${16 + glow * 26}px ${c.cyan}`
                    : undefined,
                }}
              />
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 15,
                  color: isNow ? c.cyan : reached ? c.dim : c.faint,
                  whiteSpace: "nowrap",
                }}
              >
                {state}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** Generic window chrome used for Slack, the browser and the IDE. */
export const Window: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  width?: number;
  height?: number;
  accent?: string;
  tabs?: string[];
  activeTab?: number;
  style?: React.CSSProperties;
}> = ({
  title,
  children,
  delay = 0,
  width = 720,
  height,
  accent = c.stroke,
  tabs,
  activeTab = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 16,
        overflow: "hidden",
        background: "rgba(10,14,20,0.94)",
        border: `1px solid ${accent}`,
        boxShadow: shadow.lift,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px) scale(${0.98 + p * 0.02})`,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "13px 18px",
          borderBottom: `1px solid ${c.stroke}`,
          background: "rgba(255,255,255,0.025)",
          flexShrink: 0,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: c.faint,
              opacity: 0.4,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 8,
            fontSize: 15,
            color: c.dim,
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          {title}
        </span>
      </div>
      {tabs ? (
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "0 12px",
            borderBottom: `1px solid ${c.stroke}`,
            flexShrink: 0,
          }}
        >
          {tabs.map((tab, i) => (
            <span
              key={tab}
              style={{
                padding: "11px 16px",
                fontFamily: mono,
                fontSize: 14,
                color: i === activeTab ? c.text : c.faint,
                borderBottom: `2px solid ${i === activeTab ? c.cyan : "transparent"}`,
              }}
            >
              {tab}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {children}
      </div>
    </div>
  );
};

export const Divider: React.FC<{ delay?: number; width?: number | string }> = ({
  delay = 0,
  width = "100%",
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 18], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  return (
    <div
      style={{
        width: typeof width === "number" ? width * p : width,
        height: 1,
        background: c.stroke,
        transformOrigin: "left",
        transform: typeof width === "number" ? undefined : `scaleX(${p})`,
      }}
    />
  );
};
