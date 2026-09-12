"""Application memory: routes, APIs, components, flows, known failures, fixes and validation history."""
from .db import memory_col, now_iso

DOC_ID = "default"
EMPTY = {"id": DOC_ID, "routes": {}, "apis": {}, "components": {}, "known_failures": {}, "fixes": [], "validation_history": [],
         "flows": [], "updated_at": None}


def _k(s: str) -> str:
    return (s or "").replace(".", "\u2024").replace("$", "\uff04")[:120]


def _unk(s: str) -> str:
    return (s or "").replace("\u2024", ".").replace("\uff04", "$")


async def get() -> dict:
    doc = await memory_col.find_one({"id": DOC_ID}, {"_id": 0})
    return doc or dict(EMPTY)


async def _save(doc: dict) -> None:
    doc["updated_at"] = now_iso()
    await memory_col.replace_one({"id": DOC_ID}, doc, upsert=True)


async def observe(payload: dict) -> None:
    doc = await get()
    items = lambda key: [x for x in (payload.get(key) or []) if isinstance(x, dict)]  # noqa: E731 — SDK payload is a system boundary
    for r in items("routes")[:50]:
        entry = doc["routes"].setdefault(_k(r.get("path", "/")), {"path": r.get("path"), "count": 0})
        entry["count"] += int(r.get("count", 1))
        entry["last_seen"] = now_iso()
        if r.get("title"):
            entry["title"] = str(r["title"])[:80]
    for a in items("apis")[:80]:
        key = _k(f"{a.get('method')} {a.get('path')}")
        entry = doc["apis"].setdefault(key, {"method": a.get("method"), "path": a.get("path"), "count": 0, "statuses": {}})
        entry["count"] += int(a.get("count", 1))
        st = str(a.get("status") or 0)
        entry["statuses"][st] = entry["statuses"].get(st, 0) + int(a.get("count", 1))
        entry["last_seen"] = now_iso()
    for c in items("components")[:80]:
        name = str(c.get("name"))[:60]
        entry = doc["components"].setdefault(_k(name), {"name": name, "count": 0, "routes": []})
        entry["count"] += int(c.get("count", 1))
        route = c.get("route")
        if route and route not in entry["routes"]:
            entry["routes"] = (entry["routes"] + [route])[-8:]
    await _save(doc)


async def record_incident(inc: dict) -> bool:
    """Registers the failure; returns True when this fingerprint was previously fixed (regression)."""
    doc = await get()
    fp = inc["fingerprint"]
    known = doc["known_failures"].get(fp)
    regression = bool(known and known.get("status") == "fixed")
    entry = known or {"fingerprint": fp, "count": 0, "first_seen": now_iso(), "status": "open"}
    entry["count"] += 1
    entry["last_seen"] = now_iso()
    entry["title"] = inc.get("title")
    entry["route"] = (inc.get("app") or {}).get("route")
    loc = inc.get("source_location") or {}
    entry["file"] = loc.get("file")
    entry["line"] = loc.get("line")
    entry["last_incident_id"] = inc["id"]
    if regression:
        entry["status"] = "regressed"
        entry["regressions"] = entry.get("regressions", 0) + 1
    doc["known_failures"][fp] = entry
    route = (inc.get("app") or {}).get("route")
    if route:
        r = doc["routes"].setdefault(_k(route), {"path": route, "count": 0})
        r["failures"] = r.get("failures", 0) + 1
    comp = inc.get("component")
    if comp:
        c = doc["components"].setdefault(_k(comp), {"name": comp, "count": 0, "routes": []})
        c["failures"] = c.get("failures", 0) + 1
    await _save(doc)
    return regression


async def record_fix(inc: dict, verified: bool) -> None:
    doc = await get()
    fp = inc["fingerprint"]
    entry = doc["known_failures"].get(fp) or {"fingerprint": fp, "count": 1, "first_seen": now_iso()}
    entry["status"] = "fixed" if verified else entry.get("status", "open")
    entry["fix_incident_id"] = inc["id"]
    doc["known_failures"][fp] = entry
    patch = inc.get("patch") or {}
    doc["fixes"] = ([{
        "incident_id": inc["id"], "title": inc.get("title"), "at": now_iso(), "verified": verified,
        "files": [f["path"] for f in patch.get("files", [])],
        "summary": (inc.get("diagnosis") or {}).get("root_cause"),
        "risk": (inc.get("risk") or {}).get("level"),
    }] + doc["fixes"])[:50]
    if verified and inc.get("replay_plan"):
        plan = inc["replay_plan"]
        flows = [f for f in doc["flows"] if f.get("fingerprint") != fp]
        flows.insert(0, {"name": f"Regression: {inc.get('title')}", "source": "learned", "fingerprint": fp, "incident_id": inc["id"],
                         "steps": plan.get("steps", []), "expectations": plan.get("expectations", {}), "learned_at": now_iso()})
        doc["flows"] = flows[:20]
    await _save(doc)


async def record_validation(inc: dict) -> None:
    doc = await get()
    v = inc.get("validation") or {}
    doc["validation_history"] = ([{"incident_id": inc["id"], "at": now_iso(), "status": v.get("status"),
                                   "steps": [{"name": s.get("name"), "status": s.get("status"), "duration_ms": s.get("duration_ms")}
                                             for s in v.get("steps", [])]}] + doc["validation_history"])[:50]
    await _save(doc)


async def record_qa_run(run: dict) -> None:
    doc = await get()
    for flow in run.get("flows", []):
        key = _k(f"flow:{flow.get('name')}")
        entry = doc["routes"].setdefault(key, {"path": f"flow:{flow.get('name')}", "count": 0})
        entry["count"] += 1
        entry["last_status"] = flow.get("status")
        entry["last_seen"] = now_iso()
    await _save(doc)


async def brief_for(fingerprint: str, files: list[str]) -> str:
    doc = await get()
    lines: list[str] = []
    known = doc["known_failures"].get(fingerprint)
    if known:
        lines.append(f"- This exact failure was seen {known.get('count')}x before (status: {known.get('status')}).")
    for fix in doc["fixes"][:8]:
        if any(f in files for f in fix.get("files", [])):
            lines.append(f"- Previous fix in {', '.join(fix['files'])}: {fix.get('summary')} (verified={fix.get('verified')})")
    apis = sorted(doc["apis"].values(), key=lambda a: -a.get("count", 0))[:10]
    if apis:
        lines.append("- Known APIs: " + ", ".join(f"{a['method']} {a['path']} [{','.join(a['statuses'].keys())}]" for a in apis))
    return "\n".join(lines)


def decode_for_client(doc: dict) -> dict:
    out = dict(doc)
    for section in ("routes", "apis", "components", "known_failures"):
        out[section] = {_unk(k): v for k, v in (doc.get(section) or {}).items()}
    return out
