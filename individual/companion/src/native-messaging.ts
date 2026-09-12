import { Readable, Writable } from "node:stream";

/**
 * Chrome's native messaging framing: a 32-bit little-endian length prefix (native byte order on
 * every platform Chrome ships) followed by that many bytes of UTF-8 JSON. Chrome accepts at most
 * 1 MB from a host and sends at most 64 MB to one.
 */
export const HOST_TO_CHROME_MAX = 1024 * 1024;
export const CHROME_TO_HOST_MAX = 64 * 1024 * 1024;

/**
 * Pulls one complete frame out of a buffer. Returns the parsed message and the remaining bytes,
 * or `undefined` when the buffer does not yet hold a whole frame.
 */
export function readFrame(
  buffer: Buffer,
): { message: unknown; rest: Buffer } | undefined {
  if (buffer.length < 4) return undefined;
  const length = buffer.readUInt32LE(0);
  if (length > CHROME_TO_HOST_MAX)
    throw new Error("Native message exceeds the 64 MB limit");
  if (buffer.length < 4 + length) return undefined;
  const body = buffer.subarray(4, 4 + length).toString("utf8");
  return { message: JSON.parse(body), rest: buffer.subarray(4 + length) };
}

export function writeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > HOST_TO_CHROME_MAX)
    throw new Error("Reply exceeds Chrome's 1 MB native-messaging limit");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export type Handler = (message: any) => Promise<unknown>;

/** Runs the stdio loop. One reply per request; a handler error becomes an error reply, not a crash. */
export function serve(
  handler: Handler,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
) {
  let buffer: Buffer = Buffer.alloc(0);
  let queue: Promise<void> = Promise.resolve();

  input.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]) as Buffer;
    for (;;) {
      let frame;
      try {
        frame = readFrame(buffer);
      } catch (e) {
        output.write(
          writeFrame({ ok: false, error: String((e as Error).message) }),
        );
        buffer = Buffer.alloc(0);
        return;
      }
      if (!frame) return;
      buffer = frame.rest as Buffer;
      const message = frame.message as any;
      queue = queue.then(async () => {
        try {
          const result = await handler(message);
          output.write(writeFrame({ id: message?.id, ok: true, result }));
        } catch (e: any) {
          output.write(
            writeFrame({
              id: message?.id,
              ok: false,
              error: String(e?.message ?? e).slice(0, 2000),
              code: e?.code,
            }),
          );
        }
      });
    }
  });

  return new Promise<void>((resolve) => {
    input.on("end", () => void queue.then(resolve));
    input.on("close", () => void queue.then(resolve));
  });
}
