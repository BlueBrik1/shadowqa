"""Fault injection for the incident pipeline: every failure path must end in a terminal state with the workspace intact.

Runs against the real workspace (a throw-away probe file inside a write root), the real validation tooling and Mongo,
but with the LLM replaced — no network, no cost. One event loop for the module (Motor binds to the first loop it sees).
"""
import asyncio
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from shadowqa import llm, orchestrator, pipeline
from shadowqa.config import settings
from shadowqa.db import audit_log, incidents, memory_col
from shadowqa.patching import plan_patch
from shadowqa.workspace import get_workspace

PROBE_REL = "frontend/src/demo/lib/sqa_fault_probe.js"
PROBE_SRC = 'export function probeGreeting(name) {\n  return `hello ${name}`;\n}\n'
LOOP = asyncio.new_event_loop()


def run(coro):
    return LOOP.run_until_complete(coro)


@pytest.fixture(scope="module", autouse=True)
def probe_file():
    ws = get_workspace()
    path: Path = ws.root / PROBE_REL
    path.write_text(PROBE_SRC, encoding="utf-8")
    saved_autonomy = settings.autonomy
    settings.autonomy = "auto_low"
    created: list[str] = []
    yield created
    settings.autonomy = saved_autonomy
    path.unlink(missing_ok=True)

    async def cleanup():
        if created:
            await incidents.delete_many({"id": {"$in": created}})
            await audit_log.delete_many({"incident_id": {"$in": created}})
        doc = await memory_col.find_one({"id": "default"})
        if doc:
            fps = [k for k, v in (doc.get("known_failures") or {}).items() if PROBE_REL in json.dumps(v)]
            for fp in fps:
                doc["known_failures"].pop(fp, None)
            doc["fixes"] = [f for f in doc.get("fixes", []) if PROBE_REL not in json.dumps(f)]
            doc["flows"] = [f for f in doc.get("flows", []) if "probe" not in json.dumps(f)]
            doc["validation_history"] = [v for v in doc.get("validation_history", []) if v.get("incident_id") not in created]
            await memory_col.replace_one({"id": "default"}, doc)

    run(cleanup())
    LOOP.close()


def payload(message: str = "probe failed", route: str = "/probe") -> dict:
    ts = int(time.time() * 1000)
    return {
        "app": {"name": "t", "url": f"http://localhost:3000{route}", "route": route, "title": "t"},
        "source": "runtime",
        "failure": {"kind": "runtime_error", "type": "TypeError", "message": message, "stack": "", "ts": ts},
        "events": [{"id": "e1", "ts": ts - 900, "kind": "navigation", "from": "/", "to": route},
                   {"id": "e2", "ts": ts - 300, "kind": "click", "route": route, "target": {"tag": "button", "text": "Probe", "selector": "[data-testid=\"probe-btn\"]", "testid": "probe-btn"}}],
        "network": [{"id": "n1", "ts": ts - 250, "end_ts": ts - 100, "kind": "network", "method": "GET", "url": "http://x/api/demo/probe", "path": "/api/demo/probe", "status": 500, "duration_ms": 150}],
        "dom": {"trigger": {"tag": "button", "text": "Probe", "component": "Probe"}},
        "timing": {"detected_at": ts, "captured_at": ts + 20},
    }


def fake_diagnosis(replace_with: str | None):
    """A diagnose() stand-in returning a patch that swaps the greeting body for `replace_with` (None → no safe fix)."""
    async def diagnose(ws, incident, brief, telemetry):
        telemetry["ai_ms"] = 3
        result = {"title": "Probe greeting wrong", "intent": "greet", "root_cause": f"{PROBE_REL}:2 wrong greeting", "explanation": "x",
                  "symptom_location": f"{PROBE_REL}:2", "cause_location": f"{PROBE_REL}:2", "confidence": 0.95, "hypotheses": [],
                  "fix_plan": "swap", "risk_notes": [], "safe_to_apply": True,
                  "verification": {"expected_request": {"method": "GET", "path": "/api/demo/probe"}, "success_selector": "[data-testid=\"probe-ok\"]"},
                  "patch": {"reason": "test"}, "_files": [], "_rounds": [{"round": 0, "provider": "fake", "model": "fake-1", "latency_ms": 3}]}
        if replace_with is not None:
            ok, plan, err = plan_patch(ws, {"files": [{"path": PROBE_REL, "hunks": [{"search": "return `hello ${name}`;", "replace": replace_with}]}]})
            assert ok, err
            result["_patch_plan"] = plan
        return result
    return diagnose


