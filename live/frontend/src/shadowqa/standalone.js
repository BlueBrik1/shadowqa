// Standalone entry (Chrome extension / <script> tag). Reads config from window.__SHADOWQA_CONFIG__ or data-* attributes.
import { initShadowQA } from "./index";

const script = document.currentScript;
const cfg = window.__SHADOWQA_CONFIG__ || {
  bridgeUrl: script?.dataset.bridgeUrl,
  token: script?.dataset.token,
  appName: script?.dataset.appName || document.title,
};
if (cfg.bridgeUrl) initShadowQA(cfg);
else console.warn("[shadowqa] standalone: bridgeUrl missing");
