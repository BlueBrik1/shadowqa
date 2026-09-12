from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]

incidents = db.sqa_incidents
audit_log = db.sqa_audit
memory_col = db.sqa_memory
qa_runs = db.sqa_qa_runs
llm_log = db.sqa_llm_log


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


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
