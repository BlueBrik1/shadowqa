import { spawn } from "node:child_process";
export function blob(repo: string, oid: string): Promise<Buffer> {
  if (!/^[a-f0-9]{40,64}$/.test(oid)) throw new Error("Invalid object ID");
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repo, "cat-file", "blob", oid], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", (b: Buffer) => {
      size += b.length;
      if (size > 2_000_000) child.kill();
      else chunks.push(b);
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("Git object read failed"));
      else resolve(Buffer.concat(chunks));
    });
  });
}
