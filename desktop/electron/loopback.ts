import { createServer } from "node:http";
import { once } from "node:events";

/**
 * A one-shot, ephemeral local HTTP listener that catches exactly one OAuth-style redirect and
 * shuts itself down. The user never sees or types this URL — GitHub/Slack redirect the system
 * browser to it automatically after the user clicks through their own consent screen, the same
 * mechanism `gh auth login` and `gcloud auth login` use. Nothing is written to `.env`.
 */
/**
 * Starts listening immediately (so the caller can put the real port into a redirect_url before
 * anything is sent to GitHub/Slack) and returns a promise that resolves once that one redirect
 * arrives.
 */
export async function startCallbackServer(timeoutMs = 5 * 60_000) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port as number;

  const query = new Promise<URLSearchParams>((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for the browser to redirect back"));
    }, timeoutMs);
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        "<!doctype html><body style='font-family:sans-serif;background:#1C1C1C;color:#F4F1EA;display:flex;align-items:center;justify-content:center;height:100vh'>Connected. You can close this tab and return to ShadowQA.</body>",
      );
      clearTimeout(timer);
      server.close();
      resolve(url.searchParams);
    });
  });
  return { port, query };
}
