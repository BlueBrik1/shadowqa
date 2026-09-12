import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, clamp, easeOut, enter, SOFT } from "../theme";
import { code as mono } from "../fonts";
import { display } from "../fonts";

/**
 * The extension's side panel, rebuilt with the same rules as `panel.css`: black and white only,
 * a mono voice for labels, the ◈ mark, and nothing that competes with the page beside it.
 */
const INK = "#111111";
const DIM = "#6b6b6b";
const FAINT = "#9a9a9a";
const RULE = "#e4e4e4";
const PAPER = "#ffffff";
const CARD = "#fafafa";

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 11,
      letterSpacing: 2.4,
      color: DIM,
      fontWeight: 600,
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);

const KV: React.FC<{ k: string; v: string; last?: boolean }> = ({
  k,
  v,
  last,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      padding: "5px 0",
      borderBottom: last ? "none" : `1px dashed ${RULE}`,
    }}
  >
    <span style={{ fontFamily: mono, fontSize: 12, color: DIM }}>{k}</span>
    <span style={{ fontSize: 13, color: INK, textAlign: "right" }}>{v}</span>
  </div>
);

const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      border: `1px solid ${RULE}`,
      borderRadius: 8,
      padding: "13px 14px",
      background: CARD,
      ...style,
    }}
  >
    {children}
  </div>
);

export type PaneletteState = {
  paired: boolean;
  /** Frame at which the pairing code is typed, when the panel starts unpaired. */
  pairAt?: number;
  tracked?: boolean;
  trackAt?: number;
  site?: "ChatGPT" | "Claude";
  title?: string;
  turns?: number;
  status?: string;
  conversations?: { title: string; meta: string }[];
  code?: string;
};

