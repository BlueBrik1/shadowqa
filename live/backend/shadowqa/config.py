"""Settings for ShadowQA Live.

Live is the runtime half of ShadowQA: it watches an application while it runs and turns a
failing click into a verified fix. It shares one Gemini key, one automation vocabulary and one
findings list with the ShadowQA service (``shadowqa serve``) so the two read as one product.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
LIVE_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")
# The repository root `.env` (written by `shadowqa setup`) is a fallback, so ANTHROPIC_API_KEY /
# OPENAI_API_KEY and the service link can be kept in one place with the rest of ShadowQA's settings.
load_dotenv(LIVE_DIR.parent / ".env")

# ShadowQA automation modes (src/core/contracts.ts) → what Live may do on its own.
#   observe    capture, correlate, diagnose; never write
#   approval   propose a patch, wait for a person
#   auto-fix   apply LOW-risk patches automatically, still verify by replay
#   full-auto  same restricted automatic scope; merge policy lives in the service
MODE_TO_AUTONOMY = {
    "observe": "observe",
    "approval": "approve_all",
    "auto-fix": "auto_low",
    "full-auto": "auto_low",
}
AUTONOMY_LEVELS = ("observe", "approve_all", "auto_low")


class Settings:
    def __init__(self) -> None:
        self.mongo_url = os.environ.get("MONGO_URL", "")
        self.db_name = os.environ.get("DB_NAME", "shadowqa_live")
        self.bridge_token = os.environ.get("SHADOWQA_BRIDGE_TOKEN", "")
        default_workspace = os.environ.get("SHADOWQA_WORKSPACE_CONFIG") or str(LIVE_DIR / "shadowqa.workspace.json")
        self.workspace_config_path = Path(default_workspace)
        self.live_data_dir = os.environ.get("SHADOWQA_LIVE_DATA") or str(LIVE_DIR / ".shadowqa" / "live")
        self.dev_server_url = os.environ.get("SHADOWQA_DEV_SERVER_URL", "http://localhost:3000").rstrip("/")
        # Live diagnoses with Anthropic first and OpenAI as the fallback. Planning in the ShadowQA
        # service stays on Gemini; a GEMINI_API_KEY here only adds a third, last-resort provider.
        self.primary_model = os.environ.get("SHADOWQA_PRIMARY_MODEL", "anthropic:claude-sonnet-4-6")
        self.fallback_model = os.environ.get("SHADOWQA_FALLBACK_MODEL", "openai:gpt-5.4")
        self.extra_model = os.environ.get("SHADOWQA_EXTRA_MODEL", "gemini:" + os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self.openai_key = os.environ.get("OPENAI_API_KEY", "")
        self.emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")
        self.github_token = os.environ.get("GITHUB_TOKEN", "")
        self.github_repo = os.environ.get("GITHUB_REPO", "").strip()
        # Local autonomy used only when no ShadowQA service is linked. observe | approve_all | auto_low
        self.autonomy = os.environ.get("SHADOWQA_AUTONOMY", "approve_all")
        # Link to the ShadowQA service: incidents become findings there and its project mode governs Live.
        self.core_url = os.environ.get("SHADOWQA_URL", "").rstrip("/")
        self.core_token = os.environ.get("SHADOWQA_TOKEN", "")
        self.core_project = os.environ.get("SHADOWQA_PROJECT", "")

    @property
    def core_linked(self) -> bool:
        return bool(self.core_url and self.core_token and self.core_project)

    def key_for(self, provider: str) -> str:
        if provider == "gemini":
            return self.gemini_key
        if provider == "anthropic" and self.anthropic_key:
            return self.anthropic_key
        if provider == "openai" and self.openai_key:
            return self.openai_key
        return self.emergent_key

    def model_specs(self) -> list[str]:
        """Provider order: Anthropic → OpenAI → (optional) Gemini."""
        return [s for s in (self.primary_model, self.fallback_model, self.extra_model) if s]


settings = Settings()
