"""Local Workspace Bridge: authorized, boundary-enforced access to the developer's project."""
import json
import os
import re
from pathlib import Path
from typing import Iterable

from .config import settings


class WorkspaceError(Exception):
    pass


class Workspace:
    def __init__(self, cfg: dict) -> None:
        self.name: str = cfg.get("name", "workspace")
        self.root: Path = Path(cfg["root"]).resolve()
        self.frontend_dir: Path = (self.root / cfg.get("frontend_dir", "frontend")).resolve()
        self.backend_dir: Path = (self.root / cfg.get("backend_dir", "backend")).resolve()
        self.read_roots = [(self.root / p).resolve() for p in cfg.get("read_roots", [])]
        self.write_roots = [(self.root / p).resolve() for p in cfg.get("write_roots", [])]
        self.deny = [(self.root / p).resolve() for p in cfg.get("deny", [])]
        self.limits: dict = cfg.get("limits", {})
        sm = cfg.get("source_map", {})
        self.source_strip_prefixes: list[str] = sm.get("strip_prefixes", ["webpack:///./"])
        self.source_map_to: str = sm.get("map_to", "frontend")
        self.git_cfg: dict = cfg.get("git", {})

    @classmethod
    def load(cls, path: Path | None = None) -> "Workspace":
        p = path or settings.workspace_config_path
        with open(p, "r", encoding="utf-8") as fh:
            return cls(json.load(fh))

    # ---- boundaries -------------------------------------------------------
    def _under(self, path: Path, roots: Iterable[Path]) -> bool:
        return any(path == r or r in path.parents for r in roots)

    def resolve(self, rel: str) -> Path:
        if not rel or rel.startswith("/") or ".." in Path(rel).parts:
            raise WorkspaceError(f"invalid path: {rel}")
        p = (self.root / rel).resolve()
        if self.root not in p.parents and p != self.root:
            raise WorkspaceError(f"path escapes workspace: {rel}")
        if self._under(p, self.deny):
            raise WorkspaceError(f"path is denied: {rel}")
        parts = set(p.parts)
        if "node_modules" in parts or ".git" in parts or p.name.startswith(".env"):
            raise WorkspaceError(f"path is denied: {rel}")
        return p

    def rel(self, path: Path | str) -> str:
        return os.path.relpath(str(Path(path).resolve()), str(self.root))

    def can_read(self, rel: str) -> bool:
        try:
            return self._under(self.resolve(rel), self.read_roots)
        except WorkspaceError:
            return False

    def can_write(self, rel: str) -> bool:
        try:
            return self._under(self.resolve(rel), self.write_roots)
        except WorkspaceError:
            return False

    # ---- file access ------------------------------------------------------
    def read_text(self, rel: str) -> str:
        p = self.resolve(rel)
        if not self._under(p, self.read_roots):
            raise WorkspaceError(f"read not authorized: {rel}")
        if not p.is_file():
            raise WorkspaceError(f"not a file: {rel}")
        limit = int(self.limits.get("max_file_read_bytes", 200000))
        if p.stat().st_size > limit:
            raise WorkspaceError(f"file too large: {rel}")
        return p.read_text(encoding="utf-8")

    def write_text(self, rel: str, content: str) -> None:
        p = self.resolve(rel)
        if not self._under(p, self.write_roots):
            raise WorkspaceError(f"write not authorized: {rel}")
        p.write_text(content, encoding="utf-8")

    def exists(self, rel: str) -> bool:
        try:
            return self.resolve(rel).is_file()
        except WorkspaceError:
            return False

    def kind_of(self, rel: str) -> str:
        p = self.resolve(rel)
        if self.frontend_dir in p.parents:
            return "frontend"
        if self.backend_dir in p.parents:
            return "backend"
        return "other"

    # ---- search -----------------------------------------------------------
    def iter_files(self, exts: tuple[str, ...] = (".js", ".jsx", ".ts", ".tsx", ".py")) -> Iterable[Path]:
        for root in self.read_roots:
            if root.is_file():
                continue
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".git", "__pycache__", "build", "dist")]
                dp = Path(dirpath)
                if self._under(dp, self.deny):
                    dirnames[:] = []
                    continue
                for fn in filenames:
                    if fn.endswith(exts):
                        yield dp / fn

    def grep(self, pattern: str, exts: tuple[str, ...] = (".js", ".jsx", ".py"), max_results: int = 12) -> list[dict]:
        rx = re.compile(pattern)
        hits: list[dict] = []
        for f in self.iter_files(exts):
            try:
                text = f.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for i, line in enumerate(text.splitlines(), start=1):
                if rx.search(line):
                    hits.append({"path": self.rel(f), "line": i, "text": line.strip()[:200]})
                    if len(hits) >= max_results:
                        return hits
        return hits

    def tree(self, max_depth: int = 3) -> list[str]:
        out: list[str] = []
        for root in self.read_roots:
            if root.is_file():
                out.append(self.rel(root))
                continue
            base_depth = len(root.parts)
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = sorted(d for d in dirnames if d not in ("node_modules", ".git", "__pycache__"))
                depth = len(Path(dirpath).parts) - base_depth
                if depth >= max_depth:
                    dirnames[:] = []
                for fn in sorted(filenames):
                    out.append(self.rel(Path(dirpath) / fn))
        return out


_workspace: Workspace | None = None


def get_workspace() -> Workspace:
    global _workspace
    if _workspace is None:
        _workspace = Workspace.load()
    return _workspace
