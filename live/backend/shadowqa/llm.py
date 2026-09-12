"""LLM client with provider fallback and strict JSON extraction.

Live diagnoses with Anthropic (Claude) first and OpenAI (GPT) as the fallback, through the
``emergentintegrations`` chat client. Gemini — the ShadowQA service's planning provider — is an
optional third provider, called directly over HTTPS, used only when a ``GEMINI_API_KEY`` is set.
"""
import json
import re
import time
import uuid

import httpx

from .config import settings
from .db import llm_log, now_iso


class LLMUnavailable(Exception):
    pass


def _providers() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for spec in settings.model_specs():
        if spec and ":" in spec:
            provider, model = spec.split(":", 1)
            if settings.key_for(provider):
                out.append((provider, model))
    return out


def _balanced_objects(text: str) -> list[str]:
    """Top-level {...} spans, scanning with string awareness; longest first."""
    spans: list[str] = []
    depth, start, in_str, esc = 0, -1, False, False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth:
            depth -= 1
            if depth == 0 and start >= 0:
                spans.append(text[start:i + 1])
    return sorted(spans, key=len, reverse=True)


def _loads(candidate: str) -> dict:
    try:
        return json.loads(candidate, strict=False)
    except json.JSONDecodeError:
        return json.loads(re.sub(r",\s*([}\]])", r"\1", candidate), strict=False)


def extract_json(text: str) -> dict:
    """Models reason before answering and fence their JSON; accept prose + fences, take the object that parses."""
    text = text.strip()
    candidates: list[str] = []
    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text)
    candidates.extend(reversed(fenced))  # the final fenced block is the answer
    candidates.append(re.sub(r"^```(?:json)?\s*|\s*```$", "", text))
    candidates.extend(_balanced_objects(text))
    last_error: Exception | None = None
    for cand in candidates:
        cand = cand.strip()
        if not cand.startswith("{"):
            continue
        try:
            data = _loads(cand)
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc
            continue
        if isinstance(data, dict):
            return data
    raise ValueError(f"no JSON object in model response ({last_error})" if last_error else "no JSON object in model response")


REPAIR_NOTE = "Your previous reply could not be parsed as JSON ({error}). Reply again with ONLY the JSON object — no prose, no markdown fences."

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class _GeminiChat:
    """Minimal multi-turn Gemini session; mirrors the send_message() shape used for the other providers."""

    def __init__(self, model: str, system: str, max_tokens: int) -> None:
        self.model = model
        self.system = system
        self.max_tokens = max_tokens
        self.history: list[dict] = []

    async def send_message(self, text: str) -> str:
        self.history.append({"role": "user", "parts": [{"text": text}]})
        body = {
            "systemInstruction": {"parts": [{"text": self.system}]},
            "contents": self.history,
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": self.max_tokens, "responseMimeType": "application/json"},
        }
        async with httpx.AsyncClient(timeout=120) as http:
            response = await http.post(
                GEMINI_ENDPOINT.format(model=self.model),
                params={"key": settings.gemini_key},
                json=body,
            )
        if response.status_code == 429:
            raise LLMUnavailable("Gemini quota exhausted; ShadowQA never enables billing — wait or configure a fallback provider")
        response.raise_for_status()
        data = response.json()
        parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        answer = "".join(p.get("text", "") for p in parts)
        if not answer:
            raise LLMUnavailable(f"Gemini returned no text ({(data.get('promptFeedback') or {}).get('blockReason', 'empty')})")
        self.history.append({"role": "model", "parts": [{"text": answer}]})
        return answer


class _EmergentChat:
    def __init__(self, provider: str, model: str, system: str, max_tokens: int) -> None:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # optional dependency

        self._user = UserMessage
        self.chat = LlmChat(api_key=settings.key_for(provider), session_id=f"sqa-{uuid.uuid4()}", system_message=system)
        params = {"max_tokens": max_tokens}
        if not (provider == "openai" and model.startswith("gpt-5")):
            params["temperature"] = 0.1  # gpt-5 family accepts only the default temperature
        self.chat.with_model(provider, model).with_params(**params)

    async def send_message(self, text: str) -> str:
        return await self.chat.send_message(self._user(text=text))


def _session(provider: str, model: str, system: str, max_tokens: int):
    if provider == "gemini":
        return _GeminiChat(model, system, max_tokens)
    return _EmergentChat(provider, model, system, max_tokens)


async def complete_json(system: str, user: str, purpose: str, incident_id: str | None = None, max_tokens: int = 7000) -> tuple[dict, dict]:
    errors: list[str] = []
    for provider, model in _providers():
        started = time.time()
        try:
            chat = _session(provider, model, system, max_tokens)
            text = await chat.send_message(user)
            repaired = False
            try:
                data = extract_json(text)
            except ValueError as parse_exc:
                # One in-conversation repair round with the same provider before falling back to the next one.
                text = await chat.send_message(REPAIR_NOTE.format(error=str(parse_exc)[:120]))
                data = extract_json(text)
                repaired = True
            meta = {"provider": provider, "model": model, "latency_ms": int((time.time() - started) * 1000),
                    "prompt_chars": len(system) + len(user), "response_chars": len(text), "fallback_used": bool(errors), "repaired": repaired}
            await llm_log.insert_one({"ts": now_iso(), "incident_id": incident_id, "purpose": purpose, **meta, "ok": True})
            return data, meta
        except Exception as exc:  # provider failure → try the next one
            msg = f"{provider}:{model} → {type(exc).__name__}: {str(exc)[:300]}"
            errors.append(msg)
            await llm_log.insert_one({"ts": now_iso(), "incident_id": incident_id, "purpose": purpose, "provider": provider,
                                      "model": model, "ok": False, "error": msg,
                                      "latency_ms": int((time.time() - started) * 1000)})
    raise LLMUnavailable("; ".join(errors) or "no LLM provider configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)")
