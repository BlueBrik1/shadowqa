"""Source map resolution: bundle.js:line:col → original source file:line. Handles missing maps gracefully."""
import re
import time
from urllib.parse import urlparse

import httpx

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
B64_INDEX = {c: i for i, c in enumerate(B64)}


def decode_vlq(segment: str) -> list[int]:
    values: list[int] = []
    shift = 0
    value = 0
    for ch in segment:
        digit = B64_INDEX[ch]
        cont = digit & 32
        value += (digit & 31) << shift
        if cont:
            shift += 5
            continue
        negative = value & 1
        value >>= 1
        values.append(-value if negative else value)
        value = 0
        shift = 0
    return values


class SourceMap:
    def __init__(self, raw: dict) -> None:
        self.sources: list[str] = raw.get("sources", [])
        self.names: list[str] = raw.get("names", [])
        self._mappings_raw: str = raw.get("mappings", "")
        self._lines: dict[int, list[tuple[int, int, int, int]]] | None = None

    def _parse(self) -> None:
        lines: dict[int, list[tuple[int, int, int, int]]] = {}
        src = orig_line = orig_col = 0
        for line_no, line in enumerate(self._mappings_raw.split(";")):
            if not line:
                continue
            gen_col = 0
            segs: list[tuple[int, int, int, int]] = []
            for seg in line.split(","):
                if not seg:
                    continue
                fields = decode_vlq(seg)
                gen_col += fields[0]
                if len(fields) >= 4:
                    src += fields[1]
                    orig_line += fields[2]
                    orig_col += fields[3]
                    segs.append((gen_col, src, orig_line, orig_col))
            if segs:
                lines[line_no] = segs
        self._lines = lines

    def lookup(self, line: int, col: int) -> dict | None:
        """line/col are 1-based (as in stack traces)."""
        if self._lines is None:
            self._parse()
        segs = self._lines.get(line - 1) if self._lines else None
        if not segs:
            return None
        best = segs[0]
        for seg in segs:
            if seg[0] <= col - 1:
                best = seg
            else:
                break
        _, src_idx, o_line, o_col = best
        if src_idx >= len(self.sources):
            return None
        return {"source": self.sources[src_idx], "line": o_line + 1, "column": o_col + 1}


class SourceMapResolver:
    def __init__(self, ttl_seconds: float = 8.0) -> None:
        self._cache: dict[str, tuple[float, SourceMap | None]] = {}
        self.ttl = ttl_seconds

    async def _load(self, map_url: str) -> SourceMap | None:
        cached = self._cache.get(map_url)
        if cached and time.time() - cached[0] < self.ttl:
            return cached[1]
        smap: SourceMap | None = None
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(map_url)
                if resp.status_code == 200:
                    smap = SourceMap(resp.json())
        except Exception:
            smap = None
        self._cache[map_url] = (time.time(), smap)
        return smap

    @staticmethod
    def normalize_source(source: str, strip_prefixes: list[str], map_to: str, root: str = "") -> tuple[str, bool]:
        """Return (workspace-relative path, is_vendor). Handles webpack:// URIs, ./relative and absolute sources."""
        vendor = "node_modules" in source or source.startswith("webpack/") or "webpack/runtime" in source
        path = source
        for prefix in strip_prefixes:
            if path.startswith(prefix):
                path = path[len(prefix):]
                break
        path = re.sub(r"^webpack://[^/]*/", "", path)
        path = path.split("?")[0]
        root = (root or "").rstrip("/")
        if path.startswith("/"):
            if root and (path == root or path.startswith(root + "/")):
                path = path[len(root):]
            path = path.lstrip("/")
        else:
            path = re.sub(r"^(\./)+", "", path)
            root_name = root.rsplit("/", 1)[-1] if root else ""
            if root_name and path.startswith(root_name + "/"):
                path = path[len(root_name) + 1:]
            elif map_to and not path.startswith(map_to + "/"):
                path = f"{map_to}/{path}"
        return path, vendor

    async def resolve_frames(self, frames: list[dict], dev_server_url: str, strip_prefixes: list[str], map_to: str, root: str = "") -> list[dict]:
        out: list[dict] = []
        for frame in frames:
            resolved = dict(frame)
            url = frame.get("url") or ""
            line, col = frame.get("line"), frame.get("column")
            if url and line:
                parsed = urlparse(url)
                map_url = f"{dev_server_url}{parsed.path}.map"
                smap = await self._load(map_url)
                if smap:
                    hit = smap.lookup(int(line), int(col or 1))
                    if hit:
                        path, vendor = self.normalize_source(hit["source"], strip_prefixes, map_to, root)
                        resolved["original"] = {"file": path, "line": hit["line"], "column": hit["column"], "vendor": vendor,
                                                "raw_source": hit["source"]}
                        resolved["resolved"] = True
                if "resolved" not in resolved:
                    resolved["resolved"] = False
                    resolved["resolve_error"] = "source map unavailable" if not smap else "no mapping for position"
            out.append(resolved)
        return out


STACK_RE_V8 = re.compile(r"^\s*at\s+(?:(.+?)\s+\()?((?:https?|file|webpack[-\w]*):[^\s)]+?):(\d+):(\d+)\)?\s*$")
STACK_RE_GECKO = re.compile(r"^\s*(?:([^@\s]*)@)?((?:https?|file):[^\s)]+?):(\d+):(\d+)\s*$")


def parse_stack(stack: str | None) -> list[dict]:
    frames: list[dict] = []
    if not stack:
        return frames
    for raw in stack.splitlines():
        m = STACK_RE_V8.match(raw) or STACK_RE_GECKO.match(raw)
        if not m:
            continue
        fn, url, line, col = m.groups()
        frames.append({"function": (fn or "").strip() or "<anonymous>", "url": url, "line": int(line), "column": int(col)})
        if len(frames) >= 25:
            break
    return frames


resolver = SourceMapResolver()
