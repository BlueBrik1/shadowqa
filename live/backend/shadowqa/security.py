"""Secret redaction, payload sanitization and prompt-injection boundaries."""
import re
from typing import Any

SENSITIVE_KEY_RE = re.compile(
    r"(authorization|cookie|set-cookie|x-api-key|api[-_]?key|secret|passw(or)?d|token|session|credential|"
    r"^cvc$|^cvv$|^exp(iry)?$|^card(_?number)?$|^number$|^pan$|ssn|private)", re.I)

SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_\-]{12,}"), "[REDACTED_KEY]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{10,}"), "[REDACTED_TOKEN]"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), "[REDACTED_TOKEN]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"), "[REDACTED_JWT]"),
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{12,}"), "Bearer [REDACTED]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[REDACTED_CARD]"),
    (re.compile(r"(?i)(password|passwd|secret|api_key|apikey)\s*[=:]\s*[^\s,;&]+"), r"\1=[REDACTED]"),
]

MAX_STRING = 2000


def redact_text(text: str, max_len: int = MAX_STRING) -> str:
    if not isinstance(text, str):
        return text
    for pattern, repl in SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    if len(text) > max_len:
        text = text[:max_len] + f"…[truncated {len(text) - max_len} chars]"
    return text


def sanitize(value: Any, depth: int = 0, max_len: int = MAX_STRING) -> Any:
    """Recursively redact sensitive keys and secret-looking strings. Bounded depth/size."""
    if depth > 8:
        return "[depth-limit]"
    if isinstance(value, dict):
        out = {}
        for k, v in list(value.items())[:60]:
            key = str(k)
            if SENSITIVE_KEY_RE.search(key):
                out[key] = "[REDACTED]"
            else:
                out[key] = sanitize(v, depth + 1, max_len)
        return out
    if isinstance(value, list):
        return [sanitize(v, depth + 1, max_len) for v in value[:60]]
    if isinstance(value, str):
        return redact_text(value, max_len)
    return value


def wrap_untrusted(label: str, text: str) -> str:
    """Delimit application-originated content so the model treats it as data, never as instructions."""
    safe = (text or "").replace("</untrusted>", "</untrusted\u200b>")
    return f'<untrusted source="{label}">\n{safe}\n</untrusted>'


def strip_control_chars(text: str) -> str:
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text or "")
