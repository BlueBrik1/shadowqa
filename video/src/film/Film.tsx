import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Progress } from "./ui";
import { c } from "../theme";
import { Open, ProblemSlack, ProblemPR, ProblemDrift, ProblemChats, ProblemPlaces, Turn } from "./scenes-problem";
import { SetupSlack, SetupGitHub, SetupMode, Watching, Compile, PlanView, Approve, Execute, Verified, FindingsRepair } from "./scenes-business";
import { SetupClaude, SetupOpenAI, SetupExtension, ModeIndividual, GatherIndividual, PlanIndividual, ExecuteIndividual, VerifiedIndividual } from "./scenes-individual";
import {
  LiveIntro, LiveBreak, LiveCapture, LiveDiagnose, LiveReplay, LiveOne,
  FeatureIsolation, FeatureNoWeakening, FeatureModes, FeatureRisk, FeatureCited, FeatureKill, Close,
} from "./scenes-live";

type Entry = { id: string; duration: number; render: (d: number) => React.ReactNode };

/** Scenes overlap by CROSSFADE frames; each Frame fades itself, so the overlap is the cut. */
export const CROSSFADE = 12;

export const scenes: Entry[] = [
  // Open + problem
  { id: "open", duration: 110, render: (d) => <Open duration={d} /> },
  { id: "p-slack", duration: 170, render: (d) => <ProblemSlack duration={d} /> },
  { id: "p-pr", duration: 160, render: (d) => <ProblemPR duration={d} /> },
  { id: "p-drift", duration: 160, render: (d) => <ProblemDrift duration={d} /> },
  { id: "p-chats", duration: 180, render: (d) => <ProblemChats duration={d} /> },
  { id: "p-places", duration: 130, render: (d) => <ProblemPlaces duration={d} /> },
  { id: "turn", duration: 140, render: (d) => <Turn duration={d} /> },
  // Teams
  { id: "b-slack", duration: 160, render: (d) => <SetupSlack duration={d} /> },
  { id: "b-github", duration: 160, render: (d) => <SetupGitHub duration={d} /> },
  { id: "b-mode", duration: 200, render: (d) => <SetupMode duration={d} /> },
  { id: "b-watching", duration: 230, render: (d) => <Watching duration={d} /> },
  { id: "b-compile", duration: 160, render: (d) => <Compile duration={d} /> },
  { id: "b-plan", duration: 250, render: (d) => <PlanView duration={d} /> },
  { id: "b-approve", duration: 140, render: (d) => <Approve duration={d} /> },
  { id: "b-execute", duration: 260, render: (d) => <Execute duration={d} /> },
  { id: "b-verified", duration: 190, render: (d) => <Verified duration={d} /> },
  { id: "b-findings", duration: 260, render: (d) => <FindingsRepair duration={d} /> },
  // Individuals
  { id: "i-claude", duration: 130, render: (d) => <SetupClaude duration={d} /> },
  { id: "i-openai", duration: 120, render: (d) => <SetupOpenAI duration={d} /> },
  { id: "i-extension", duration: 190, render: (d) => <SetupExtension duration={d} /> },
  { id: "i-mode", duration: 110, render: (d) => <ModeIndividual duration={d} /> },
  { id: "i-gather", duration: 240, render: (d) => <GatherIndividual duration={d} /> },
  { id: "i-plan", duration: 220, render: (d) => <PlanIndividual duration={d} /> },
  { id: "i-execute", duration: 210, render: (d) => <ExecuteIndividual duration={d} /> },
  { id: "i-verified", duration: 170, render: (d) => <VerifiedIndividual duration={d} /> },
  // Live
  { id: "l-intro", duration: 130, render: (d) => <LiveIntro duration={d} /> },
  { id: "l-break", duration: 160, render: (d) => <LiveBreak duration={d} /> },
  { id: "l-capture", duration: 180, render: (d) => <LiveCapture duration={d} /> },
  { id: "l-diagnose", duration: 220, render: (d) => <LiveDiagnose duration={d} /> },
  { id: "l-replay", duration: 220, render: (d) => <LiveReplay duration={d} /> },
  { id: "l-one", duration: 220, render: (d) => <LiveOne duration={d} /> },
  // Built in
  { id: "f-isolation", duration: 130, render: (d) => <FeatureIsolation duration={d} /> },
  { id: "f-weaken", duration: 120, render: (d) => <FeatureNoWeakening duration={d} /> },
  { id: "f-modes", duration: 130, render: (d) => <FeatureModes duration={d} /> },
  { id: "f-risk", duration: 120, render: (d) => <FeatureRisk duration={d} /> },
  { id: "f-cited", duration: 110, render: (d) => <FeatureCited duration={d} /> },
  { id: "f-kill", duration: 100, render: (d) => <FeatureKill duration={d} /> },
  // Close
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

export const FILM = layout(scenes);

export const Film: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: c.charcoal }}>
      {FILM.placed.map((entry) => (
        <Sequence key={entry.id} from={entry.from} durationInFrames={entry.duration} name={entry.id} layout="none">
          {entry.render(entry.duration)}
        </Sequence>
      ))}
      <Progress total={FILM.total} value={frame} />
    </AbsoluteFill>
  );
};
