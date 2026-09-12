"""ShadowQA Live bridge.

The FastAPI process that the browser SDK talks to. It observes a running application, correlates
failures, diagnoses them, applies and validates a patch, and asks the browser to replay the
original interaction. When linked to the ShadowQA service every incident is also a finding there
and the project's automation mode governs what Live may do on its own.

The Lumen Supply Co. demo store is mounted only when ``SHADOWQA_DEMO=1`` (the default for the
repository's own workspace) so the same process can watch any application.
"""
import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from shadowqa import pipeline as shadowqa_pipeline  # noqa: E402
from shadowqa.api import router as shadowqa_router  # noqa: E402
from shadowqa.config import settings  # noqa: E402
from shadowqa.db import STORE, client as shadowqa_client  # noqa: E402
from shadowqa.server_sdk import ServerErrorObserver  # noqa: E402
from shadowqa.workspace import get_workspace  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

DEMO = os.environ.get("SHADOWQA_DEMO", "1") == "1"

app = FastAPI(title="ShadowQA Live" + (" + Lumen Supply Co. demo API" if DEMO else ""))


@app.get("/api/")
async def root():
    return {"service": "shadowqa-live", "demo": "lumen-supply-co" if DEMO else None, "store": STORE,
            "linked": settings.core_linked, "ok": True}


SDK_BUNDLE = ROOT_DIR.parent / "extension" / "shadowqa.js"


@app.get("/shadowqa.js", include_in_schema=False)
async def sdk_bundle():
    """The browser SDK, so `shadowqa live snippet` needs nothing but this process."""
    return FileResponse(SDK_BUNDLE, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


if DEMO:
    from demo_store.router import router as demo_router  # noqa: E402

    app.include_router(demo_router)
app.include_router(shadowqa_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
# ShadowQA server observer: joins a 5xx seen in the browser to the exception + handler that produced it.
app.add_middleware(ServerErrorObserver, root=get_workspace().root)


@app.on_event("startup")
async def resume_shadowqa_pipeline():
    logger.info("ShadowQA Live · store=%s · linked=%s · workspace=%s", STORE, settings.core_linked, get_workspace().root)
    # A ShadowQA patch to backend code reloads this server; pick up any validation it interrupted.
    asyncio.create_task(shadowqa_pipeline.resume_interrupted())
    # Approvals and undo requests made in the ShadowQA CLI arrive through the service.
    asyncio.create_task(shadowqa_pipeline.core_action_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    shadowqa_client.close()
