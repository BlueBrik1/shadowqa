"""Git integration: fix branches built with plumbing (working tree untouched), optional push + GitHub PR."""
import asyncio
import os
import re
import tempfile
from pathlib import Path

import httpx

from .config import settings
from .workspace import Workspace

BRANCH_RE = re.compile(r"^[A-Za-z0-9._/\-]{1,120}$")


class GitError(Exception):
    pass


async def _git(ws: Workspace, *args: str, env: dict | None = None, timeout: int = 60) -> str:
    proc = await asyncio.create_subprocess_exec("git", "-C", str(ws.root), *args, env={**os.environ, **(env or {})},
                                                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise GitError(f"git {args[0]} timed out")
    if proc.returncode != 0:
        msg = err.decode("utf-8", errors="replace")
        msg = re.sub(r"https?://[^\s@]+@", "https://[redacted]@", msg)
        raise GitError(f"git {args[0]} failed: {msg.strip()[:400]}")
    return out.decode("utf-8", errors="replace").strip()


async def status(ws: Workspace) -> dict:
    try:
        branch = await _git(ws, "rev-parse", "--abbrev-ref", "HEAD")
        head = await _git(ws, "rev-parse", "--short", "HEAD")
        porcelain = await _git(ws, "status", "--porcelain")
        dirty = [l[3:] for l in porcelain.splitlines() if l.strip()]
        return {"available": True, "branch": branch, "head": head, "dirty_files": dirty[:50], "dirty_count": len(dirty),
                "github_repo": settings.github_repo or None, "pr_enabled": bool(settings.github_repo and settings.github_token)}
    except (GitError, FileNotFoundError) as exc:
        return {"available": False, "error": str(exc)}


async def create_fix_branch(ws: Workspace, branch: str, rel_paths: list[str], message: str) -> dict:
    """Commit only `rel_paths` (working-tree versions) on a new branch off HEAD using a temporary index."""
    if not BRANCH_RE.match(branch) or ".." in branch:
        raise GitError("invalid branch name")
    for p in rel_paths:
        ws.resolve(p)
    base_branch = await _git(ws, "rev-parse", "--abbrev-ref", "HEAD")
    head = await _git(ws, "rev-parse", "HEAD")
    with tempfile.TemporaryDirectory() as tmp:
        env = {"GIT_INDEX_FILE": str(Path(tmp) / "index")}
        await _git(ws, "read-tree", head, env=env)
        await _git(ws, "add", "--", *rel_paths, env=env)
        tree = await _git(ws, "write-tree", env=env)
    commit = await _git(ws, "commit-tree", tree, "-p", head, "-m", message,
                        env={"GIT_AUTHOR_NAME": "ShadowQA", "GIT_AUTHOR_EMAIL": "shadowqa@local", "GIT_COMMITTER_NAME": "ShadowQA",
                             "GIT_COMMITTER_EMAIL": "shadowqa@local"})
    await _git(ws, "update-ref", f"refs/heads/{branch}", commit)
    stat = await _git(ws, "show", "--stat", "--format=%h %s", commit)
    return {"branch": branch, "commit": commit[:12], "base_branch": base_branch, "stat": stat[:1500]}


async def push_and_open_pr(ws: Workspace, branch: str, base_branch: str, title: str, body: str) -> dict:
    if not (settings.github_repo and settings.github_token):
        raise GitError("GITHUB_REPO / GITHUB_TOKEN not configured")
    if not re.match(r"^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$", settings.github_repo):
        raise GitError("GITHUB_REPO must be owner/repo")
    repo_url = f"https://github.com/{settings.github_repo}.git"
    with tempfile.TemporaryDirectory() as tmp:
        askpass = Path(tmp) / "askpass.sh"
        askpass.write_text('#!/bin/sh\ncase "$1" in\n*Username*) printf "%s" "x-access-token";;\n*) printf "%s" "$SQA_GH_TOKEN";;\nesac\n')
        askpass.chmod(0o700)
        env = {"GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": str(askpass), "SQA_GH_TOKEN": settings.github_token}
        headers = {"Authorization": f"Bearer {settings.github_token}", "Accept": "application/vnd.github+json",
                   "X-GitHub-Api-Version": "2022-11-28"}
        api = f"https://api.github.com/repos/{settings.github_repo}"
        async with httpx.AsyncClient(timeout=30) as client:
            repo_resp = await client.get(api, headers=headers)
            if repo_resp.status_code >= 400:
                raise GitError(f"GitHub repo lookup failed (HTTP {repo_resp.status_code})")
            default_branch = repo_resp.json().get("default_branch") or base_branch
            base = base_branch if base_branch != "HEAD" else default_branch
            base_check = await client.get(f"{api}/branches/{base}", headers=headers)
            if base_check.status_code == 404:
                await _git(ws, "push", repo_url, f"HEAD:refs/heads/{base}", env=env, timeout=180)
            await _git(ws, "push", "--force", repo_url, f"refs/heads/{branch}:refs/heads/{branch}", env=env, timeout=180)
            owner = settings.github_repo.split("/")[0]
            existing = await client.get(f"{api}/pulls", headers=headers, params={"state": "open", "head": f"{owner}:{branch}", "base": base})
            if existing.status_code == 200 and existing.json():
                pr = existing.json()[0]
                return {"url": pr["html_url"], "number": pr["number"], "existing": True, "base": base}
            created = await client.post(f"{api}/pulls", headers=headers, json={"title": title, "body": body, "head": branch, "base": base})
            if created.status_code >= 400:
                raise GitError(f"GitHub PR creation failed (HTTP {created.status_code}): {created.text[:200]}")
            pr = created.json()
            return {"url": pr["html_url"], "number": pr["number"], "existing": False, "base": base}
