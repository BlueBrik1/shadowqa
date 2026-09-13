import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-diff";
import { c, enter, font, SOFT } from "../theme";
import { Row, Typed, useTone, useToneName, Mark, Rise } from "./ui";
import { sansFamily, serifFamily } from "../fonts";
import { SlackMark, GitHubMark } from "./marks";

/* ------------------------------------------------------------------------------------------ */
/* Window chrome                                                                              */
/* ------------------------------------------------------------------------------------------ */

export const Window: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
  invert?: boolean;
  padding?: number;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}> = ({ children, title, width = 1100, height = 640, delay = 0, invert = false, padding = 0, style, bodyStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTone();
  const name = useToneName();
  const p = enter(frame, fps, delay, SOFT);
  // A window is painted in the opposite tone of the frame, so it reads as an object on a ground.
  const dark = invert ? name === "light" : name === "dark";
  const bg = dark ? c.charcoalLift : c.offwhiteLift;
  const ink = dark ? c.offwhite : c.charcoal;
  const rule = dark ? "rgba(244,241,234,0.14)" : "rgba(28,28,28,0.14)";
  return (
    <div
      style={{
        width,
        height,
        background: bg,
        color: ink,
        border: `1px solid ${t.ruleStrong}`,
        borderRadius: 10,
        overflow: "hidden",
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px) scale(${0.985 + p * 0.015})`,
        display: "flex",
        flexDirection: "column",
        fontFamily: sansFamily,
        ...style,
      }}
    >
      <div
        style={{
          height: 44,
          flex: "0 0 44px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          borderBottom: `1px solid ${rule}`,
          fontSize: 15,
          color: dark ? c.dim : c.faint,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 11, height: 11, borderRadius: 6, border: `1.5px solid ${dark ? c.dim : c.faint}`, marginRight: 2 }} />
        ))}
        <span style={{ marginLeft: 12 }}>{title}</span>
      </div>
      <div style={{ flex: 1, padding, position: "relative", ...bodyStyle }}>{children}</div>
    </div>
  );
};

const windowInk = (dark: boolean) => ({
  ink: dark ? c.offwhite : c.charcoal,
  dim: dark ? c.dim : c.faint,
  faint: dark ? c.faint : c.dim,
  rule: dark ? "rgba(244,241,234,0.14)" : "rgba(28,28,28,0.14)",
  lift: dark ? "#2E2E2E" : "#EDE9E0",
});

/* ------------------------------------------------------------------------------------------ */
/* Slack — sidebar, channel header, messages. Layout follows Slack; colour follows the film.  */
/* ------------------------------------------------------------------------------------------ */

export type SlackMessage = { who: string; at: string; text: React.ReactNode; bot?: boolean; delay?: number };

export const Slack: React.FC<{
  workspace?: string;
  channel?: string;
  channels?: string[];
  messages: SlackMessage[];
  width?: number;
  height?: number;
  delay?: number;
  compose?: { text: string; start: number };
}> = ({ workspace = "Acme Engineering", channel = "checkout", channels = ["engineering", "checkout", "incidents", "product"], messages, width = 1180, height = 660, delay = 0, compose }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Window width={width} height={height} delay={delay} title={<Row gap={8}><SlackMark size={14} color={k.dim} />Slack — {workspace}</Row>}>
      <div style={{ display: "flex", height: "100%" }}>
        <div style={{ width: 250, borderRight: `1px solid ${k.rule}`, padding: "18px 0", fontSize: 16, color: k.dim, background: dark ? c.charcoalDeep : c.offwhiteDeep }}>
          <div style={{ padding: "0 20px 16px", fontWeight: 600, fontSize: 18, color: k.ink, display: "flex", alignItems: "center", gap: 8 }}>
            {workspace} <span style={{ fontSize: 12 }}>▾</span>
          </div>
          <div style={{ padding: "8px 20px", fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: k.faint }}>Channels</div>
          {channels.map((ch) => (
            <div key={ch} style={{ padding: "6px 20px", color: ch === channel ? k.ink : k.dim, background: ch === channel ? k.lift : "transparent", fontWeight: ch === channel ? 500 : 400 }}>
              # {ch}
            </div>
          ))}
          <div style={{ padding: "18px 20px 8px", fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: k.faint }}>Apps</div>
          <div style={{ padding: "6px 20px", display: "flex", alignItems: "center", gap: 8 }}>
            <Mark size={14} color={k.dim} /> ShadowQA
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 52, borderBottom: `1px solid ${k.rule}`, display: "flex", alignItems: "center", padding: "0 22px", fontWeight: 600, fontSize: 18, color: k.ink }}>
            # {channel}
            <span style={{ marginLeft: 14, fontWeight: 400, fontSize: 14, color: k.faint }}>12 members</span>
          </div>
          <div style={{ flex: 1, padding: "14px 22px", display: "flex", flexDirection: "column", gap: 18, overflow: "hidden" }}>
            {messages.map((m, i) => {
              const p = enter(frame, fps, (m.delay ?? i * 14) + delay + 10, SOFT);
              return (
                <div key={i} style={{ display: "flex", gap: 12, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
                  <div style={{ width: 38, height: 38, borderRadius: 6, background: m.bot ? "transparent" : k.lift, border: m.bot ? `1px solid ${k.rule}` : undefined, display: "flex", alignItems: "center", justifyContent: "center", color: k.ink, fontWeight: 600, fontSize: 15, flex: "0 0 38px" }}>
                    {m.bot ? <Mark size={20} color={k.ink} /> : m.who.slice(0, 1)}
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1.4, color: k.ink }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{m.who}</span>
                      {m.bot ? <span style={{ fontSize: 11, padding: "1px 5px", border: `1px solid ${k.rule}`, borderRadius: 3, color: k.dim, letterSpacing: 0.5 }}>APP</span> : null}
                      <span style={{ fontSize: 13, color: k.faint }}>{m.at}</span>
                    </div>
                    <div style={{ color: k.ink }}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ margin: "0 22px 18px", border: `1px solid ${k.rule}`, borderRadius: 8, padding: "12px 14px", fontSize: 16, color: k.dim, minHeight: 46 }}>
            {compose ? <Typed text={compose.text} start={compose.start} style={{ fontFamily: sansFamily, color: k.ink }} /> : `Message #${channel}`}
          </div>
        </div>
      </div>
    </Window>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* GitHub pull request                                                                        */
/* ------------------------------------------------------------------------------------------ */

export const PullRequest: React.FC<{
  repo?: string;
  number?: number;
  title: string;
  author?: string;
  branch?: string;
  body: React.ReactNode;
  checks?: { name: string; ok: boolean | null; delay?: number }[];
  width?: number;
  height?: number;
  delay?: number;
  merged?: boolean;
}> = ({ repo = "acme/checkout", number = 412, title, author = "mara", branch = "feat/retry-payments", body, checks = [], width = 1180, height = 660, delay = 0, merged }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Window width={width} height={height} delay={delay} title={<Row gap={8}><GitHubMark size={14} color={k.dim} />github.com/{repo}/pull/{number}</Row>} padding={26}>
      <div style={{ fontSize: 28, fontWeight: 500, color: k.ink, lineHeight: 1.2 }}>
        {title} <span style={{ color: k.faint, fontWeight: 400 }}>#{number}</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: k.dim }}>
        <span style={{ padding: "3px 10px", borderRadius: 14, border: `1px solid ${merged ? c.good : k.ink}`, color: merged ? c.good : k.ink, fontWeight: 500 }}>
          {merged ? "Merged" : "Open"}
        </span>
        <span>
          <b style={{ color: k.ink, fontWeight: 500 }}>{author}</b> wants to merge 3 commits into <code style={{ fontFamily: font.mono, background: k.lift, padding: "1px 6px", borderRadius: 4 }}>main</code> from{" "}
          <code style={{ fontFamily: font.mono, background: k.lift, padding: "1px 6px", borderRadius: 4 }}>{branch}</code>
        </span>
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 24, fontSize: 15, color: k.dim, borderBottom: `1px solid ${k.rule}`, paddingBottom: 10 }}>
        <span style={{ color: k.ink, fontWeight: 500, borderBottom: `2px solid ${k.ink}`, paddingBottom: 10, marginBottom: -11 }}>Conversation</span>
        <span>Commits <span style={{ opacity: 0.6 }}>3</span></span>
        <span>Checks <span style={{ opacity: 0.6 }}>{checks.length}</span></span>
        <span>Files changed <span style={{ opacity: 0.6 }}>4</span></span>
      </div>
      <div style={{ marginTop: 18, border: `1px solid ${k.rule}`, borderRadius: 8, padding: "14px 18px", fontSize: 17, lineHeight: 1.5, color: k.ink }}>
        <div style={{ fontSize: 13, color: k.faint, marginBottom: 8 }}>{author} commented</div>
        {body}
      </div>
      {checks.length ? (
        <div style={{ marginTop: 18, border: `1px solid ${k.rule}`, borderRadius: 8, overflow: "hidden" }}>
          {checks.map((ch, i) => {
            const p = enter(frame, fps, (ch.delay ?? 30 + i * 12) + delay);
            return (
              <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i ? `1px solid ${k.rule}` : undefined, fontSize: 16, color: k.ink, opacity: p }}>
                <span style={{ width: 20, color: ch.ok === null ? k.faint : ch.ok ? c.good : c.bad, fontWeight: 600 }}>{ch.ok === null ? "◌" : ch.ok ? "✓" : "✕"}</span>
                <span style={{ fontFamily: font.mono, fontSize: 15 }}>{ch.name}</span>
                <span style={{ marginLeft: "auto", color: k.faint, fontSize: 14 }}>{ch.ok === null ? "In progress" : ch.ok ? "Successful" : "Failing"}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Window>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Terminal                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export type TermLine =
  | { at: number; cmd: string }
  | { at: number; out: React.ReactNode; tone?: "ink" | "dim" | "good" | "bad" };

export const Terminal: React.FC<{
  lines: TermLine[];
  width?: number;
  height?: number;
  delay?: number;
  title?: string;
  fontSize?: number;
  prompt?: string;
}> = ({ lines, width = 1100, height = 560, delay = 0, title = "shadowqa — zsh", fontSize = 21, prompt = "❯" }) => {
  const frame = useCurrentFrame();
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const colour = { ink: k.ink, dim: k.dim, good: c.good, bad: c.bad };
  const local = frame - delay;
  return (
    <Window width={width} height={height} delay={delay} title={title} padding={22} bodyStyle={{ overflow: "hidden" }}>
      <div style={{ fontFamily: font.mono, fontSize, lineHeight: 1.55, color: k.ink, display: "flex", flexDirection: "column", gap: 2 }}>
        {lines.map((l, i) => {
          if (local < l.at) return null;
          if ("cmd" in l)
            return (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: k.dim }}>{prompt}</span>
                <Typed text={l.cmd} start={l.at + delay} cps={30} caret={local < l.at + (l.cmd.length / 30) * 30 + 12} style={{ fontSize }} />
              </div>
            );
          return (
            <Rise key={i} distance={6} style={{ color: colour[l.tone ?? "ink"], whiteSpace: "pre-wrap" }}>
              {l.out}
            </Rise>
          );
        })}
      </div>
    </Window>
  );
};

/** Reproduces the CLI's `line(label, value)` layout: dim padded label, ink value. */
export const KV: React.FC<{ k: string; v: React.ReactNode; tone?: "good" | "bad" }> = ({ k, v, tone: tn }) => {
  const dark = useToneName() === "dark";
  const w = windowInk(dark);
  return (
    <span>
      <span style={{ color: w.dim }}>{"  " + k.padEnd(18)}</span>
      <span style={{ color: tn === "good" ? c.good : tn === "bad" ? c.bad : w.ink }}>{v}</span>
    </span>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Code — Prism tokens in a restrained scheme. The only place hue appears outside ✓/✕.       */
/* ------------------------------------------------------------------------------------------ */

const TOKEN_COLOURS_DARK: Record<string, string> = {
  keyword: "#C9A8FF",
  string: "#9ED9A8",
  number: "#F0C674",
  function: "#8FCBFF",
  "class-name": "#F0C674",
  comment: "#7E7B74",
  operator: "#D9D5CC",
  punctuation: "#A9A59D",
  builtin: "#8FCBFF",
  boolean: "#F0C674",
  property: "#F4F1EA",
  decorator: "#C9A8FF",
  inserted: "#3DD68C",
  deleted: "#E5484D",
  prefix: "#A9A59D",
};
const TOKEN_COLOURS_LIGHT: Record<string, string> = {
  keyword: "#6F3FB3",
  string: "#2E7D46",
  number: "#9A6B00",
  function: "#0B5BA8",
  "class-name": "#9A6B00",
  comment: "#8C887F",
  operator: "#3A3833",
  punctuation: "#6F6C66",
  builtin: "#0B5BA8",
  boolean: "#9A6B00",
  property: "#1C1C1C",
  decorator: "#6F3FB3",
  inserted: "#1E8A4A",
  deleted: "#C6323A",
  prefix: "#6F6C66",
};

type Token = string | Prism.Token;
const renderTokens = (tokens: Token[], colours: Record<string, string>, base: string): React.ReactNode[] =>
  tokens.map((tok, i) => {
    if (typeof tok === "string") return <span key={i}>{tok}</span>;
    const content = Array.isArray(tok.content) ? renderTokens(tok.content as Token[], colours, base) : String(tok.content);
    const colour = colours[tok.type] ?? (Array.isArray(tok.alias) ? colours[tok.alias[0] as string] : tok.alias ? colours[tok.alias as string] : undefined) ?? base;
    return (
      <span key={i} style={{ color: colour, fontStyle: tok.type === "comment" ? "italic" : undefined }}>
        {content}
      </span>
    );
  });

export const Code: React.FC<{
  code: string;
  lang?: string;
  fontSize?: number;
  reveal?: { start: number; lps?: number };
  highlight?: number[];
  startLine?: number;
  style?: React.CSSProperties;
}> = ({ code, lang = "typescript", fontSize = 20, reveal, highlight = [], startLine = 1, style }) => {
  const frame = useCurrentFrame();
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const colours = dark ? TOKEN_COLOURS_DARK : TOKEN_COLOURS_LIGHT;
  const grammar = Prism.languages[lang] ?? Prism.languages.javascript;
  const lines = code.split("\n");
  const visible = reveal ? Math.floor(Math.max(0, frame - reveal.start) * ((reveal.lps ?? 0.45))) : lines.length;
  return (
    <div style={{ fontFamily: font.mono, fontSize, lineHeight: 1.6, color: k.ink, ...style }}>
      {lines.slice(0, visible).map((line, i) => {
        const hot = highlight.includes(i + startLine);
        return (
          <div key={i} style={{ display: "flex", background: hot ? (dark ? "rgba(244,241,234,0.07)" : "rgba(28,28,28,0.06)") : undefined, borderLeft: hot ? `2px solid ${k.ink}` : "2px solid transparent", paddingLeft: 12, marginLeft: -14 }}>
            <span style={{ width: 44, color: k.faint, userSelect: "none", flex: "0 0 44px" }}>{i + startLine}</span>
            <span style={{ whiteSpace: "pre" }}>{renderTokens(Prism.tokenize(line, grammar), colours, k.ink)}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Editor — an IDE frame: file tabs, code, optional side terminal for the agent session.      */
/* ------------------------------------------------------------------------------------------ */

export const Editor: React.FC<{
  files: string[];
  active?: number;
  children: React.ReactNode;
  side?: React.ReactNode;
  sideTitle?: string;
  width?: number;
  height?: number;
  delay?: number;
  title?: string;
}> = ({ files, active = 0, children, side, sideTitle = "OpenCode", width = 1380, height = 700, delay = 0, title = "Visual Studio Code" }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  return (
    <Window width={width} height={height} delay={delay} title={title} bodyStyle={{ display: "flex" }}>
      <div style={{ width: 56, borderRight: `1px solid ${k.rule}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: 18, color: k.faint }}>
        {["▤", "⌕", "⑂", "▷"].map((g, i) => (
          <span key={i} style={{ fontSize: 18, color: i === 0 ? k.ink : k.faint }}>{g}</span>
        ))}
        <Mark size={18} color={k.ink} style={{ marginTop: 6 }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${k.rule}`, fontSize: 14, color: k.dim }}>
          {files.map((f, i) => (
            <div key={f} style={{ padding: "10px 18px", borderRight: `1px solid ${k.rule}`, color: i === active ? k.ink : k.dim, background: i === active ? (dark ? c.charcoalLift : c.offwhiteLift) : (dark ? c.charcoalDeep : c.offwhiteDeep), fontFamily: font.mono }}>
              {f}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: "18px 22px", overflow: "hidden" }}>{children}</div>
      </div>
      {side ? (
        <div style={{ width: 460, borderLeft: `1px solid ${k.rule}`, display: "flex", flexDirection: "column", background: dark ? c.charcoalDeep : c.offwhiteDeep }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${k.rule}`, fontSize: 14, color: k.dim, letterSpacing: 1.5, textTransform: "uppercase" }}>{sideTitle}</div>
          <div style={{ flex: 1, padding: 16, fontFamily: font.mono, fontSize: 16, lineHeight: 1.55, color: k.ink, overflow: "hidden" }}>{side}</div>
        </div>
      ) : null}
    </Window>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Chat — Claude / ChatGPT conversation windows for the individual story.                     */
/* ------------------------------------------------------------------------------------------ */

export const Chat: React.FC<{
  product: "claude" | "chatgpt";
  turns: { who: "you" | "ai"; text: string; delay?: number }[];
  width?: number;
  height?: number;
  delay?: number;
  mark?: React.ReactNode;
}> = ({ product, turns, width = 620, height = 560, delay = 0, mark }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const name = product === "claude" ? "Claude" : "ChatGPT";
  return (
    <Window width={width} height={height} delay={delay} title={<Row gap={8}>{mark}{name}</Row>} padding={22} bodyStyle={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {turns.map((tn, i) => {
        const p = enter(frame, fps, (tn.delay ?? 12 + i * 16) + delay, SOFT);
        const you = tn.who === "you";
        return (
          <div key={i} style={{ alignSelf: you ? "flex-end" : "flex-start", maxWidth: "88%", opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
            <div style={{ fontSize: 12, color: k.faint, marginBottom: 4, textAlign: you ? "right" : "left", letterSpacing: 1 }}>{you ? "You" : name}</div>
            <div style={{ padding: "12px 16px", borderRadius: 12, background: you ? k.lift : "transparent", border: you ? undefined : `1px solid ${k.rule}`, fontSize: 16, lineHeight: 1.45, color: k.ink }}>
              {tn.text}
            </div>
          </div>
        );
      })}
    </Window>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Browser — a web app under development with the Live overlay in its corner.                 */
/* ------------------------------------------------------------------------------------------ */

export const Browser: React.FC<{
  url?: string;
  children: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
}> = ({ url = "localhost:3000/checkout", children, width = 1380, height = 720, delay = 0 }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  return (
    <Window
      width={width}
      height={height}
      delay={delay}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "4px 14px", border: `1px solid ${k.rule}`, borderRadius: 14, fontFamily: font.mono, fontSize: 13, color: k.dim, minWidth: 420 }}>
          ⌂ {url}
        </span>
      }
      bodyStyle={{ overflow: "hidden" }}
    >
      {children}
    </Window>
  );
};

/** The Lumen Supply Co. checkout page, as painted in live/frontend. */
export const StoreCheckout: React.FC<{ total?: string; error?: string; fixed?: boolean }> = ({ total = "$248.00", error, fixed }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const items = [
    ["Ridge Hatchet", "1", "$148.00"],
    ["Waxed Canvas Pack", "1", "$100.00"],
  ];
  return (
    <div style={{ display: "flex", height: "100%", fontFamily: sansFamily, color: k.ink }}>
      <div style={{ flex: 1, padding: "34px 44px", borderRight: `1px solid ${k.rule}` }}>
        <div style={{ fontFamily: serifFamily, fontSize: 30, marginBottom: 22 }}>Lumen Supply Co.</div>
        <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: k.faint, marginBottom: 14 }}>Checkout</div>
        {[["Name", "Mara Ellis"], ["Address", "14 Hollis Street"], ["City", "Bend, OR 97701"], ["Card", "4242 4242 4242 4242"]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: k.faint, letterSpacing: 1 }}>{l}</span>
            <span style={{ padding: "10px 12px", border: `1px solid ${k.rule}`, borderRadius: 6, fontSize: 16 }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 26px", borderRadius: 6, background: k.ink, color: dark ? c.charcoal : c.offwhite, fontSize: 16, fontWeight: 500, position: "relative" }}>
          Pay {total}
        </div>
        {error ? (
          <div style={{ marginTop: 18, padding: "12px 14px", border: `1px solid ${c.bad}`, borderRadius: 6, color: c.bad, fontSize: 15, fontFamily: font.mono }}>
            ✕ {error}
          </div>
        ) : null}
        {fixed ? (
          <div style={{ marginTop: 18, padding: "12px 14px", border: `1px solid ${c.good}`, borderRadius: 6, color: c.good, fontSize: 15 }}>
            ✓ Order LUM-9174 placed
          </div>
        ) : null}
      </div>
      <div style={{ width: 380, padding: "34px 36px", background: dark ? c.charcoalDeep : c.offwhiteDeep }}>
        <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: k.faint, marginBottom: 18 }}>Order</div>
        {items.map(([n, q, p]) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 16, padding: "10px 0", borderBottom: `1px solid ${k.rule}` }}>
            <span>{n} <span style={{ color: k.faint }}>× {q}</span></span>
            <span>{p}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 500, paddingTop: 16 }}>
          <span>Total</span>
          <span>{total}</span>
        </div>
      </div>
    </div>
  );
};

/** ShadowQA Live's overlay card, as in live/frontend/src/shadowqa/overlay. */
export const LiveCard: React.FC<{
  title: string;
  status: string;
  rows: [string, React.ReactNode][];
  actions?: string[];
  delay?: number;
  width?: number;
  tone?: "ink" | "good" | "bad";
}> = ({ title, status, rows, actions = [], delay = 0, width = 440, tone: tn = "ink" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  const statusColour = tn === "good" ? c.good : tn === "bad" ? c.bad : c.dim;
  return (
    <div
      style={{
        position: "absolute",
        right: 22,
        bottom: 22,
        width,
        background: c.charcoal,
        color: c.offwhite,
        border: `1px solid rgba(244,241,234,0.22)`,
        borderRadius: 10,
        padding: "16px 18px",
        fontFamily: sansFamily,
        opacity: p,
        transform: `translateY(${(1 - p) * 18}px)`,
        boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: c.dim }}>
        <Mark size={14} color={c.offwhite} /> ShadowQA Live
        <span style={{ marginLeft: "auto", color: statusColour, letterSpacing: 1 }}>{status}</span>
      </div>
      <div style={{ fontFamily: serifFamily, fontSize: 21, margin: "10px 0 12px", lineHeight: 1.25 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: 6, columnGap: 10, fontSize: 14, lineHeight: 1.35 }}>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <span style={{ color: c.faint, letterSpacing: 1, textTransform: "uppercase", fontSize: 11, paddingTop: 3 }}>{k}</span>
            <span style={{ color: c.offwhite }}>{v}</span>
          </React.Fragment>
        ))}
      </div>
      {actions.length ? (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {actions.map((a, i) => (
            <span key={a} style={{ padding: "7px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, background: i === 0 ? c.offwhite : "transparent", color: i === 0 ? c.charcoal : c.offwhite, border: `1px solid ${i === 0 ? c.offwhite : "rgba(244,241,234,0.3)"}` }}>
              {a}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** A pointer that lands on a spot and clicks. */
export const Cursor: React.FC<{ x: number; y: number; clickAt: number; from?: { x: number; y: number }; start?: number }> = ({ x, y, clickAt, from = { x: x - 260, y: y + 180 }, start = 0 }) => {
  const frame = useCurrentFrame();
  const t = Math.min(1, Math.max(0, (frame - start) / Math.max(1, clickAt - start - 6)));
  const e = 1 - Math.pow(1 - t, 3);
  const px = from.x + (x - from.x) * e, py = from.y + (y - from.y) * e;
  const clicking = frame >= clickAt && frame < clickAt + 8;
  const ring = Math.max(0, Math.min(1, (frame - clickAt) / 16));
  return (
    <div style={{ position: "absolute", left: px, top: py, pointerEvents: "none" }}>
      {frame >= clickAt ? (
        <div style={{ position: "absolute", left: -18 - ring * 18, top: -18 - ring * 18, width: 36 + ring * 36, height: 36 + ring * 36, borderRadius: "50%", border: `2px solid ${c.offwhite}`, opacity: 1 - ring }} />
      ) : null}
      <svg width={26} height={30} viewBox="0 0 26 30" style={{ transform: clicking ? "scale(0.88)" : "scale(1)" }}>
        <path d="M3 2 L3 24 L9 18 L14 28 L18 26 L13 16 L21 16 Z" fill={c.offwhite} stroke={c.charcoal} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* DesktopApp — the actual product now: onboarding, watching, plans, jobs, findings, live.     */
/* Same tab names and screen shapes as desktop/renderer/src/{App.tsx,pages/*}. No terminal.    */
/* ------------------------------------------------------------------------------------------ */

export const DESKTOP_TABS = ["Watching", "Plans", "Jobs", "Findings", "Live"] as const;

export const DesktopApp: React.FC<{
  tab?: (typeof DESKTOP_TABS)[number];
  children: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
}> = ({ tab, children, width = 1280, height = 760, delay = 0 }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  return (
    <Window width={width} height={height} delay={delay} title={<Row gap={8}><Mark size={15} color={dark ? c.dim : c.faint} />ShadowQA</Row>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
      {tab ? (
        <div style={{ display: "flex", gap: 6, padding: "16px 32px 0" }}>
          {DESKTOP_TABS.map((t) => (
            <span
              key={t}
              style={{
                padding: "9px 16px",
                fontSize: 15,
                fontFamily: sansFamily,
                color: t === tab ? k.ink : k.faint,
                borderBottom: `2px solid ${t === tab ? k.ink : "transparent"}`,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ flex: 1, padding: "28px 32px", overflow: "hidden", fontFamily: sansFamily, borderTop: tab ? `1px solid ${k.rule}` : undefined, marginTop: tab ? 0 : undefined }}>{children}</div>
    </Window>
  );
};

/** A rounded, bordered panel — the same visual unit every card on every screen uses. */
export const AppCard: React.FC<{ children: React.ReactNode; delay?: number; style?: React.CSSProperties }> = ({ children, delay = 0, style }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <div
      style={{
        border: `1px solid ${k.rule}`,
        borderRadius: 12,
        padding: "20px 24px",
        background: k.lift,
        opacity: p,
        transform: `translateY(${(1 - p) * 12}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** The small pill used for a mode, a status, or a risk level — good/bad/neutral, nothing else. */
export const AppBadge: React.FC<{ tone?: "good" | "bad" | "ink"; children: React.ReactNode }> = ({ tone: tn = "ink", children }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const colour = tn === "good" ? c.good : tn === "bad" ? c.bad : k.dim;
  return (
    <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 999, fontSize: 13, border: `1px solid ${colour}`, color: colour }}>
      {children}
    </span>
  );
};

/** The off-white filled primary action button every screen uses for its one main action. */
export const AppButton: React.FC<{ children: React.ReactNode; primary?: boolean; delay?: number }> = ({ children, primary = true, delay = 0 }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SOFT);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "11px 20px",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        background: primary ? k.ink : "transparent",
        color: primary ? (dark ? c.charcoal : c.offwhite) : k.ink,
        border: primary ? "none" : `1px solid ${k.dim}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 8}px)`,
      }}
    >
      {children}
    </span>
  );
};

/** A labelled row of small text, the desktop app's `<Field>` / subtitle convention. */
export const AppLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dark = useToneName() === "dark";
  const k = windowInk(dark);
  return <div style={{ fontSize: 13, color: k.faint, marginBottom: 6 }}>{children}</div>;
};
