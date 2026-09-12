"""Autonomous QA mode: declared + learned flows executed by the browser runtime, results recorded here."""
import json

from . import memory
from .db import qa_runs, now_iso
from .workspace import Workspace, WorkspaceError


def declared_flows(ws: Workspace) -> list[dict]:
    try:
        raw = json.loads(ws.read_text("shadowqa.flows.json"))
    except (WorkspaceError, json.JSONDecodeError, FileNotFoundError):
        return []
    flows = raw.get("flows", []) if isinstance(raw, dict) else raw
    out: list[dict] = []
    for f in flows[:30]:
        steps = [s for s in f.get("steps", []) if isinstance(s, dict) and s.get("action") in ("navigate", "click", "fill", "submit")]
        out.append({"name": str(f.get("name", "flow"))[:60], "source": "declared", "steps": steps[:40],
                    "expectations": f.get("expectations", {})})
    return out


async def all_flows(ws: Workspace) -> list[dict]:
    doc = await memory.get()
    learned = [{"name": f["name"], "source": "learned", "steps": f.get("steps", []), "expectations": f.get("expectations", {}),
                "incident_id": f.get("incident_id")} for f in doc.get("flows", [])]
    return declared_flows(ws) + learned


async def record_run(run: dict) -> dict:
    doc = {
        "id": run.get("id"),
        "at": now_iso(),
        "duration_ms": run.get("duration_ms"),
        "flows": [{"name": str(f.get("name"))[:60], "source": f.get("source"), "status": f.get("status"), "duration_ms": f.get("duration_ms"),
                   "error": (str(f.get("error"))[:300] if f.get("error") else None), "incident_id": f.get("incident_id"),
                   "steps": [{"label": str(s.get("label"))[:80], "status": s.get("status"), "detail": (str(s.get("detail"))[:160] if s.get("detail") else None)}
                             for s in (f.get("steps") or [])[:40]]}
                  for f in run.get("flows", [])[:40]],
    }
    doc["passed"] = sum(1 for f in doc["flows"] if f["status"] == "passed")
    doc["failed"] = sum(1 for f in doc["flows"] if f["status"] == "failed")
    await qa_runs.insert_one(dict(doc))
    await memory.record_qa_run(doc)
    doc.pop("_id", None)
    return doc


async def latest_run() -> dict | None:
    return await qa_runs.find_one({}, {"_id": 0}, sort=[("at", -1)])
