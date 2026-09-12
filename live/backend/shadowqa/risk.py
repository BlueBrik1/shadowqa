"""Risk engine: every proposed modification gets a graded, explainable risk assessment."""
import re

SENSITIVE_PATH = [
    (re.compile(r"(auth|login|session|token|password|permission)", re.I), 4, "touches authentication/session code"),
    (re.compile(r"(migration|schema|models?\.py|database|/db/)", re.I), 2, "touches database/schema code"),
    (re.compile(r"(config|settings\.py|package\.json|requirements\.txt|\.env)", re.I), 2, "touches configuration"),
    (re.compile(r"(router|routes|api/)", re.I), 1, "touches an API surface"),
]


def assess(files: list[dict], diagnosis: dict) -> dict:
    score = 0
    factors: list[str] = []
    lines = sum(f.get("added", 0) + f.get("removed", 0) for f in files)
    n_files = len(files)
    if lines <= 4:
        factors.append(f"{lines} line(s) changed")
    elif lines <= 20:
        score += 1
        factors.append(f"{lines} lines changed")
    elif lines <= 60:
        score += 2
        factors.append(f"{lines} lines changed (moderate)")
    else:
        score += 3
        factors.append(f"{lines} lines changed (large)")
    if n_files > 1:
        score += 1
        factors.append(f"{n_files} files affected")
    else:
        factors.append("1 file affected")
    removed = sum(f.get("removed", 0) for f in files)
    if removed > 10:
        score += 1
        factors.append(f"{removed} lines removed")
    seen: set[str] = set()
    for f in files:
        for rx, weight, label in SENSITIVE_PATH:
            if rx.search(f["path"]) and label not in seen:
                score += weight
                factors.append(label)
                seen.add(label)
    joined = "\n".join(f.get("updated", "") for f in files)
    if re.search(r"(import|require\()", "\n".join(l for f in files for l in f.get("diff", "").splitlines() if l.startswith("+"))):
        if re.search(r"^\+\s*(import|const .* = require)", "\n".join(f.get("diff", "") for f in files), re.M):
            score += 1
            factors.append("adds a dependency/import")
    if "process.env" in joined and any("process.env" in l for f in files for l in f.get("diff", "").splitlines() if l.startswith("+")):
        score += 1
        factors.append("touches environment configuration")
    confidence = float(diagnosis.get("confidence") or 0)
    if confidence < 0.7:
        score += 1
        factors.append(f"diagnosis confidence {int(confidence * 100)}% (< 70%)")
    if not diagnosis.get("safe_to_apply", True):
        score += 2
        factors.append("model flagged the change as not safe to auto-apply")
    for note in diagnosis.get("risk_notes") or []:
        if isinstance(note, str) and note.strip():
            factors.append(f"model: {note.strip()[:120]}")
    level = "LOW" if score <= 1 else "MEDIUM" if score <= 3 else "HIGH"
    return {
        "level": level,
        "score": score,
        "files": n_files,
        "lines": lines,
        "database_changes": any("database" in f for f in seen),
        "auth_changes": any("authentication" in f for f in seen),
        "config_changes": any("configuration" in f for f in seen),
        "factors": factors,
        "autonomous_eligible": level == "LOW" and confidence >= 0.8 and diagnosis.get("safe_to_apply", False) is True,
    }
