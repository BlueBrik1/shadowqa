"""Validation engine: adaptive, allow-listed, targeted checks for the files a patch touched."""
import asyncio
import os
import re
import sys
import time
from pathlib import Path
from typing import Awaitable, Callable

from .workspace import Workspace

VALIDATORS_DIR = Path(__file__).resolve().parent / "validators"
TIMEOUTS = {"syntax": 30, "lint": 60, "unit_tests": 150, "py_compile": 30, "pyflakes": 30}
LABELS = {"syntax": "Syntax (Babel parse)", "lint": "ESLint", "unit_tests": "Unit tests (Jest, related)",
          "py_compile": "Python compile", "pyflakes": "Pyflakes"}


def _command(check: str, ws: Workspace, files: list[str]) -> tuple[list[str], str, dict]:
    fe = ws.frontend_dir
    env = {**os.environ, "CI": "true", "FORCE_COLOR": "0", "NO_COLOR": "1", "BROWSER": "none"}
    if check == "syntax":
        return ["node", str(VALIDATORS_DIR / "check_syntax.js"), str(fe / "node_modules"), *files], str(fe), env
    if check == "lint":
        return ["node", str(fe / "node_modules" / ".bin" / "eslint"), "--no-config-lookup", "-c",
                str(fe / ".shadowqa" / "eslint.config.mjs"), "--max-warnings", "50", *files], str(fe), env
    if check == "unit_tests":
        return ["node", str(fe / "node_modules" / ".bin" / "craco"), "test", "--watchAll=false", "--passWithNoTests",
                "--findRelatedTests", *files], str(fe), env
    if check == "py_compile":
        return [sys.executable, "-m", "py_compile", *files], str(ws.backend_dir), env
    if check == "pyflakes":
        return [sys.executable, "-m", "pyflakes", *files], str(ws.backend_dir), env
    raise ValueError(f"unknown check {check}")


def checks_for(ws: Workspace, rel_paths: list[str]) -> list[tuple[str, list[str]]]:
    js = [str(ws.resolve(p)) for p in rel_paths if p.endswith((".js", ".jsx", ".ts", ".tsx"))]
    py = [str(ws.resolve(p)) for p in rel_paths if p.endswith(".py")]
    plan: list[tuple[str, list[str]]] = []
    if js:
        plan += [("syntax", js), ("lint", js), ("unit_tests", js)]
    if py:
        plan += [("py_compile", py), ("pyflakes", py)]
    return plan


def _summarize(check: str, output: str) -> str:
    if check == "unit_tests":
        m = re.search(r"Tests:\s+(.*)", output)
        if m:
            return m.group(1).strip()
        if "No tests found" in output:
            return "no related tests"
    if check == "lint":
        m = re.search(r"(\d+) problems? \((\d+) errors?, (\d+) warnings?\)", output)
        if m:
            return f"{m.group(2)} errors, {m.group(3)} warnings"
        return "clean"
    if check in ("syntax", "py_compile", "pyflakes"):
        return "clean" if not output.strip() or output.strip().startswith("OK") else output.strip().splitlines()[-1][:160]
    return ""


async def run_validation(ws: Workspace, rel_paths: list[str], on_progress: Callable[[list[dict]], Awaitable[None]]) -> dict:
    steps: list[dict] = [{"id": c, "name": LABELS[c], "status": "pending"} for c, _ in checks_for(ws, rel_paths)]
    started = time.time()
    await on_progress(steps)
    overall = "passed"
    for (check, files), step in zip(checks_for(ws, rel_paths), steps):
        step["status"] = "running"
        await on_progress(steps)
        t0 = time.time()
        argv, cwd, env = _command(check, ws, files)
        try:
            proc = await asyncio.create_subprocess_exec(*argv, cwd=cwd, env=env, stdout=asyncio.subprocess.PIPE,
                                                        stderr=asyncio.subprocess.STDOUT)
            try:
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=TIMEOUTS[check])
            except asyncio.TimeoutError:
                proc.kill()
                step.update(status="failed", output=f"timed out after {TIMEOUTS[check]}s", summary="timeout")
                overall = "failed"
                step["duration_ms"] = int((time.time() - t0) * 1000)
                await on_progress(steps)
                break
            text = out.decode("utf-8", errors="replace")
            text = re.sub(r"\x1b\[[0-9;]*m", "", text)
            step["duration_ms"] = int((time.time() - t0) * 1000)
            step["output"] = text[-4000:]
            step["summary"] = _summarize(check, text)
            if proc.returncode == 0:
                step["status"] = "passed"
            else:
                step["status"] = "failed"
                overall = "failed"
        except FileNotFoundError as exc:
            step.update(status="skipped", summary=f"tool unavailable: {exc.filename}", duration_ms=int((time.time() - t0) * 1000))
        await on_progress(steps)
        if overall == "failed":
            break
    for s in steps:
        if s["status"] == "pending":
            s["status"] = "skipped"
            s["summary"] = "skipped after failure"
    return {"status": overall, "steps": steps, "duration_ms": int((time.time() - started) * 1000)}
