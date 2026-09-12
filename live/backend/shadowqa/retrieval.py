"""Targeted source retrieval: only the code the context graph points at, never the whole repository."""
import re
from pathlib import Path

from .workspace import Workspace, WorkspaceError

MAX_TOTAL = 42000
MAX_FILE = 14000
WINDOW = 70


def _window(text: str, line: int, radius: int = WINDOW) -> tuple[str, int]:
    lines = text.splitlines()
    start = max(0, line - 1 - radius)
    end = min(len(lines), line - 1 + radius)
    return "\n".join(lines[start:end]), start + 1


def _slice(text: str, line: int | None) -> tuple[str, int, bool]:
    if len(text) <= MAX_FILE:
        return text, 1, True
    body, start = _window(text, line or 1)
    return body[:MAX_FILE], start, False


def _add(files: list[dict], seen: set[str], ws: Workspace, rel: str, reason: str, line: int | None = None) -> None:
    if rel in seen or not ws.can_read(rel):
        return
    try:
        text = ws.read_text(rel)
    except WorkspaceError:
        return
    body, start, whole = _slice(text, line)
    files.append({"path": rel, "reason": reason, "start_line": start, "whole": whole, "content": body})
    seen.add(rel)


def _add_callers(files: list[dict], seen: set[str], ws: Workspace, hit: dict) -> None:
    """The UI that invokes a failing client call (e.g. the page rendering `fetchTickets()`): success selectors live there."""
    m = re.search(r"export\s+(?:const|function|async function)\s+(\w+)", hit.get("text") or "")
    if not m:
        return
    name = m.group(1)
    for caller in ws.grep(rf"\b{re.escape(name)}\(", exts=(".js", ".jsx", ".ts", ".tsx"), max_results=4):
        if caller["path"] != hit["path"] and not caller["path"].endswith(".test.js"):
            _add(files, seen, ws, caller["path"], f"UI calling {name}()", caller["line"])
            break


def _relative_imports(text: str, rel: str, ws: Workspace) -> list[str]:
    out: list[str] = []
    base = Path(rel).parent
    for m in re.finditer(r"""(?:import[^'"]*from\s*|require\()\s*['"](\.{1,2}/[^'"]+)['"]""", text):
        target = (base / m.group(1))
        for suffix in ("", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.jsx"):
            cand = ws.root / (str(target) + suffix)
            if cand.is_file():
                out.append(ws.rel(cand))
                break
    return out


def retrieve(ws: Workspace, incident: dict, extra_paths: list[str] | None = None) -> list[dict]:
    files: list[dict] = []
    seen: set[str] = set()
    loc = incident.get("source_location") or {}
    frames = incident.get("frames") or []

    if loc.get("resolved") and loc.get("file"):
        _add(files, seen, ws, loc["file"], "source location of the runtime exception", loc.get("line"))

    for frame in frames:
        o = frame.get("original")
        if o and not o.get("vendor") and "/shadowqa/" not in o.get("file", ""):
            _add(files, seen, ws, o["file"], f"stack frame {frame.get('function')}", o.get("line"))
        if len(files) >= 3:
            break

    related = incident.get("related_request") or {}
    path = related.get("path") or ""
    if path:
        segments = [s for s in path.strip("/").split("/") if s and s not in ("api",)]
        tail = segments[-1] if segments else ""
        if tail:
            token = re.escape(tail)
            for hit in ws.grep(rf"""(@\w+\.(get|post|put|patch|delete)\(\s*['"][^'"]*{token}|['"`][^'"`]*/{token}['"`])""",
                               exts=(".py", ".js", ".jsx", ".ts", ".tsx"), max_results=6):
                kind = "backend route handler" if hit["path"].endswith(".py") else "client call site"
                _add(files, seen, ws, hit["path"], f"{kind} for {related.get('method')} {path}", hit["line"])
                if kind == "client call site":
                    _add_callers(files, seen, ws, hit)

    component = incident.get("component")
    if component and re.match(r"^[A-Z][A-Za-z0-9_]+$", component):
        for hit in ws.grep(rf"(function\s+{component}\b|const\s+{component}\s*=|class\s+{component}\b)",
                           exts=(".js", ".jsx", ".ts", ".tsx"), max_results=2):
            _add(files, seen, ws, hit["path"], f"React component {component} that rendered the trigger element", hit["line"])

    for extra in extra_paths or []:
        _add(files, seen, ws, extra, "requested by the diagnosis engine")

    # one hop of relative imports from the primary file
    if files:
        primary = files[0]
        for imp in _relative_imports(primary["content"], primary["path"], ws)[:4]:
            if len(files) >= 7:
                break
            _add(files, seen, ws, imp, f"imported by {primary['path']}")

    total = 0
    bounded: list[dict] = []
    for f in files:
        if total + len(f["content"]) > MAX_TOTAL:
            continue
        total += len(f["content"])
        bounded.append(f)
    return bounded
