"""ShadowQA server-side observer: an ASGI middleware that records unhandled exceptions (type, message, failing handler,
application frames) so a 5xx seen in the browser can be joined to the server code that produced it. Observational only."""
import inspect
import time
import traceback
from collections import deque
from pathlib import Path

RECENT: deque = deque(maxlen=50)
MATCH_WINDOW_MS = 90_000


def _handler_location(endpoint, root: Path) -> dict | None:
    if not callable(endpoint):
        return None
    fn = inspect.unwrap(endpoint)
    try:
        file = Path(inspect.getsourcefile(fn) or "").resolve()
        line = inspect.getsourcelines(fn)[1]
        rel = str(file.relative_to(root))
    except (TypeError, OSError, ValueError):
        return None
    return {"function": getattr(fn, "__name__", "handler"), "file": rel, "line": line}


def _app_frames(exc: BaseException, root: Path) -> list[dict]:
    frames: list[dict] = []
    for fr in traceback.extract_tb(exc.__traceback__):
        try:
            rel = str(Path(fr.filename).resolve().relative_to(root))
        except ValueError:
            continue
        if "/shadowqa/" in f"/{rel}":
            continue
        frames.append({"file": rel, "line": fr.lineno, "function": fr.name, "code": (fr.line or "")[:160]})
    return frames[-6:]


def record(scope: dict, exc: BaseException, root: Path) -> dict:
    tail = traceback.format_exception(type(exc), exc, exc.__traceback__)
    entry = {
        "ts": int(time.time() * 1000),
        "method": scope.get("method"),
        "path": scope.get("path"),
        "exception": type(exc).__name__,
        "message": str(exc)[:600],
        "handler": _handler_location(scope.get("endpoint"), root),
        "app_frames": _app_frames(exc, root),
        "traceback_tail": "".join(tail[-6:])[-1800:],
    }
    RECENT.append(entry)
    return entry


def match(method: str | None, path: str | None, now_ms: int | None = None) -> dict | None:
    """Most recent server exception raised while serving the same method + path, within the match window."""
    now = now_ms or int(time.time() * 1000)
    for entry in reversed(RECENT):
        if entry["method"] == method and entry["path"] == path and now - entry["ts"] <= MATCH_WINDOW_MS:
            return entry
    return None


class ServerErrorObserver:
    """Pure ASGI middleware: sits just inside Starlette's ServerErrorMiddleware, sees every unhandled exception, re-raises it."""

    def __init__(self, app, root: str | Path):
        self.app = app
        self.root = Path(root).resolve()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        except Exception as exc:
            record(scope, exc, self.root)
            raise
