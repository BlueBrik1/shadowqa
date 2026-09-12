import React from "react";
import { Composition } from "remotion";
import { Film, FILM } from "./film/Film";
import { Slides, SLIDES, SLIDE_W, SLIDE_H } from "./slides/Slides";
import "./fonts";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const Root: React.FC = () => (
  <>
    {/* The one film: problem → teams → individuals → Live → built-in → close. */}
    <Composition id="ShadowQA" component={Film} durationInFrames={FILM.total} fps={FPS} width={WIDTH} height={HEIGHT} />
    {/* Slide deck: one frame per slide, rendered to stills and bound into a PDF by scripts/slides.mjs. */}
    <Composition
      id="ShadowQA-Slides"
      component={Slides}
      durationInFrames={SLIDES.length}
      fps={1}
      width={SLIDE_W}
      height={SLIDE_H}
    />
  </>
);
