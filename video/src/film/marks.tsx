import React from "react";
import { useTone, Row } from "./ui";
import { sansFamily } from "../fonts";

/**
 * Third-party marks, drawn in the frame's ink. The geometry follows each brand's mark; the colour
 * does not, because the film has two colours. Slack's octothorpe is reproduced exactly (four
 * lozenges, four dots) in one tone.
 */

type MarkProps = { size?: number; color?: string; style?: React.CSSProperties };

export const SlackMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  // Official Slack logo geometry (viewBox 0 0 127 127), single colour.
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" style={style}>
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill={ink} />
      <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill={ink} />
      <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill={ink} />
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill={ink} />
    </svg>
  );
};

export const GitHubMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={style}>
      <path
        fill={ink}
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
};

/** Gemini's four-point star. */
export const GeminiMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <path d="M24 2 C25.5 14 34 22.5 46 24 C34 25.5 25.5 34 24 46 C22.5 34 14 25.5 2 24 C14 22.5 22.5 14 24 2 Z" fill={ink} />
    </svg>
  );
};

/** Claude's starburst. */
export const ClaudeMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  const rays = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      {rays.map((deg) => (
        <rect key={deg} x={22.2} y={4} width={3.6} height={17} rx={1.8} fill={ink} transform={`rotate(${deg} 24 24)`} />
      ))}
      <circle cx={24} cy={24} r={5.5} fill={ink} />
    </svg>
  );
};

/** OpenAI's knot, simplified to its six lobes. */
export const OpenAIMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d="M24 6.5 L34.5 12.5 L34.5 24.5 L24 30.5 L13.5 24.5 L13.5 12.5 Z"
          fill="none"
          stroke={ink}
          strokeWidth={3.2}
          strokeLinejoin="round"
          transform={`rotate(${i * 60} 24 24) translate(0 -1.5)`}
        />
      ))}
    </svg>
  );
};

/** OpenCode: a terminal prompt in a rounded square. */
export const OpenCodeMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <rect x={4} y={4} width={40} height={40} rx={9} fill="none" stroke={ink} strokeWidth={3} />
      <path d="M14 17 L23 24 L14 31" fill="none" stroke={ink} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={25} y1={31} x2={34} y2={31} stroke={ink} strokeWidth={3.4} strokeLinecap="round" />
    </svg>
  );
};

/** Codex: OpenAI's knot beside a cursor block. */
export const CodexMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <rect x={5} y={5} width={38} height={38} rx={8} fill="none" stroke={ink} strokeWidth={3} />
      <rect x={15} y={15} width={7} height={18} fill={ink} />
      <rect x={26} y={15} width={7} height={7} fill={ink} />
      <rect x={26} y={26} width={7} height={7} fill={ink} />
    </svg>
  );
};

/** Chrome: three arcs around a lens. */
export const ChromeMark: React.FC<MarkProps> = ({ size = 48, color, style }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      <circle cx={24} cy={24} r={20} fill="none" stroke={ink} strokeWidth={3} />
      <circle cx={24} cy={24} r={8} fill="none" stroke={ink} strokeWidth={3} />
      <line x1={24} y1={4} x2={24} y2={16} stroke={ink} strokeWidth={3} />
      <line x1={30.9} y1={28} x2={41.3} y2={34} stroke={ink} strokeWidth={3} />
      <line x1={17.1} y1={28} x2={6.7} y2={34} stroke={ink} strokeWidth={3} />
    </svg>
  );
};

/** Named mark with its wordmark, for rows of integrations. */
export const Brand: React.FC<{
  which: "slack" | "github" | "gemini" | "claude" | "openai" | "opencode" | "codex" | "chrome" | "claude-code" | "chatgpt";
  size?: number;
  label?: boolean;
  color?: string;
}> = ({ which, size = 40, label = true, color }) => {
  const t = useTone();
  const ink = color ?? t.ink;
  const glyph = {
    slack: <SlackMark size={size} color={ink} />,
    github: <GitHubMark size={size} color={ink} />,
    gemini: <GeminiMark size={size} color={ink} />,
    claude: <ClaudeMark size={size} color={ink} />,
    "claude-code": <ClaudeMark size={size} color={ink} />,
    openai: <OpenAIMark size={size} color={ink} />,
    chatgpt: <OpenAIMark size={size} color={ink} />,
    opencode: <OpenCodeMark size={size} color={ink} />,
    codex: <CodexMark size={size} color={ink} />,
    chrome: <ChromeMark size={size} color={ink} />,
  }[which];
  const name = {
    slack: "Slack",
    github: "GitHub",
    gemini: "Gemini",
    claude: "Claude",
    "claude-code": "Claude Code",
    openai: "OpenAI",
    chatgpt: "ChatGPT",
    opencode: "OpenCode",
    codex: "Codex",
    chrome: "Chrome",
  }[which];
  return (
    <Row gap={size * 0.4}>
      {glyph}
      {label ? (
        <span style={{ fontFamily: sansFamily, fontWeight: 500, fontSize: size * 0.62, letterSpacing: 0.5, color: ink }}>{name}</span>
      ) : null}
    </Row>
  );
};
