import { useEffect, useState } from "react";

/** Every screen that shows live state polls rather than pushing sockets — the same "poll the API"
 * shape the CLI's own `status`/`watching` commands used, just on a timer instead of a keypress. */
export function usePolling<T>(fn: () => Promise<T>, intervalMs = 4000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fn().then(
        (result) => alive && (setData(result), setError(undefined)),
        (e) => alive && setError(e),
      );
    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, error };
}
