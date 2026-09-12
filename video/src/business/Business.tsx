import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Open, Problem } from "./scenes-open";
import { SetupSlack, SetupGithub, SetupMode, Watching } from "./scenes-setup";
import { Compile, PlanReview, Approve } from "./scenes-plan";
import { Execute, Verify, Publish, ContinuousQA, Close } from "./scenes-run";
import { Progress } from "../components/Layout";
import { c } from "../theme";

type Entry = {
  id: string;
  duration: number;
  render: (d: number) => React.ReactNode;
};

/** Scenes overlap by `CROSSFADE` frames; each Scene fades itself, so the overlap is the cut. */
export const CROSSFADE = 10;

export const scenes: Entry[] = [
  { id: "open", duration: 130, render: (d) => <Open duration={d} /> },
  { id: "problem", duration: 175, render: (d) => <Problem duration={d} /> },
  { id: "slack", duration: 205, render: (d) => <SetupSlack duration={d} /> },
  { id: "github", duration: 195, render: (d) => <SetupGithub duration={d} /> },
  { id: "mode", duration: 200, render: (d) => <SetupMode duration={d} /> },
  { id: "watching", duration: 250, render: (d) => <Watching duration={d} /> },
  { id: "compile", duration: 245, render: (d) => <Compile duration={d} /> },
  { id: "plan", duration: 235, render: (d) => <PlanReview duration={d} /> },
  { id: "approve", duration: 185, render: (d) => <Approve duration={d} /> },
  { id: "execute", duration: 260, render: (d) => <Execute duration={d} /> },
  { id: "verify", duration: 235, render: (d) => <Verify duration={d} /> },
  { id: "publish", duration: 185, render: (d) => <Publish duration={d} /> },
  { id: "qa", duration: 240, render: (d) => <ContinuousQA duration={d} /> },
  { id: "close", duration: 170, render: (d) => <Close duration={d} /> },
];

export function layout(entries: Entry[], crossfade = CROSSFADE) {
  let cursor = 0;
  const placed = entries.map((entry) => {
    const from = cursor;
    cursor += entry.duration - crossfade;
    return { ...entry, from };
  });
  return { placed, total: cursor + crossfade };
}

export const BUSINESS = layout(scenes);

export const Business: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      {BUSINESS.placed.map((entry) => (
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
      <Progress total={BUSINESS.total} value={frame} />
    </AbsoluteFill>
  );
};
