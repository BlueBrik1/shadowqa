import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { c, clamp, enter, POP } from "../theme";

/**
 * The ShadowQA mark. `◈` is the glyph the CLI prints; the drawn version is the same
 * diamond-in-diamond so the wordmark and the terminal read as one identity.
 */
export const ShadowMark: React.FC<{
  size?: number;
  delay?: number;
  color?: string;
  glow?: boolean;
}> = ({ size = 120, delay = 0, color = c.cyan, glow = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay);
  const inner = enter(frame, fps, delay + 8, POP);
  const spin = interpolate(frame - delay, [0, 60], [-24, 0], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 4),
  });
  const outline = 2 * Math.PI * 60;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{
        overflow: "visible",
        filter: glow ? `drop-shadow(0 0 ${26 * p}px ${color}88)` : undefined,
        transform: `rotate(${spin}deg)`,
      }}
    >
      <path
        d="M60 6 L114 60 L60 114 L6 60 Z"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeDasharray={outline}
        strokeDashoffset={outline * (1 - p)}
        opacity={0.9}
      />
      <path
        d="M60 30 L90 60 L60 90 L30 60 Z"
        fill={color}
        opacity={inner * 0.95}
        transform={`scale(${0.6 + inner * 0.4}) translate(${(1 - inner) * 40} ${(1 - inner) * 40})`}
        style={{ transformOrigin: "60px 60px" }}
      />
      <path d="M60 30 L90 60 L60 90 Z" fill="#06080B" opacity={inner * 0.35} />
    </svg>
  );
};

const Svg: React.FC<{
  children: React.ReactNode;
  size: number;
  viewBox?: string;
  style?: React.CSSProperties;
}> = ({ children, size, viewBox = "0 0 24 24", style }) => (
  <svg width={size} height={size} viewBox={viewBox} style={style}>
    {children}
  </svg>
);

export const SlackMark: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <Svg size={size} viewBox="0 0 122 122">
    <path
      fill="#E01E5A"
      d="M26 77a12 12 0 1 1-12-12h12v12Zm6 0a12 12 0 0 1 24 0v31a12 12 0 0 1-24 0V77Z"
    />
    <path
      fill="#36C5F0"
      d="M44 26a12 12 0 1 1 12-12v12H44Zm0 6a12 12 0 0 1 0 24H13a12 12 0 0 1 0-24h31Z"
    />
    <path
      fill="#2EB67D"
      d="M95 44a12 12 0 1 1 12 12H95V44Zm-6 0a12 12 0 0 1-24 0V13a12 12 0 0 1 24 0v31Z"
    />
    <path
      fill="#ECB22E"
      d="M77 95a12 12 0 1 1-12 12V95h12Zm0-6a12 12 0 0 1 0-24h31a12 12 0 0 1 0 24H77Z"
    />
  </Svg>
);

export const GitHubMark: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = c.text,
}) => (
  <Svg size={size} viewBox="0 0 16 16">
    <path
      fill={color}
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
    />
  </Svg>
);

export const OpenAIMark: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = "#E9EEF4",
}) => (
  <Svg size={size} viewBox="0 0 24 24">
    <path
      fill={color}
      d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.5-2.9A6 6 0 0 0 4.98 3.7a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.9 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.05 6.05 0 0 0 5.77-4.21 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.07ZM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.5 4.5 0 0 1-4.49 4.49ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76c.24.14.54.14.78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.07l-4.84 2.79a4.5 4.5 0 0 1-6.13-1.65ZM2.34 7.9a4.48 4.48 0 0 1 2.34-1.97v5.68c0 .28.15.54.39.68l5.81 3.35-2.02 1.17a.07.07 0 0 1-.07 0L3.97 14a4.5 4.5 0 0 1-1.64-6.13Zm16.6 3.86-5.83-3.4L15.12 7.2a.07.07 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.67Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.42 9.24V6.91a.07.07 0 0 1 .03-.07l4.83-2.79a4.49 4.49 0 0 1 6.67 4.65ZM8.32 12.87 6.3 11.7a.07.07 0 0 1-.04-.06V6.07a4.49 4.49 0 0 1 7.36-3.45l-.14.08-4.78 2.76a.79.79 0 0 0-.39.68v6.73Zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3Z"
    />
  </Svg>
);

