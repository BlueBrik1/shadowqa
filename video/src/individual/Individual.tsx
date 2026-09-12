import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import {
  Open,
  Problem,
  SetupClaude,
  SetupOpenAI,
  SetupExtension,
  SetupMode,
} from "./scenes-a";
import { Watching, Extract, PlanScene, Approve } from "./scenes-b";
import { Execute, Verify, Deliver, Close } from "./scenes-c";
import { Progress } from "../components/Layout";
import { layout } from "../business/Business";
import { c } from "../theme";

export const scenes = [
  { id: "open", duration: 135, render: (d: number) => <Open duration={d} /> },
  {
    id: "problem",
    duration: 185,
    render: (d: number) => <Problem duration={d} />,
  },
  {
    id: "claude",
    duration: 205,
    render: (d: number) => <SetupClaude duration={d} />,
  },
  {
    id: "openai",
    duration: 175,
    render: (d: number) => <SetupOpenAI duration={d} />,
  },
  {
    id: "extension",
    duration: 240,
    render: (d: number) => <SetupExtension duration={d} />,
  },
  {
    id: "mode",
    duration: 225,
    render: (d: number) => <SetupMode duration={d} />,
  },
  {
    id: "watching",
    duration: 250,
    render: (d: number) => <Watching duration={d} />,
  },
  {
    id: "extract",
    duration: 230,
    render: (d: number) => <Extract duration={d} />,
  },
  {
    id: "plan",
    duration: 235,
    render: (d: number) => <PlanScene duration={d} />,
  },
  {
    id: "approve",
    duration: 190,
    render: (d: number) => <Approve duration={d} />,
  },
  {
    id: "execute",
    duration: 255,
    render: (d: number) => <Execute duration={d} />,
  },
  {
    id: "verify",
    duration: 235,
    render: (d: number) => <Verify duration={d} />,
  },
  {
    id: "deliver",
    duration: 240,
    render: (d: number) => <Deliver duration={d} />,
  },
  { id: "close", duration: 175, render: (d: number) => <Close duration={d} /> },
];

export const INDIVIDUAL = layout(scenes);

export const Individual: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      {INDIVIDUAL.placed.map((entry) => (
        <Sequence
          key={entry.id}
          from={entry.from}
          durationInFrames={entry.duration}
          name={entry.id}
          layout="none"
        >
          {entry.render(entry.duration)}
        </Sequence>
      ))}
      <Progress total={INDIVIDUAL.total} value={frame} />
    </AbsoluteFill>
  );
};
