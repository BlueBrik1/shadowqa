"""The seam between ShadowQA Live and the ShadowQA service.

Live captures a failure in a running application; the service owns projects, automation modes,
findings, plans and approvals. This module keeps the two in step:

* ``policy()``      — the project's automation mode decides what Live may do on its own.
* ``report()``      — every incident and every state change becomes a *finding* in the service,
                       so ``shadowqa findings`` lists Live incidents beside test regressions.
* ``fetch_action()``— an approval or repair request made in the CLI is picked up by Live.

Everything degrades to local behaviour when the service is not linked: Live still works alone,
it simply has no shared findings list and uses ``SHADOWQA_AUTONOMY``.
"""
import logging
import time

import httpx

from .config import AUTONOMY_LEVELS, MODE_TO_AUTONOMY, settings
from .db import audit

log = logging.getLogger("shadowqa.core_link")
_policy_cache: dict = {"at": 0.0, "value": None}
POLICY_TTL = 20.0


def _headers() -> dict:
    return {"authorization": f"Bearer {settings.core_token}", "content-type": "application/json"}


async def policy() -> dict:
    """Autonomy for the next decision. Cached briefly; falls back to the local setting when unlinked or unreachable."""
    if not settings.core_linked:
        return {"autonomy": settings.autonomy, "mode": None, "source": "local", "paused": False}
    if time.time() - _policy_cache["at"] < POLICY_TTL and _policy_cache["value"]:
        return _policy_cache["value"]
    try:
        async with httpx.AsyncClient(timeout=4) as http:
            response = await http.get(f"{settings.core_url}/live/policy/{settings.core_project}", headers=_headers())
        response.raise_for_status()
        data = response.json()
        mode = data.get("mode")
        value = {
            "autonomy": "observe" if data.get("paused") else MODE_TO_AUTONOMY.get(mode, "approve_all"),
            "mode": mode,
            "paused": bool(data.get("paused")),
            "source": "shadowqa",
            "project": settings.core_project,
        }
    except Exception as exc:  # unreachable service → never escalate autonomy
        log.warning("policy fetch failed: %s", exc)
        value = {"autonomy": "approve_all" if settings.autonomy == "auto_low" else settings.autonomy,
                 "mode": None, "paused": False, "source": "local-fallback"}
    _policy_cache.update(at=time.time(), value=value)
    return value


def may_write(autonomy: str) -> bool:
    return autonomy in AUTONOMY_LEVELS and autonomy != "observe"


def may_auto_apply(autonomy: str) -> bool:
    return autonomy == "auto_low"


def _summary(inc: dict) -> dict:
    loc = inc.get("source_location") or {}
    d = inc.get("diagnosis") or {}
    risk = inc.get("risk") or {}
    patch = inc.get("patch") or {}
    return {
        "incidentId": inc["id"],
        "status": inc.get("status"),
        "title": (inc.get("title") or "Runtime failure")[:120],
        "fingerprint": inc.get("fingerprint"),
        "regression": bool(inc.get("regression")),
        "route": (inc.get("app") or {}).get("route"),
        "failure": {"type": (inc.get("failure") or {}).get("type") or (inc.get("failure") or {}).get("name"),
                    "message": str((inc.get("failure") or {}).get("message") or "")[:400]},
        "location": {"file": loc.get("file"), "line": loc.get("line"), "side": loc.get("side")},
        "chain": [str(n.get("label", ""))[:80] for n in (inc.get("context_graph") or {}).get("nodes", [])][:10] if isinstance(inc.get("context_graph"), dict) else [],
        "rootCause": str(d.get("root_cause") or "")[:400],
        "confidence": d.get("confidence"),
        "risk": risk.get("level"),
        "files": [f.get("path") for f in patch.get("files", [])],
        "lines": risk.get("lines"),
        "verified": inc.get("status") in ("verified", "committed"),
        "telemetry": {k: v for k, v in (inc.get("telemetry") or {}).items() if k in ("total_ms", "ai_ms", "validation_ms", "replay_ms", "rollback")},
        "git": {"branch": (inc.get("git") or {}).get("branch"), "pr": ((inc.get("git") or {}).get("pr") or {}).get("url")},
        "source": inc.get("source", "runtime"),
    }


async def report(inc: dict | None) -> None:
    """Mirror an incident into the service as a finding. Failures are logged, never raised."""
    if not inc or not settings.core_linked:
        return
    try:
        async with httpx.AsyncClient(timeout=6) as http:
            response = await http.post(f"{settings.core_url}/live/projects/{settings.core_project}/incidents",
                                       headers=_headers(), json=_summary(inc))
        response.raise_for_status()
    except Exception as exc:
        log.warning("report to ShadowQA failed for %s: %s", inc.get("id"), exc)
        await audit("core.report_failed", inc.get("id"), actor="system", error=str(exc)[:200])


async def fetch_actions() -> list[dict]:
    """Actions requested in the CLI (`shadowqa live approve|undo|pr <incident>`) waiting for Live."""
    if not settings.core_linked:
        return []
    try:
        async with httpx.AsyncClient(timeout=4) as http:
            response = await http.post(f"{settings.core_url}/live/projects/{settings.core_project}/actions/lease",
                                       headers=_headers(), json={})
        response.raise_for_status()
        return response.json().get("actions", [])
    except Exception as exc:
        log.debug("action lease failed: %s", exc)
        return []


async def health() -> dict:
    if not settings.core_linked:
        return {"linked": False}
    try:
        async with httpx.AsyncClient(timeout=3) as http:
            response = await http.get(f"{settings.core_url}/health")
        return {"linked": True, "reachable": response.status_code == 200, "url": settings.core_url, "project": settings.core_project}
    except Exception:
        return {"linked": True, "reachable": False, "url": settings.core_url, "project": settings.core_project}
