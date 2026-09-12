import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, clamp, easeInOut, easeOut, enter, font, POP, SOFT } from "../theme";
import { code as mono } from "../fonts";

export type Node = {
  id: string;
  x: number;
  y: number;
  label: string;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  delay?: number;
  w?: number;
  h?: number;
};

export type Edge = {
  from: string;
  to: string;
  delay?: number;
  /** Frames between packets travelling this edge; 0 disables the flow. */
  every?: number;
  color?: string;
  curve?: number;
  dashed?: boolean;
  label?: string;
};

const center = (n: Node) => ({ x: n.x, y: n.y });

function path(a: Node, b: Node, curve = 0) {
  const p1 = center(a);
  const p2 = center(b);
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * curve;
  const ny = (dx / len) * curve;
  return `M ${p1.x} ${p1.y} Q ${mx + nx} ${my + ny} ${p2.x} ${p2.y}`;
}

function pointOn(a: Node, b: Node, curve: number, t: number) {
  const p1 = center(a);
  const p2 = center(b);
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * curve;
  const cy = my + (dx / len) * curve;
  const u = 1 - t;
  return {
    x: u * u * p1.x + 2 * u * t * cx + t * t * p2.x,
    y: u * u * p1.y + 2 * u * t * cy + t * t * p2.y,
  };
}

/**
 * Node/edge diagram with packets travelling the edges. Packet timing is derived from the
 * frame number alone, so the same frame always renders identically.
 */
export const Flow: React.FC<{
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  packetLife?: number;
  style?: React.CSSProperties;
}> = ({ nodes, edges, width, height, packetLife = 46, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const byId = React.useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {edges.map((edge, i) => {
          const a = byId[edge.from];
          const b = byId[edge.to];
          if (!a || !b) return null;
          const delay = edge.delay ?? 0;
          const draw = interpolate(frame - delay, [0, 26], [0, 1], {
            ...clamp,
            easing: easeInOut,
          });
          const color = edge.color ?? c.strokeStrong;
          const curve = edge.curve ?? 0;
          const d = path(a, b, curve);
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={edge.dashed ? "6 8" : "1200"}
                strokeDashoffset={edge.dashed ? 0 : 1200 * (1 - draw)}
                opacity={edge.dashed ? draw * 0.6 : draw}
              />
              {edge.every
                ? Array.from({ length: 4 }).map((_, k) => {
                    const period = edge.every! * 4;
                    const offset = delay + 14 + k * edge.every!;
                    const local = (frame - offset) % period;
                    if (frame < offset || local < 0) return null;
                    const t = local / packetLife;
                    if (t > 1) return null;
                    const point = pointOn(a, b, curve, t);
                    const fade = Math.sin(t * Math.PI);
                    return (
                      <circle
                        key={k}
                        cx={point.x}
                        cy={point.y}
                        r={4}
                        fill={edge.color ?? c.cyan}
                        opacity={fade * 0.95}
                        style={{
                          filter: `drop-shadow(0 0 8px ${edge.color ?? c.cyan})`,
                        }}
                      />
                    );
                  })
                : null}
            </g>
          );
        })}
      </svg>
      {nodes.map((node) => (
        <FlowNode key={node.id} node={node} fps={fps} frame={frame} />
      ))}
      {edges
        .filter((e) => e.label)
        .map((edge, i) => {
          const a = byId[edge.from];
          const b = byId[edge.to];
          if (!a || !b) return null;
          const point = pointOn(a, b, edge.curve ?? 0, 0.5);
          const p = interpolate(
            frame - ((edge.delay ?? 0) + 18),
            [0, 12],
            [0, 1],
            clamp,
          );
          return (
            <div
              key={"l" + i}
              style={{
                position: "absolute",
                left: point.x,
                top: point.y,
                transform: "translate(-50%, -50%)",
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: 1,
                color: c.faint,
                background: c.bg,
                padding: "3px 9px",
                borderRadius: 6,
                opacity: p,
                whiteSpace: "nowrap",
              }}
            >
              {edge.label}
            </div>
          );
        })}
    </div>
  );
};

const FlowNode: React.FC<{ node: Node; frame: number; fps: number }> = ({
  node,
  frame,
  fps,
}) => {
  const p = enter(frame, fps, node.delay ?? 0, SOFT);
  const color = node.color ?? c.cyan;
  const w = node.w ?? 210;
  const h = node.h ?? 78;
  return (
    <div
      style={{
        position: "absolute",
        left: node.x - w / 2,
        top: node.y - h / 2,
        width: w,
        minHeight: h,
        borderRadius: 14,
        background: "rgba(11,15,21,0.96)",
        border: `1px solid ${color}3A`,
        boxShadow: `0 18px 50px -24px ${color}88`,
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "0 18px",
        opacity: p,
        transform: `scale(${0.9 + p * 0.1})`,
      }}
    >
      {node.icon ? (
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: `${color}16`,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {node.icon}
        </span>
      ) : null}
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 19,
            fontWeight: 600,
            color: c.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.label}
        </span>
        {node.sub ? (
          <span
            style={{
              display: "block",
              fontFamily: mono,
              fontSize: 13,
              color: c.faint,
              marginTop: 3,
              whiteSpace: "nowrap",
            }}
          >
            {node.sub}
          </span>
        ) : null}
      </span>
    </div>
  );
};

/** Small floating source card used when context streams into the store. */
export const SourceCard: React.FC<{
  icon: React.ReactNode;
  who: string;
  text: string;
  at: number;
  x: number;
  y: number;
  travel?: { x: number; y: number };
  color?: string;
  width?: number;
}> = ({ icon, who, text, at, x, y, travel, color = c.cyan, width = 330 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, at, POP);
  const move = travel
    ? interpolate(frame - (at + 26), [0, 42], [0, 1], {
        ...clamp,
        easing: easeOut,
      })
    : 0;
  const fade = travel
    ? interpolate(frame - (at + 40), [0, 26], [1, 0], clamp)
    : 1;
  const dx = travel ? (travel.x - x) * move : 0;
  const dy = travel ? (travel.y - y) * move : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        padding: "14px 16px",
        borderRadius: 13,
        background: "rgba(13,18,24,0.96)",
        border: `1px solid ${color}33`,
        boxShadow: `0 20px 46px -26px ${color}77`,
        opacity: p * fade,
        transform: `translate(${dx}px, ${dy}px) scale(${(0.86 + p * 0.14) * (1 - move * 0.35)})`,
        display: "flex",
        gap: 12,
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 14,
            fontFamily: mono,
            color: color,
            letterSpacing: 0.6,
          }}
        >
          {who}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 16,
            color: c.dim,
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {text}
        </span>
      </span>
    </div>
  );
};

export const flowFont = font.mono;
