"""Event Correlation Engine + Context Graph: turns raw browser observations into a causal timeline & graph."""
import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

INTERACTIVE = {"click", "input", "submit", "change"}


def _fmt_ts(ms: int | float | None) -> str:
    if not ms:
        return "--:--:--.---"
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%H:%M:%S.") + f"{dt.microsecond // 1000:03d}"


def _label(target: dict | None) -> str:
    if not target:
        return "element"
    name = target.get("text") or target.get("name") or target.get("testid") or target.get("id") or target.get("tag") or "element"
    return str(name)[:60]


def route_name(route: str | None) -> str:
    seg = (route or "/").strip("/").split("/")[0]
    if not seg:
        return "Home"
    return seg.replace("-", " ").replace("_", " ").capitalize()


def fingerprint(failure: dict, primary: dict | None) -> str:
    msg = re.sub(r"\d+", "#", failure.get("message") or "")[:160]
    loc = f"{primary['original']['file']}:{primary['original']['line']}" if primary and primary.get("original") else (failure.get("stack") or "")[:120]
    return hashlib.sha1(f"{failure.get('type')}|{msg}|{loc}".encode()).hexdigest()[:16]


def pick_primary_frame(frames: list[dict]) -> dict | None:
    """Top-most frame that belongs to application source (not vendor, not the ShadowQA SDK)."""
    for frame in frames:
        orig = frame.get("original")
        if orig and not orig.get("vendor") and "/shadowqa/" not in orig.get("file", ""):
            return frame
    return None


def build(payload: dict, frames: list[dict], server_error_for=None) -> dict:
    failure = payload.get("failure", {})
    events = sorted(payload.get("events", []), key=lambda e: e.get("ts", 0))
    network = sorted(payload.get("network", []), key=lambda n: n.get("ts", 0))
    fail_ts = failure.get("ts") or 0
    route = (payload.get("app") or {}).get("route") or "/"
    is_http = failure.get("kind") == "http_error"

    # --- trigger: last click/submit before the failure (within 15s); a submit right after a click is the same gesture
    trigger = None
    for ev in reversed(events):
        if ev.get("kind") in ("click", "submit") and ev.get("ts", 0) <= fail_ts + 50 and fail_ts - ev.get("ts", 0) < 15000:
            trigger = ev
            break
    if trigger and trigger.get("kind") == "submit":
        for ev in reversed(events):
            if ev.get("kind") == "click" and 0 <= trigger["ts"] - ev.get("ts", 0) < 400:
                trigger = ev
                break

    # --- related request: failed request between trigger and failure, else last request finishing near the failure
    related = None
    window_start = trigger["ts"] - 50 if trigger else fail_ts - 5000
    candidates = [n for n in network if n.get("ts", 0) >= window_start and n.get("ts", 0) <= fail_ts + 1500]
    failed = [n for n in candidates if (n.get("status") or 0) >= 400 or n.get("error")]
    if failed:
        related = failed[-1]
    elif candidates:
        related = candidates[-1]

    primary = pick_primary_frame(frames)
    fp = fingerprint(failure, primary)

    # --- server-side exception joined to the failed request (captured by the server observer in the backend process)
    server_error = None
    if related and (related.get("status") or 0) >= 500 and server_error_for:
        server_error = server_error_for(related.get("method"), related.get("path") or urlparse(related.get("url") or "").path)
    handler = (server_error or {}).get("handler") or {}

    source_location = None
    if primary:
        source_location = {"file": primary["original"]["file"], "line": primary["original"]["line"],
                           "column": primary["original"].get("column"), "function": primary.get("function"), "resolved": True}
    elif handler.get("file"):
        source_location = {"file": handler["file"], "line": handler.get("line"), "column": None, "function": handler.get("function"),
                           "resolved": True, "side": "server"}
    elif frames:
        f0 = frames[0]
        source_location = {"file": urlparse(f0.get("url", "")).path, "line": f0.get("line"), "column": f0.get("column"),
                           "function": f0.get("function"), "resolved": False}

    # --- timeline
    timeline: list[dict] = []
    for ev in events:
        kind = ev.get("kind")
        if kind == "navigation":
            timeline.append({"ts": ev["ts"], "kind": "route", "label": f"Route changed → {ev.get('to')}", "ref": ev.get("id")})
        elif kind == "click":
            timeline.append({"ts": ev["ts"], "kind": "user", "label": f"User clicked → {_label(ev.get('target'))}", "ref": ev.get("id"),
                             "detail": ev.get("target")})
        elif kind == "input":
            timeline.append({"ts": ev["ts"], "kind": "user", "label": f"User typed → {_label(ev.get('target'))}", "ref": ev.get("id"),
                             "detail": {"value": ev.get("value"), "redacted": ev.get("redacted")}})
        elif kind == "submit":
            timeline.append({"ts": ev["ts"], "kind": "user", "label": f"Form submitted → {_label(ev.get('target'))}", "ref": ev.get("id")})
        elif kind == "console":
            timeline.append({"ts": ev["ts"], "kind": "console", "label": f"console.{ev.get('level')} → {str(ev.get('message'))[:120]}"})
    for n in network:
        path = n.get("path") or urlparse(n.get("url") or "").path
        timeline.append({"ts": n["ts"], "kind": "network", "label": f"Network → {n.get('method')} {path}", "ref": n.get("id")})
        if n.get("end_ts"):
            status = n.get("status")
            lab = f"Network → HTTP {status}" if status else f"Network → failed ({n.get('error') or 'no response'})"
            timeline.append({"ts": n["end_ts"], "kind": "network", "label": lab, "ref": n.get("id"),
                             "severity": "error" if (status or 0) >= 400 or not status else "ok"})
    if server_error:
        where = f" · {handler['function']}() {handler['file']}:{handler['line']}" if handler else ""
        timeline.append({"ts": (related.get("end_ts") or fail_ts) - 1, "kind": "server", "severity": "error",
                         "label": f"Server → {server_error['exception']}: {str(server_error.get('message'))[:120]}{where}"})
    if is_http:
        timeline.append({"ts": fail_ts, "kind": "failure", "label": f"Failure → {str(failure.get('message'))[:140]} (server error, no client exception)",
                         "severity": "error"})
    else:
        timeline.append({"ts": fail_ts, "kind": "runtime", "label": f"Runtime → {failure.get('type')}: {str(failure.get('message'))[:140]}",
                         "severity": "error"})
    component = (payload.get("dom") or {}).get("trigger", {}).get("component") if payload.get("dom") else None
    if component:
        timeline.append({"ts": fail_ts, "kind": "component", "label": f"Component → <{component}> rendered the trigger element"})
    if source_location and source_location.get("resolved"):
        timeline.append({"ts": fail_ts, "kind": "source", "label": f"Source → {source_location['file']}:{source_location['line']}"})
    timeline.sort(key=lambda t: t["ts"])
    for t in timeline:
        t["time"] = _fmt_ts(t["ts"])

    # --- context graph
    nodes: list[dict] = []
    edges: list[dict] = []

    def add(node_id: str, ntype: str, label: str, meta: dict | None = None) -> str:
        nodes.append({"id": node_id, "type": ntype, "label": label, "meta": meta or {}})
        return node_id

    chain: list[str] = []
    if trigger:
        chain.append(add("action", "user_action", f"{trigger.get('kind', 'click').capitalize()} '{_label(trigger.get('target'))}'", {"ts": trigger["ts"]}))
        tgt = trigger.get("target") or {}
        chain.append(add("element", "ui_element", f"<{tgt.get('tag', '?')}> {tgt.get('testid') or tgt.get('id') or _label(tgt)}", tgt))
        if tgt.get("component"):
            chain.append(add("component", "component", tgt["component"]))
    chain.append(add("route", "route", route))
    if related:
        rpath = related.get("path") or urlparse(related.get("url") or "").path
        chain.append(add("request", "network_request", f"{related.get('method')} {rpath}",
                         {"status": related.get("status"), "duration_ms": related.get("duration_ms")}))
        if server_error:
            chain.append(add("server", "server_exception", f"{server_error['exception']} in {handler.get('function', 'handler')}()",
                             {"file": handler.get("file"), "line": handler.get("line"), "message": str(server_error.get("message"))[:300]}))
        chain.append(add("response", "network_response", f"HTTP {related.get('status')}" if related.get("status") else "No response",
                         {"snippet": related.get("response_snippet")}))
    chain.append(add("error", "runtime_error", f"{failure.get('type')}: {str(failure.get('message'))[:80]}"))
    if source_location and source_location.get("resolved"):
        chain.append(add("source", "source_location", f"{source_location['file']}:{source_location['line']}", {"function": source_location.get("function")}))
        chain.append(add("file", "file", source_location["file"]))
    for a, b in zip(chain, chain[1:]):
        edges.append({"from": a, "to": b})

    # --- replay plan
    plan = build_replay_plan(events, route, related, fp, trigger)

    title = f"{route_name(route)} failed"
    if payload.get("source") == "qa" and payload.get("flow_name"):
        title = f"{payload['flow_name']} flow failed"

    related_summary = None
    if related:
        related_summary = {
            "id": related.get("id"),
            "method": related.get("method"),
            "path": related.get("path") or urlparse(related.get("url") or "").path,
            "status": related.get("status"),
            "duration_ms": related.get("duration_ms"),
            "request_body": related.get("request_body"),
            "response_snippet": related.get("response_snippet"),
            "error": related.get("error"),
            "server_error": server_error,
        }

    return {
        "title": title,
        "fingerprint": fp,
        "trigger": trigger,
        "related_request": related_summary,
        "timeline": timeline,
        "graph": {"nodes": nodes, "edges": edges},
        "replay_plan": plan,
        "source_location": source_location,
        "component": component,
        "context_signals": context_signals(payload, events, network, trigger, related_summary, source_location, component),
    }


def context_signals(payload: dict, events: list[dict], network: list[dict], trigger: dict | None, related: dict | None,
                    source_location: dict | None, component: str | None) -> list[dict]:
    """What ShadowQA knew *because it lives inside the running app* — the context a chatbox never receives."""
    signals: list[dict] = []
    if trigger:
        signals.append({"kind": "interaction", "label": f"Your gesture: {trigger.get('kind', 'click')} on '{_label(trigger.get('target'))}'"})
    typed = [e for e in events if e.get("kind") == "input"]
    if typed:
        signals.append({"kind": "inputs", "label": f"{len(typed)} field{'s' if len(typed) != 1 else ''} you filled (values masked, kept locally for replay)"})
    route = (payload.get("app") or {}).get("route")
    if route:
        signals.append({"kind": "route", "label": f"Route {route}"})
    if component:
        signals.append({"kind": "component", "label": f"React component <{component}> resolved from the DOM"})
    if related:
        body = " incl. response body" if related.get("response_snippet") else ""
        status = f"HTTP {related.get('status')}" if related.get("status") else "no response"
        signals.append({"kind": "network", "label": f"{related.get('method')} {related.get('path')} → {status}{body}"})
        se = related.get("server_error")
        if se:
            h = se.get("handler") or {}
            signals.append({"kind": "server", "label": f"Server-side exception captured in the backend process: {se.get('exception')} in {h.get('function', 'handler')}()"})
    if len(network) > 1:
        signals.append({"kind": "network_window", "label": f"{len(network)} requests in the preceding window"})
    if source_location:
        if source_location.get("side") == "server":
            signals.append({"kind": "source", "label": f"Failing handler located from the server exception: {source_location['file']}:{source_location['line']}"})
        elif source_location.get("resolved"):
            signals.append({"kind": "source", "label": f"Stack source-mapped to {source_location['file']}:{source_location['line']}"})
        else:
            signals.append({"kind": "source", "label": "Bundle stack location (no source map available)"})
    if payload.get("state"):
        signals.append({"kind": "state", "label": "Live application state snapshot"})
    console_errors = [e for e in events if e.get("kind") == "console"]
    if console_errors:
        signals.append({"kind": "console", "label": f"{len(console_errors)} console error{'s' if len(console_errors) != 1 else ''} in the window"})
    return signals


NOISE_CLICK_TAGS = {"input", "label", "form", "textarea", "select", "option", "fieldset", "legend", "div", "span", "p", "section"}
ACTIONABLE_INPUT_TYPES = {"checkbox", "radio", "submit", "button", "reset", "image"}


def is_noise_click(target: dict) -> bool:
    """Focus clicks on fields, labels and containers are not user intent — `fill` steps already carry the values."""
    tag = str(target.get("tag") or "").lower()
    if target.get("role") in ("button", "link", "tab", "menuitem", "switch", "checkbox"):
        return False
    if tag == "input":
        return str(target.get("type") or "text").lower() not in ACTIONABLE_INPUT_TYPES
    return tag in NOISE_CLICK_TAGS


def build_replay_plan(events: list[dict], route: str, related: dict | None, fp: str, trigger: dict | None) -> dict:
    # Start at the last navigation that landed on the failure route, else at the window start.
    start = 0
    for i, ev in enumerate(events):
        if ev.get("kind") == "navigation" and ev.get("to") == route:
            start = i
    steps: list[dict] = [{"id": "s0", "action": "navigate", "route": route, "label": f"Open {route}",
                          "from": next((ev.get("from") for ev in reversed(events) if ev.get("kind") == "navigation" and ev.get("to") == route and ev.get("from")), None)}]
    last_click_ts = None
    for i, ev in enumerate(events[start:], start=start):
        kind = ev.get("kind")
        tgt = ev.get("target") or {}
        is_trigger = bool(trigger) and ev.get("id") == trigger.get("id")
        if kind == "input" and tgt.get("selector"):
            steps.append({"id": f"s{len(steps)}", "action": "fill", "selector": tgt["selector"], "event_id": ev.get("id"),
                          "label": f"Enter {_label(tgt).lower()}", "fallback": {"testid": tgt.get("testid"), "name": tgt.get("name")}})
        elif kind == "click" and tgt.get("selector") and (is_trigger or not is_noise_click(tgt)):
            last_click_ts = ev.get("ts")
            steps.append({"id": f"s{len(steps)}", "action": "click", "selector": tgt["selector"],
                          "label": f"Click '{_label(tgt)}'", "fallback": {"testid": tgt.get("testid"), "text": tgt.get("text")}})
        elif kind == "submit" and tgt.get("selector"):
            if last_click_ts and ev.get("ts", 0) - last_click_ts < 300:
                continue
            steps.append({"id": f"s{len(steps)}", "action": "submit", "selector": tgt["selector"], "label": f"Submit {_label(tgt).lower()}"})
        if trigger and is_trigger:
            break
    expectations: dict = {"no_runtime_errors": True, "original_fingerprint": fp}
    if related:
        expectations["request"] = {"method": related.get("method"), "path": related.get("path") or urlparse(related.get("url") or "").path,
                                   "status_min": 200, "status_max": 399}
    return {"steps": steps, "expectations": expectations}
