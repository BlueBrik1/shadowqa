"""Store for incidents, audit, memory, QA runs and model calls.

ShadowQA Live runs on a developer machine next to the ShadowQA CLI. It therefore needs no
database server by default: when ``MONGO_URL`` is unset the collections below are backed by
JSON files under ``SHADOWQA_LIVE_DATA`` (default ``.shadowqa/live`` inside the workspace), using
the small subset of the MongoDB query surface this package actually uses. Set ``MONGO_URL`` and
``DB_NAME`` to use MongoDB instead; the calling code is identical either way.
"""
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import settings


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


# --------------------------------------------------------------------------------------------
# Local JSON-backed collection: the few Mongo operators the pipeline relies on, nothing more.
# --------------------------------------------------------------------------------------------

def _get_path(doc: dict, dotted: str) -> Any:
    cur: Any = doc
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _set_path(doc: dict, dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    cur = doc
    for part in parts[:-1]:
        nxt = cur.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[part] = nxt
        cur = nxt
    cur[parts[-1]] = value


def _matches(doc: dict, flt: dict | None) -> bool:
    for key, cond in (flt or {}).items():
        value = _get_path(doc, key)
        if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
            for op, arg in cond.items():
                if op == "$in" and value not in arg:
                    return False
                if op == "$nin" and value in arg:
                    return False
                if op == "$lt" and not (value is not None and value < arg):
                    return False
                if op == "$lte" and not (value is not None and value <= arg):
                    return False
                if op == "$gt" and not (value is not None and value > arg):
                    return False
                if op == "$gte" and not (value is not None and value >= arg):
                    return False
                if op == "$ne" and value == arg:
                    return False
                if op == "$exists" and (value is not None) != bool(arg):
                    return False
        elif value != cond:
            return False
    return True


def _project(doc: dict, projection: dict | None) -> dict:
    if not projection:
        out = dict(doc)
        out.pop("_id", None)
        return out
    include = [k for k, v in projection.items() if v and k != "_id"]
    if include:
        out: dict = {}
        for key in include:
            value = _get_path(doc, key)
            if value is not None:
                _set_path(out, key, value)
        if projection.get("_id", 0) and "_id" in doc:
            out["_id"] = doc["_id"]
        return out
    out = json.loads(json.dumps(doc))
    for key, keep in projection.items():
        if not keep:
            out.pop(key, None)
    return out


class _Cursor:
    def __init__(self, docs: list[dict]) -> None:
        self._docs = docs

    def sort(self, key: str | list, direction: int = 1) -> "_Cursor":
        if isinstance(key, list):
            for k, d in reversed(key):
                self._docs.sort(key=lambda x, kk=k: (_get_path(x, kk) is None, _get_path(x, kk) or ""), reverse=d < 0)
        else:
            self._docs.sort(key=lambda x: (_get_path(x, key) is None, _get_path(x, key) or ""), reverse=direction < 0)
        return self

    async def to_list(self, length: int | None = None) -> list[dict]:
        return self._docs[:length] if length else list(self._docs)


class _InsertResult:
    def __init__(self, inserted_id: str) -> None:
        self.inserted_id = inserted_id


class LocalCollection:
    """One JSON file per collection. Writes are serialised; reads return deep copies."""

    def __init__(self, directory: Path, name: str) -> None:
        self.path = directory / f"{name}.json"
        self._lock = asyncio.Lock()
        self._docs: list[dict] | None = None

    def _load(self) -> list[dict]:
        if self._docs is None:
            try:
                self._docs = json.loads(self.path.read_text("utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                self._docs = []
        return self._docs

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._docs, ensure_ascii=False), "utf-8")
        os.replace(tmp, self.path)

    def find(self, flt: dict | None = None, projection: dict | None = None) -> _Cursor:
        docs = [_project(d, projection) for d in self._load() if _matches(d, flt)]
        return _Cursor(json.loads(json.dumps(docs)))

    async def find_one(self, flt: dict | None = None, projection: dict | None = None, sort: list | None = None) -> dict | None:
        cursor = self.find(flt, projection)
        if sort:
            cursor.sort(sort)
        docs = await cursor.to_list(1)
        return docs[0] if docs else None

    async def insert_one(self, doc: dict) -> _InsertResult:
        async with self._lock:
            copy = json.loads(json.dumps(doc, default=str))
            copy.setdefault("_id", f"{now_ms():x}{len(self._load()):x}")
            self._load().append(copy)
            self._flush()
            return _InsertResult(copy["_id"])

    async def update_one(self, flt: dict, update: dict) -> None:
        async with self._lock:
            for doc in self._load():
                if _matches(doc, flt):
                    for key, value in (update.get("$set") or {}).items():
                        _set_path(doc, key, json.loads(json.dumps(value, default=str)))
                    for key in (update.get("$unset") or {}):
                        doc.pop(key, None)
                    break
            self._flush()

    async def replace_one(self, flt: dict, doc: dict, upsert: bool = False) -> None:
        async with self._lock:
            docs = self._load()
            copy = json.loads(json.dumps(doc, default=str))
            for i, existing in enumerate(docs):
                if _matches(existing, flt):
                    copy["_id"] = existing.get("_id")
                    docs[i] = copy
                    self._flush()
                    return
            if upsert:
                copy.setdefault("_id", f"{now_ms():x}{len(docs):x}")
                docs.append(copy)
                self._flush()

    async def delete_many(self, flt: dict) -> None:
        async with self._lock:
            self._docs = [d for d in self._load() if not _matches(d, flt)]
            self._flush()

    async def count_documents(self, flt: dict | None = None) -> int:
        return sum(1 for d in self._load() if _matches(d, flt))


class _LocalClient:
    def close(self) -> None:  # parity with AsyncIOMotorClient
        pass


# --------------------------------------------------------------------------------------------
# Wiring: MongoDB when configured, local files otherwise.
# --------------------------------------------------------------------------------------------

if settings.mongo_url:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(settings.mongo_url)
    _db = client[settings.db_name]
    incidents = _db.sqa_incidents
    audit_log = _db.sqa_audit
    memory_col = _db.sqa_memory
    qa_runs = _db.sqa_qa_runs
    llm_log = _db.sqa_llm_log
    STORE = f"mongodb:{settings.db_name}"
else:
    client = _LocalClient()
    _dir = Path(settings.live_data_dir)
    incidents = LocalCollection(_dir, "incidents")
    audit_log = LocalCollection(_dir, "audit")
    memory_col = LocalCollection(_dir, "memory")
    qa_runs = LocalCollection(_dir, "qa_runs")
    llm_log = LocalCollection(_dir, "llm_log")
    STORE = f"local:{_dir}"


async def audit(action: str, incident_id: str | None = None, actor: str = "system", **details) -> None:
    await audit_log.insert_one({
        "ts": now_iso(),
        "action": action,
        "incident_id": incident_id,
        "actor": actor,
        "details": details,
    })


async def get_incident(incident_id: str) -> dict | None:
    return await incidents.find_one({"id": incident_id}, {"_id": 0})


async def update_incident(incident_id: str, fields: dict) -> None:
    fields["updated_at"] = now_iso()
    await incidents.update_one({"id": incident_id}, {"$set": fields})
