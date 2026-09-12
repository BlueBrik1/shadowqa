import { ShadowQA } from "./core";

let instance = null;

/** Initialise the ambient ShadowQA runtime. Safe to call once per page. */
export function initShadowQA(config) {
  if (instance || typeof window === "undefined") return instance;
  try {
    instance = new ShadowQA(config);
    instance.start();
  } catch (err) {
    // ShadowQA must never take the host application down.
    console.warn("[shadowqa] failed to start:", err);
  }
  return instance;
}

export const getShadowQA = () => instance;