async def wait_terminal(incident_id: str, timeout: float = 90) -> dict:
    started = time.time()
    while time.time() - started < timeout:
        inc = await incidents.find_one({"id": incident_id}, {"_id": 0})
        if inc and inc["status"] in pipeline.TERMINAL | {"awaiting_replay"}:
            return inc
        await asyncio.sleep(0.4)
    raise AssertionError(f"incident {incident_id} did not settle in {timeout}s")


def probe_text() -> str:
    return (get_workspace().root / PROBE_REL).read_text(encoding="utf-8")


# ---------------------------------------------------------------- parsing robustness (no I/O)

def test_extract_json_accepts_prose_and_fences():
    raw = 'Looking at this carefully:\n\n**1.** The 422 body was `{"type":"missing","loc":["body","amount"]}`.\n\n```json\n{\n  "title": "Checkout fails",\n  "confidence": 0.97,\n  "patch": {"files": [{"path": "a.js", "hunks": [{"search": "total: x,", "replace": "amount: x,"}]}]}\n}\n```'
    data = llm.extract_json(raw)
    assert data["title"] == "Checkout fails" and data["patch"]["files"][0]["hunks"][0]["replace"] == "amount: x,"


def test_extract_json_handles_decoys_control_chars_and_trailing_commas():
    assert llm.extract_json('note {"decoy": true} then {"title": "ok", "n": 2,}')["title"] == "ok"
    assert llm.extract_json('{"a": "line\nbreak", "t": "x {y} z"}')["a"] == "line\nbreak"
    assert llm.extract_json('```\n{"a": [1, 2,]}\n```')["a"] == [1, 2]
    with pytest.raises(ValueError):
        llm.extract_json("no json here")


# ---------------------------------------------------------------- pipeline failure paths

def test_llm_unavailable_marks_diagnosis_failed(probe_file, monkeypatch):
    async def down(*_a, **_k):
        raise llm.LLMUnavailable("anthropic → 529 overloaded; openai → 401")
    monkeypatch.setattr(orchestrator, "diagnose", down)
    inc = run(pipeline.ingest(payload("AI down")))
    probe_file.append(inc["id"])
    final = run(wait_terminal(inc["id"]))
    assert final["status"] == "diagnosis_failed"
    assert "AI unavailable" in final["error"] and "529" in final["error"]
    assert probe_text() == PROBE_SRC


def test_no_patch_marks_no_safe_fix(probe_file, monkeypatch):
    monkeypatch.setattr(orchestrator, "diagnose", fake_diagnosis(None))
    inc = run(pipeline.ingest(payload("no fix")))
    probe_file.append(inc["id"])
    final = run(wait_terminal(inc["id"]))
    assert final["status"] == "no_safe_fix" and final.get("patch") is None
    assert final["diagnosis"]["root_cause"].startswith(PROBE_REL)
    assert probe_text() == PROBE_SRC


def test_validation_failure_rolls_back_to_checkpoint(probe_file, monkeypatch):
    monkeypatch.setattr(orchestrator, "diagnose", fake_diagnosis("return `hello ${name}` ;;; const = ;"))  # syntax error
    inc = run(pipeline.ingest(payload("syntax bomb")))
    probe_file.append(inc["id"])
    final = run(wait_terminal(inc["id"]))
    assert final["status"] == "validation_failed"
    assert final["policy"].get("auto_applied") is True  # LOW risk → applied autonomously → caught by validation
    assert final["validation"]["status"] == "failed" and final["validation"]["steps"][0]["status"] == "failed"
    assert final["telemetry"]["rollback"] is True and final.get("rolled_back_at")
    assert probe_text() == PROBE_SRC, "checkpoint must restore the original file"
    actions = [a["action"] for a in run(audit_log.find({"incident_id": inc["id"]}, {"_id": 0}).to_list(50))]
    assert {"checkpoint.created", "patch.applied", "rollback.validation_failed"} <= set(actions)


def test_replay_failure_rolls_back(probe_file, monkeypatch):
    monkeypatch.setattr(orchestrator, "diagnose", fake_diagnosis("return `hi ${name}`;"))
    inc = run(pipeline.ingest(payload("replay will fail")))
    probe_file.append(inc["id"])
    applied = run(wait_terminal(inc["id"]))
    assert applied["status"] == "awaiting_replay", applied.get("error")
    assert "hi ${name}" in probe_text()
    assert applied["replay_plan"]["expectations"]["ui"]["selector"] == '[data-testid="probe-ok"]'
    assert applied["replay_plan"]["expectations"]["request"]["path"] == "/api/demo/probe"
    final = run(pipeline.record_replay(inc["id"], {"status": "failed", "steps": [], "evidence": [{"label": "Response", "ok": False}], "duration_ms": 900}))
    assert final["status"] == "replay_failed" and final["telemetry"]["rollback"] is True
    assert probe_text() == PROBE_SRC


