# ShadowQA for VS Code

Use the ShadowQA activity bar to compile accumulated context, inspect and approve plans, select automation modes, open the exact OpenCode session, inspect verified diffs, and cancel work. The extension uses native VS Code controls and integrated terminals; it has no webview or dashboard.

Install the main ShadowQA service and CLI first. Set `shadowqa.cliPath` to the absolute path of `dist/cli/main.js`, and `shadowqa.serviceUrl` to your service. Run `shadowqa login` in the integrated terminal so the CLI can read your token from OS credential storage. The extension stores no tokens.

Use **ShadowQA: Watch Saved Files** to explicitly consent to a folder. Compiler diagnostics from `.shadowqa/diagnostics.json` appear in Problems and clear when saved files change. Agent sessions require a running local runner and the pinned OpenCode CLI. Completed jobs remain available through logs and diffs.
