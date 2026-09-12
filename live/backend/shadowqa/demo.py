"""Demo controls: restore the intentional Lumen Supply Co. bugs and clear ShadowQA state (token-gated, allow-listed files only)."""
import shutil

from . import git_ops
from .db import audit, audit_log, incidents, llm_log, memory_col, qa_runs
from .workspace import Workspace, WorkspaceError

# pristine (buggy) copy → target inside a write root
DEMO_BUG_FILES = {
    "scripts/demo_bugs/payments.js": "frontend/src/demo/api/payments.js",
    "scripts/demo_bugs/promo.js": "frontend/src/demo/lib/promo.js",
    "scripts/demo_bugs/store.js": "frontend/src/demo/api/store.js",
    "scripts/demo_bugs/router.py": "backend/demo_store/router.py",
}

SCENARIOS = [
    {"id": "checkout", "title": "Checkout → Pay", "file": "frontend/src/demo/api/payments.js",
     "symptom": "POST /api/demo/payment → 422, TypeError in Checkout.jsx", "cause": "client sends `total`, gateway contract requires `amount`"},
    {"id": "promo", "title": "Cart → promo code lumen20", "file": "frontend/src/demo/lib/promo.js",
     "symptom": "TypeError reading 'rate' in promo.js", "cause": "case-sensitive lookup of a case-insensitive code"},
    {"id": "tracking", "title": "Order detail → Track shipment", "file": "frontend/src/demo/api/store.js",
     "symptom": "GET …/tracking → 200, TypeError reading 'events' in OrderDetail.jsx", "cause": "client unwraps `d.tracking` from a response that is no longer wrapped"},
    {"id": "tickets", "title": "Help → Your tickets (backend)", "file": "backend/demo_store/router.py",
     "symptom": "GET /api/demo/support/tickets → 500, no JS exception (UI degrades gracefully)", "cause": "handler returns raw Mongo documents — ObjectId is not JSON-serialisable"},
]


def bug_state(ws: Workspace) -> list[dict]:
    """Which intentional bugs are currently present in the workspace (pristine copy == working copy)."""
    out = []
    for src, dst in DEMO_BUG_FILES.items():
        pristine_path = ws.root / src
        scenario = next(s for s in SCENARIOS if s["file"] == dst)
        try:
            present = pristine_path.read_text(encoding="utf-8") == ws.read_text(dst)
        except (OSError, WorkspaceError):
            present = None
        out.append({**scenario, "bug_present": present})
    return out


async def reset(ws: Workspace, actor: str = "developer") -> dict:
    restored: list[str] = []
    for src, dst in DEMO_BUG_FILES.items():
        target = ws.resolve(dst)
        if not ws.can_write(dst):
            continue
        shutil.copyfile(ws.root / src, target)
        restored.append(dst)
    branches = []
    try:
        listing = await git_ops._git(ws, "for-each-ref", "--format=%(refname:short)", "refs/heads/shadowqa/")
        for b in [l.strip() for l in listing.splitlines() if l.strip()]:
            await git_ops._git(ws, "branch", "-D", b)
            branches.append(b)
    except git_ops.GitError:
        pass
    for col in (incidents, audit_log, memory_col, qa_runs, llm_log):
        await col.delete_many({})
    await audit("demo.reset", actor=actor, restored=restored, branches=branches)
    return {"restored": restored, "branches_deleted": branches, "scenarios": bug_state(ws)}
