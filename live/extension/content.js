// Injects the ShadowQA runtime SDK into the page (main world) with the bridge config from extension storage.
(async () => {
  const { bridgeUrl, token, appName, enabled = true } = await chrome.storage.sync.get(["bridgeUrl", "token", "appName", "enabled"]);
  if (!enabled || !bridgeUrl || !token) return;
  if (document.querySelector("shadowqa-root") || window.__shadowqa) return; // app already embeds the SDK

  const config = document.createElement("script");
  config.textContent = `window.__SHADOWQA_CONFIG__ = ${JSON.stringify({ bridgeUrl, token, appName: appName || document.title })};`;
  (document.head || document.documentElement).appendChild(config);
  config.remove();

  const sdk = document.createElement("script");
  sdk.src = chrome.runtime.getURL("shadowqa.js");
  sdk.async = false;
  (document.head || document.documentElement).appendChild(sdk);
})();