export const Panelette: React.FC<{
  state: PaneletteState;
  delay?: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({ state, delay = 0, width = 420, height = 720, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  const paired =
    state.paired || (state.pairAt !== undefined && frame >= state.pairAt);
  const tracked =
    state.tracked || (state.trackAt !== undefined && frame >= state.trackAt);
  const typed =
    state.pairAt === undefined
      ? (state.code ?? "")
      : (state.code ?? "").slice(
          0,
          Math.max(0, Math.floor(((frame - (state.pairAt - 26)) / fps) * 8)),
        );

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 14,
        overflow: "hidden",
        background: PAPER,
        color: INK,
        fontFamily: display,
        fontSize: 13,
        boxShadow:
          "0 40px 110px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)",
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px) scale(${0.98 + p * 0.02})`,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: `1px solid ${RULE}`,
        }}
      >
        <span style={{ fontSize: 15 }}>◈</span>
        <span style={{ fontFamily: mono, fontSize: 12, letterSpacing: 2.4 }}>
          SHADOWQA
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            border: `1px solid ${INK}`,
            background: paired ? INK : "transparent",
          }}
        />
      </div>

      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {!paired ? (
          <Card>
            <Label>PAIR</Label>
            <div style={{ color: DIM, fontSize: 12, lineHeight: 1.45 }}>
              Run{" "}
              <code style={{ fontFamily: mono }}>shadowqa-individual pair</code>{" "}
              and type the code here.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <div
                style={{
                  flex: 1,
                  border: `1px solid ${RULE}`,
                  borderRadius: 6,
                  padding: "7px 9px",
                  fontFamily: mono,
                  letterSpacing: 4,
                  color: typed ? INK : FAINT,
                  background: PAPER,
                }}
              >
                {typed || "CODE"}
              </div>
              <div
                style={{
                  background: INK,
                  color: PAPER,
                  borderRadius: 6,
                  padding: "7px 12px",
                  fontSize: 12,
                }}
              >
                Pair
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <Label>THIS CONVERSATION</Label>
          <KV k="Site" v={state.site ?? "ChatGPT"} />
          <KV k="Title" v={state.title ?? "Duplicate submissions"} />
          <KV k="Turns visible" v={String(state.turns ?? 4)} />
          <KV
            k="Status"
            v={tracked ? (state.status ?? "tracking") : "not tracked"}
            last
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {tracked ? (
              <>
                <Ghost>Pause</Ghost>
                <Ghost>Remove</Ghost>
                <Ghost dashed>Delete context</Ghost>
              </>
            ) : (
              <>
                <div
                  style={{
                    flex: 1,
                    border: `1px solid ${RULE}`,
                    borderRadius: 6,
                    padding: "7px 9px",
                    fontSize: 12,
                    color: INK,
                  }}
                >
                  Payments · approval
                </div>
                <div
                  style={{
                    background: INK,
                    color: PAPER,
                    borderRadius: 6,
                    padding: "7px 12px",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    boxShadow:
                      state.trackAt !== undefined &&
                      Math.abs(frame - state.trackAt) < 8
                        ? "0 0 0 4px rgba(17,17,17,0.12)"
                        : undefined,
                  }}
                >
                  Track
                </div>
              </>
            )}
          </div>
          <div
            style={{
              color: DIM,
              fontSize: 11,
              lineHeight: 1.45,
              marginTop: 10,
            }}
          >
            ShadowQA can only read what this page has rendered. A conversation
            you have not opened is not readable at all.
          </div>
        </Card>

        <Card>
          <Label>TRACKED</Label>
          {(state.conversations ?? []).map((conversation, i) => {
            const at = delay + 30 + i * 10;
            const q = interpolate(frame - at, [0, 12], [0, 1], {
              ...clamp,
              easing: easeOut,
            });
            return (
              <div
                key={i}
                style={{
                  borderTop: i ? `1px solid ${RULE}` : "none",
                  paddingTop: i ? 8 : 0,
                  marginTop: i ? 8 : 0,
                  opacity: q,
                  transform: `translateX(${(1 - q) * 10}px)`,
                }}
              >
                <div style={{ fontSize: 13 }}>{conversation.title}</div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 10.5,
                    color: FAINT,
                    marginTop: 2,
                  }}
                >
                  {conversation.meta}
                </div>
              </div>
            );
          })}
          {!(state.conversations ?? []).length ? (
            <div style={{ color: DIM, fontSize: 11 }}>Nothing tracked yet.</div>
          ) : null}
        </Card>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            color: DIM,
            fontSize: 11,
          }}
        >
          <span>Plans and approval happen in the CLI.</span>
          <code
            style={{
              fontFamily: mono,
              fontSize: 10.5,
              border: `1px solid ${RULE}`,
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            shadowqa-individual ui
          </code>
        </div>
      </div>
    </div>
  );
};

const Ghost: React.FC<{ children: React.ReactNode; dashed?: boolean }> = ({
  children,
  dashed,
}) => (
  <div
    style={{
      border: `1px ${dashed ? "dashed" : "solid"} ${INK}`,
      borderRadius: 6,
      padding: "6px 10px",
      fontSize: 12,
      color: INK,
    }}
  >
    {children}
  </div>
);

/** Chrome-ish frame so the panel reads as a browser side panel rather than a floating card. */
export const BrowserFrame: React.FC<{
  url: string;
  children: React.ReactNode;
  panel: React.ReactNode;
  delay?: number;
  width?: number;
  height?: number;
}> = ({ url, children, panel, delay = 0, width = 1180, height = 760 }) => {
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
        background: "#0c1016",
        border: `1px solid ${c.stroke}`,
        boxShadow: "0 50px 140px -50px rgba(0,0,0,0.95)",
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: `1px solid ${c.stroke}`,
          background: "rgba(255,255,255,0.02)",
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
        <div
          style={{
            marginLeft: 10,
            flex: 1,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 999,
            padding: "6px 14px",
            fontFamily: mono,
            fontSize: 13,
            color: c.dim,
          }}
        >
          {url}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {children}
        </div>
        <div style={{ borderLeft: `1px solid ${c.stroke}`, flexShrink: 0 }}>
          {panel}
        </div>
      </div>
    </div>
  );
};
