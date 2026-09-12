"""Server observer: unhandled exceptions are joined to the browser-observed 5xx and drive the diagnosis toward the server handler."""
from fastapi import FastAPI
from starlette.testclient import TestClient

from shadowqa import correlation, server_sdk


def _app(root):
    app = FastAPI()

    @app.get("/api/demo/boom")
    async def boom():
        raise TypeError("'ObjectId' object is not iterable")

    app.add_middleware(server_sdk.ServerErrorObserver, root=root)
    return app


def test_observer_records_exception_handler_and_rethrows():
    server_sdk.RECENT.clear()
    root = __import__("pathlib").Path(__file__).resolve().parents[2]
    client = TestClient(_app(root), raise_server_exceptions=False)
    assert client.get("/api/demo/boom").status_code == 500
    entry = server_sdk.match("GET", "/api/demo/boom")
    assert entry and entry["exception"] == "TypeError" and "ObjectId" in entry["message"]
    assert entry["handler"]["function"] == "boom" and entry["handler"]["file"].startswith("backend/tests/")
    assert entry["app_frames"] and entry["app_frames"][-1]["function"] == "boom"
    assert server_sdk.match("POST", "/api/demo/boom") is None
    assert server_sdk.match("GET", "/api/demo/boom", now_ms=entry["ts"] + server_sdk.MATCH_WINDOW_MS + 1) is None


def test_correlation_joins_server_error_to_http_failure():
    t = 1_700_000_000_000
    payload = {
        "app": {"route": "/help"},
        "failure": {"kind": "http_error", "type": "HttpError", "message": "GET /api/demo/support/tickets → HTTP 500", "stack": "", "ts": t + 900},
        "events": [{"id": "e1", "ts": t, "kind": "click", "target": {"tag": "a", "text": "Help", "selector": '[data-testid="nav-help"]'}},
                   {"id": "e2", "ts": t + 10, "kind": "navigation", "from": "/", "to": "/help"}],
        "network": [{"id": "n1", "ts": t + 50, "end_ts": t + 150, "method": "GET", "url": "https://x/api/demo/support/tickets",
                     "path": "/api/demo/support/tickets", "status": 500, "duration_ms": 100, "response_snippet": "Internal Server Error"}],
    }
    server_error = {"ts": t, "method": "GET", "path": "/api/demo/support/tickets", "exception": "ValueError",
                    "message": "[TypeError(\"'ObjectId' object is not iterable\")]",
                    "handler": {"function": "list_support_tickets", "file": "backend/demo_store/router.py", "line": 223}, "app_frames": [], "traceback_tail": ""}
    out = correlation.build(payload, [], server_error_for=lambda m, p: server_error if (m, p) == ("GET", "/api/demo/support/tickets") else None)
    assert out["source_location"] == {"file": "backend/demo_store/router.py", "line": 223, "column": None, "function": "list_support_tickets", "resolved": True, "side": "server"}
    assert out["related_request"]["server_error"] is server_error
    types = [n["type"] for n in out["graph"]["nodes"]]
    assert "server_exception" in types and types.index("server_exception") < types.index("network_response")
    labels = [x["label"] for x in out["timeline"]]
    assert any(l.startswith("Server → ValueError") and "list_support_tickets()" in l for l in labels)
    assert any(l.startswith("Failure → GET /api/demo/support/tickets") for l in labels) and labels[-1] == "Source → backend/demo_store/router.py:223"
    kinds = [s["kind"] for s in out["context_signals"]]
    assert "server" in kinds and any("Failing handler located" in s["label"] for s in out["context_signals"])
    assert out["replay_plan"]["steps"][0] == {"id": "s0", "action": "navigate", "route": "/help", "label": "Open /help", "from": "/"}


def test_correlation_without_server_error_is_unchanged():
    payload = {"app": {"route": "/help"}, "failure": {"kind": "http_error", "type": "HttpError", "message": "GET /x → HTTP 500", "ts": 5},
               "events": [], "network": [{"id": "n1", "ts": 1, "end_ts": 2, "method": "GET", "path": "/x", "status": 500}]}
    out = correlation.build(payload, [], server_error_for=lambda m, p: None)
    assert out["source_location"] is None and out["related_request"]["server_error"] is None
    assert "server_exception" not in [n["type"] for n in out["graph"]["nodes"]]
