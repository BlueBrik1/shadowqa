# ShadowQA for VS Code

Use the ShadowQA activity bar to compile accumulated context, inspect and approve plans, select automation modes, open the exact OpenCode session, inspect verified diffs, and cancel work. The extension uses native VS Code controls and integrated terminals; it has no webview or dashboard.

Start the ShadowQA desktop app first — either administering the team service or pointed at one a teammate set up (see the root [README](../README.md)). Set `shadowqa.serviceUrl` to that service's URL, then run **ShadowQA: Set API Token** and paste a member or admin token issued from the desktop app's Admin tab. The token lives in VS Code's own encrypted secret storage, not a settings file.

Use **ShadowQA: Watch Saved Files** to explicitly consent to a folder. Compiler diagnostics from `.shadowqa/diagnostics.json` appear in Problems and clear when saved files change. Agent sessions require a running local runner and the pinned OpenCode CLI. Completed jobs remain available through logs and diffs.
