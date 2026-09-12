import React from "react";
import { Composition } from "remotion";
import { Business, BUSINESS } from "./business/Business";
import { Individual, INDIVIDUAL } from "./individual/Individual";
import "./fonts";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const Root: React.FC = () => (
  <>
    <Composition
      id="ShadowQA-Business"
      component={Business}
      durationInFrames={BUSINESS.total}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="ShadowQA-Individual"
      component={Individual}
      durationInFrames={INDIVIDUAL.total}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
