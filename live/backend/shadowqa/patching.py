"""Patch engine: exact search/replace hunks → unified diff. Never blind overwrites."""
import difflib

from .workspace import Workspace, WorkspaceError


def _locate(content: str, search: str) -> tuple[int, int] | None:
    """Find the unique span for `search`. Falls back to whitespace-tolerant line matching."""
    count = content.count(search)
    if count == 1:
        start = content.index(search)
        return start, start + len(search)
    if count > 1:
        return None
    s_lines = [l.strip() for l in search.strip("\n").splitlines()]
    if not s_lines:
        return None
    c_lines = content.splitlines(keepends=True)
    matches: list[tuple[int, int]] = []
    for i in range(len(c_lines) - len(s_lines) + 1):
        if all(c_lines[i + j].strip() == s_lines[j] for j in range(len(s_lines))):
            start = sum(len(l) for l in c_lines[:i])
            end = start + sum(len(l) for l in c_lines[i:i + len(s_lines)])
            matches.append((start, end.__index__() - (1 if c_lines[i + len(s_lines) - 1].endswith("\n") else 0)))
    if len(matches) == 1:
        return matches[0]
    return None


def plan_patch(ws: Workspace, patch: dict) -> tuple[bool, list[dict], str]:
    files_out: list[dict] = []
    max_files = int(ws.limits.get("max_files_per_patch", 3))
    max_lines = int(ws.limits.get("max_changed_lines", 120))
    files = patch.get("files") or []
    if not files:
        return False, [], "patch contains no files"
    if len(files) > max_files:
        return False, [], f"patch touches {len(files)} files; limit is {max_files}"
    total_changed = 0
    for f in files:
        path = f.get("path") or ""
        if not ws.can_write(path):
            return False, [], f"write not authorized for {path}"
        try:
            original = ws.read_text(path)
        except WorkspaceError as exc:
            return False, [], str(exc)
        updated = original
        for h in f.get("hunks") or []:
            search, replace = h.get("search"), h.get("replace")
            if not isinstance(search, str) or not isinstance(replace, str) or not search.strip():
                return False, [], f"malformed hunk in {path}"
            span = _locate(updated, search)
            if span is None:
                n = updated.count(search)
                reason = "matches multiple locations" if n > 1 else "was not found verbatim"
                return False, [], f"in {path}, hunk search text {reason}:\n{search}"
            updated = updated[:span[0]] + replace + updated[span[1]:]
        if updated == original:
            return False, [], f"patch produced no change in {path}"
        diff_lines = list(difflib.unified_diff(original.splitlines(keepends=True), updated.splitlines(keepends=True),
                                               fromfile=f"a/{path}", tofile=f"b/{path}", n=3))
        added = sum(1 for l in diff_lines if l.startswith("+") and not l.startswith("+++"))
        removed = sum(1 for l in diff_lines if l.startswith("-") and not l.startswith("---"))
        total_changed += added + removed
        files_out.append({"path": path, "original": original, "updated": updated, "diff": "".join(diff_lines),
                          "added": added, "removed": removed, "hunks": f.get("hunks")})
    if total_changed > max_lines:
        return False, [], f"patch changes {total_changed} lines; limit is {max_lines}"
    return True, files_out, ""


def apply_files(ws: Workspace, files: list[dict]) -> None:
    for f in files:
        ws.write_text(f["path"], f["updated"])


def restore_files(ws: Workspace, checkpoint_files: list[dict]) -> None:
    for f in checkpoint_files:
        ws.write_text(f["path"], f["content"])
