import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * GitHub's App Manifest flow: an auto-submitting HTML form POSTs the manifest JSON to
 * github.com, which creates the App and redirects back to `redirect_url` with a one-time `code`
 * — exchanged via `POST /app-manifests/{code}/conversions` (see src/core/connect.ts) for the
 * app id, PEM private key and webhook secret, all without the user typing or copying anything.
 * https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
 */
export async function writeManifestForm(redirectUrl: string, state: string) {
  const manifest = {
    name: `ShadowQA-${state.slice(0, 6)}`,
    url: "https://github.com/shadowqa",
    redirect_url: redirectUrl,
    public: false,
    default_permissions: {
      contents: "read",
      metadata: "read",
      pull_requests: "write",
      issues: "write",
      checks: "write",
    },
    default_events: [
      "issues",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "pull_request_review_comment",
      "check_run",
      "check_suite",
      "workflow_run",
      "status",
      "push",
    ],
  };
  const html = `<!doctype html>
<body onload="document.forms[0].submit()">
  <form action="https://github.com/settings/apps/new?state=${encodeURIComponent(state)}" method="post">
    <input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
  </form>
  Connecting to GitHub…
</body>`;
  const dir = await mkdtemp(path.join(tmpdir(), "shadowqa-github-"));
  const file = path.join(dir, "connect.html");
  await writeFile(file, html, "utf8");
  return file;
}