export const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = "#D97757",
}) => (
  <Svg size={size} viewBox="0 0 24 24">
    <path
      fill={color}
      d="M4.3 15.9 8.9 13.3l.08-.22-.08-.13H8.7l-.74-.05-2.54-.07-2.2-.09-2.13-.11-.54-.11L0 11.86l.05-.33.45-.3.64.05 1.43.1 2.14.15 1.55.09 2.3.24h.37l.05-.15-.13-.09-.1-.09-2.29-1.55L4 8.4l-1.3-.94-.7-.48-.35-.45-.15-.97.63-.7.85.06.22.06.86.66 1.84 1.42 2.4 1.77.35.3.14-.1.02-.07-.16-.26-1.3-2.35-1.39-2.4-.62-1L5.18 2.4a4.9 4.9 0 0 1-.09-.8L5.81.63 6.21.5l.96.13.4.35.6 1.36.97 2.15 1.5 2.93.44.87.24.8.09.25h.15V9l.13-1.63.24-2 .23-2.58.08-.72.38-.92.75-.5.59.28.48.69-.07.45-.29 1.87-.55 2.9-.36 1.94h.2l.25-.24 1-1.32 1.67-2.09.74-.83.87-.92.55-.44h1.05l.78 1.15-.35 1.19-1.09 1.38-.9 1.17-1.3 1.75-.81 1.4.07.11.2-.02 2.9-.62 1.57-.28 1.88-.32.84.39.1.4-.33.82-2 .5-2.34.46-3.49.83-.05.03.05.07 1.57.15.67.04h1.65l3.07.23.8.53.48.65-.08.49-1.23.63-1.67-.4-3.89-.92-1.33-.34h-.19v.12l1.11 1.09 2.04 1.83 2.55 2.38.13.58-.33.47-.34-.05-2.24-1.69-.87-.76-1.96-1.65h-.13v.17l.45.66 2.39 3.59.12 1.1-.17.36-.62.22-.68-.13-1.4-1.96-1.44-2.21-1.16-1.98-.14.08-.68 7.35-.32.38-.74.28-.61-.47-.33-.75.33-1.5.4-1.96.32-1.56.29-1.93.17-.64-.01-.04-.14.02-1.45 2-2.2 2.97-1.75 1.87-.42.17-.72-.38.07-.67.4-.6 2.4-3.05 1.45-1.9.94-1.09-.01-.16h-.05L6.1 17.68l-1.53.2-.66-.62.08-1.01.31-.33 2.6-1.79-.01.01Z"
    />
  </Svg>
);

export const GeminiMark: React.FC<{ size?: number }> = ({ size = 28 }) => {
  const id = React.useId();
  return (
    <Svg size={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9C8CFF" />
          <stop offset="50%" stopColor="#73E3D3" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M12 0c.3 5.1 2.5 8.6 6.6 10.6 1.6.8 3.4 1.2 5.4 1.4-6.4.4-10.2 3.6-11.6 9.7-.2.8-.3 1.5-.4 2.3-.4-6.2-3.3-9.9-8.7-11.4-1.1-.3-2.2-.5-3.3-.6C6.4 11.6 10.2 8.4 11.6 2.3c.2-.8.3-1.5.4-2.3Z"
      />
    </Svg>
  );
};

export const DockerMark: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = "#60A5FA",
}) => (
  <Svg size={size} viewBox="0 0 24 24">
    <path
      fill={color}
      d="M13.98 11.08h2.12a.19.19 0 0 0 .19-.19V9.01a.19.19 0 0 0-.19-.18h-2.12a.18.18 0 0 0-.18.18v1.88c0 .1.08.19.18.19m-2.95-5.43h2.12a.19.19 0 0 0 .18-.19V3.58a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.88c0 .1.09.19.19.19m0 2.72h2.12a.19.19 0 0 0 .18-.19V6.3a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.88c0 .1.09.19.19.19m-2.93 0h2.12a.19.19 0 0 0 .18-.19V6.3a.19.19 0 0 0-.18-.18H8.1a.19.19 0 0 0-.19.18v1.88c0 .1.08.19.19.19m-2.96 0h2.12a.19.19 0 0 0 .19-.19V6.3a.19.19 0 0 0-.19-.18H5.14a.18.18 0 0 0-.18.18v1.88c0 .1.08.19.18.19m5.89 2.71h2.12a.19.19 0 0 0 .18-.19V9.01a.19.19 0 0 0-.18-.18h-2.12a.18.18 0 0 0-.19.18v1.88c0 .1.09.19.19.19m-2.93 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.18H8.1a.19.19 0 0 0-.19.18v1.88c0 .1.08.19.19.19m-2.96 0h2.12a.18.18 0 0 0 .19-.19V9.01a.18.18 0 0 0-.19-.18H5.14a.18.18 0 0 0-.18.18v1.88c0 .1.08.19.18.19m-2.92 0h2.12a.18.18 0 0 0 .18-.19V9.01a.18.18 0 0 0-.18-.18H2.22a.18.18 0 0 0-.19.18v1.88c0 .1.08.19.19.19M23.76 9.9c-.06-.05-.67-.51-1.95-.51-.34 0-.68.03-1.01.09a3.77 3.77 0 0 0-1.72-2.57l-.34-.2-.23.33c-.29.45-.5.95-.6 1.48-.12.5-.1 1.37.3 2.12-.48.27-1.26.33-1.42.34H.56a.56.56 0 0 0-.56.56 8.6 8.6 0 0 0 .52 3.02 4.51 4.51 0 0 0 1.8 2.33c.75.4 1.98.63 3.37.63.63 0 1.26-.06 1.88-.17a7.8 7.8 0 0 0 2.45-.89 6.74 6.74 0 0 0 1.67-1.37 9.1 9.1 0 0 0 1.64-2.79h.14c1.37 0 2.21-.55 2.68-1 .3-.3.55-.66.71-1.06l.1-.29-.2-.06Z"
    />
  </Svg>
);

export const Glyph: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: number;
  delay?: number;
  ring?: boolean;
}> = ({ children, color = c.cyan, size = 56, delay = 0, ring = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, POP);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        display: "grid",
        placeItems: "center",
        background: `${color}14`,
        border: ring ? `1px solid ${color}3A` : undefined,
        transform: `scale(${0.7 + p * 0.3})`,
        opacity: p,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
};
