import json
from pathlib import Path

import pytest

from shadowqa.patching import plan_patch
from shadowqa.risk import assess
from shadowqa.workspace import Workspace, WorkspaceError


@pytest.fixture
def ws(tmp_path: Path) -> Workspace:
    (tmp_path / "frontend" / "src" / "demo").mkdir(parents=True)
    (tmp_path / "frontend" / "src" / "shadowqa").mkdir(parents=True)
    (tmp_path / "frontend" / "src" / "demo" / "pay.js").write_text("export function pay(order) {\n  return post({ total: order.total });\n}\n")
    (tmp_path / "frontend" / "src" / "shadowqa" / "core.js").write_text("// agent\n")
    (tmp_path / "frontend" / ".env").write_text("SECRET=1\n")
    cfg = {"name": "t", "root": str(tmp_path), "read_roots": ["frontend/src"], "write_roots": ["frontend/src/demo"],
           "deny": ["frontend/src/shadowqa"], "limits": {"max_files_per_patch": 2, "max_changed_lines": 10}}
    (tmp_path / "ws.json").write_text(json.dumps(cfg))
    return Workspace.load(tmp_path / "ws.json")


def test_boundaries(ws: Workspace):
    assert ws.can_read("frontend/src/demo/pay.js")
    assert ws.can_write("frontend/src/demo/pay.js")
    assert not ws.can_write("frontend/src/shadowqa/core.js")
    assert not ws.can_read("frontend/src/shadowqa/core.js")
    assert not ws.can_read("frontend/.env")
    with pytest.raises(WorkspaceError):
        ws.resolve("../etc/passwd")
    with pytest.raises(WorkspaceError):
        ws.resolve("/etc/passwd")
    with pytest.raises(WorkspaceError):
        ws.resolve("frontend/node_modules/x.js")


def test_plan_patch_exact_hunk_produces_minimal_diff(ws: Workspace):
    ok, files, err = plan_patch(ws, {"files": [{"path": "frontend/src/demo/pay.js", "hunks": [{"search": "{ total: order.total }", "replace": "{ amount: order.total }"}]}]})
    assert ok, err
    assert files[0]["added"] == 1 and files[0]["removed"] == 1
    assert "+  return post({ amount: order.total });" in files[0]["diff"]
    assert (ws.root / "frontend/src/demo/pay.js").read_text().count("total:") == 1  # planning never writes


def test_plan_patch_rejects_ambiguous_missing_and_unauthorized(ws: Workspace):
    ok, _, err = plan_patch(ws, {"files": [{"path": "frontend/src/demo/pay.js", "hunks": [{"search": "nope", "replace": "x"}]}]})
    assert not ok and "not found" in err
    ok, _, err = plan_patch(ws, {"files": [{"path": "frontend/src/demo/pay.js", "hunks": [{"search": "o", "replace": "x"}]}]})
    assert not ok and "multiple" in err
    ok, _, err = plan_patch(ws, {"files": [{"path": "frontend/src/shadowqa/core.js", "hunks": [{"search": "// agent", "replace": "// pwned"}]}]})
    assert not ok and "not authorized" in err


def test_plan_patch_whitespace_tolerant_fallback(ws: Workspace):
    ok, files, err = plan_patch(ws, {"files": [{"path": "frontend/src/demo/pay.js", "hunks": [{"search": "return post({ total: order.total });", "replace": "  return post({ amount: order.total });"}]}]})
    assert ok, err
    assert "amount" in files[0]["updated"]


def test_plan_patch_enforces_limits(ws: Workspace):
    big = "\n".join(f"line{i}" for i in range(30))
    ok, _, err = plan_patch(ws, {"files": [{"path": "frontend/src/demo/pay.js", "hunks": [{"search": "export function pay(order) {", "replace": big}]}]})
    assert not ok and "limit" in err


def test_risk_levels():
    diag = {"confidence": 0.95, "safe_to_apply": True, "risk_notes": []}
    low = assess([{"path": "frontend/src/demo/lib/promo.js", "added": 1, "removed": 1, "diff": "", "updated": ""}], diag)
    assert low["level"] == "LOW" and low["autonomous_eligible"]
    auth = assess([{"path": "backend/auth/session.py", "added": 3, "removed": 1, "diff": "", "updated": ""}], diag)
    assert auth["level"] == "HIGH" and not auth["autonomous_eligible"]
    shaky = assess([{"path": "frontend/src/demo/x.js", "added": 30, "removed": 12, "diff": "", "updated": ""},
                    {"path": "frontend/src/demo/y.js", "added": 2, "removed": 0, "diff": "", "updated": ""}], {**diag, "confidence": 0.6})
    assert shaky["level"] in ("MEDIUM", "HIGH") and not shaky["autonomous_eligible"]