def test_replay_success_verifies_learns_and_manual_rollback_restores(probe_file, monkeypatch):
    monkeypatch.setattr(orchestrator, "diagnose", fake_diagnosis("return `hey ${name}`;"))
    inc = run(pipeline.ingest(payload("replay will pass")))
    probe_file.append(inc["id"])
    applied = run(wait_terminal(inc["id"]))
    assert applied["status"] == "awaiting_replay"
    final = run(pipeline.record_replay(inc["id"], {"status": "passed", "steps": [{"id": "s0", "status": "passed"}],
                                                   "evidence": [{"label": "Response 200", "ok": True}], "duration_ms": 1200}))
    assert final["status"] == "verified" and final["telemetry"]["total_ms"] > 0
    mem = run(memory_col.find_one({"id": "default"}))
    assert any(f["incident_id"] == inc["id"] and f["verified"] for f in mem["fixes"])
    assert any(f.get("incident_id") == inc["id"] and f["source"] == "learned" for f in mem["flows"])
    # a late/duplicate report never overturns the verdict
    again = run(pipeline.record_replay(inc["id"], {"status": "failed", "steps": [], "evidence": [], "duration_ms": 1}))
    assert again["status"] == "verified"
    rolled = run(pipeline.rollback(inc["id"]))
    assert rolled["status"] == "rolled_back" and probe_text() == PROBE_SRC


def test_regression_detection_after_verified_fix(probe_file, monkeypatch):
    monkeypatch.setattr(orchestrator, "diagnose", fake_diagnosis(None))
    inc = run(pipeline.ingest(payload("replay will pass")))  # same fingerprint as the verified fix above
    probe_file.append(inc["id"])
    assert inc["regression"] is True and inc["title"].startswith("Regression:")
    run(wait_terminal(inc["id"]))


def test_stale_unverified_patch_is_superseded_and_restored(probe_file, monkeypatch):
    ws = get_workspace()
    (ws.root / PROBE_REL).write_text(PROBE_SRC.replace("hello", "stale"), encoding="utf-8")
    old = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    stale_id = "stalefault01"
    probe_file.append(stale_id)
    run(incidents.insert_one({"id": stale_id, "status": "validating", "created_at": old, "updated_at": old,
                              "checkpoint": {"id": "c1", "created_at": old, "files": [{"path": PROBE_REL, "content": PROBE_SRC}]}}))
    monkeypatch.setattr(orchestrator, "diagnose", fake_diagnosis(None))
    inc = run(pipeline.ingest(payload("trigger supersede")))
    probe_file.append(inc["id"])
    run(wait_terminal(inc["id"]))
    stale = run(incidents.find_one({"id": stale_id}, {"_id": 0}))
    assert stale["status"] == "superseded" and stale["telemetry"]["rollback"] is True
    assert probe_text() == PROBE_SRC


def test_resume_after_restart_finishes_interrupted_validation(probe_file):
    """Simulates the bridge being reloaded by its own backend patch mid-validation."""
    ws = get_workspace()
    patched = PROBE_SRC.replace("hello", "resumed")
    (ws.root / PROBE_REL).write_text(patched, encoding="utf-8")
    rid = "resumefault01"
    probe_file.append(rid)
    now = datetime.now(timezone.utc).isoformat()
    run(incidents.insert_one({"id": rid, "status": "validating", "created_at": now, "updated_at": now, "fingerprint": "resume-fp",
                              "patch": {"files": [{"path": PROBE_REL, "diff": "", "added": 1, "removed": 1, "hunks": []}]},
                              "checkpoint": {"id": "c2", "created_at": now, "files": [{"path": PROBE_REL, "content": PROBE_SRC}]}}))
    run(pipeline.resume_interrupted())
    inc = run(incidents.find_one({"id": rid}, {"_id": 0}))
    assert inc["status"] == "awaiting_replay" and inc["validation"]["status"] == "passed"
    assert probe_text() == patched
    actions = [a["action"] for a in run(audit_log.find({"incident_id": rid}, {"_id": 0}).to_list(20))]
    assert "pipeline.resumed_after_restart" in actions
    (ws.root / PROBE_REL).write_text(PROBE_SRC, encoding="utf-8")
