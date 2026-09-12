import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bridge } from "../bridge";

export function useBridge() {
  return useMemo(() => new Bridge({ bridgeUrl: `${process.env.REACT_APP_BACKEND_URL}/api/shadowqa`, token: process.env.REACT_APP_SHADOWQA_TOKEN }), []);
}

/** Polls the bridge for everything the Command Center shows. Best-effort: a failing call never blanks the page. */
export function useCenterData(intervalMs = 3000) {
  const bridge = useBridge();
  const [data, setData] = useState({ loading: true, error: null });
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const calls = {
      health: bridge.health(),
      telemetry: bridge.getTelemetry(),
      incidents: bridge.listIncidents(),
      qaRun: bridge.latestQaRun(),
      memory: bridge.getMemory(),
      settings: bridge.getSettings(),
      scenarios: bridge.getScenarios().then((r) => r.scenarios),
      flows: bridge.getFlows().then((r) => r.flows),
      audit: bridge.getAudit(),
    };
    const entries = await Promise.all(Object.entries(calls).map(async ([k, p]) => [k, await p.catch((e) => ({ __error: e.message }))]));
    if (!alive.current) return;
    const next = Object.fromEntries(entries);
    const failed = entries.filter(([, v]) => v && v.__error).map(([k, v]) => `${k}: ${v.__error}`);
    setData((prev) => ({ ...prev, ...Object.fromEntries(entries.filter(([, v]) => !(v && v.__error))), loading: false, error: failed.length === entries.length ? failed[0] : null, degraded: failed }));
    return next;
  }, [bridge]);

  useEffect(() => {
    alive.current = true;
    refresh();
    const t = setInterval(() => {
      if (document.visibilityState !== "hidden") refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh, intervalMs]);

  return { ...data, bridge, refresh };
}
