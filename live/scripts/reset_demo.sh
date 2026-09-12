#!/usr/bin/env bash
# Reset the ShadowQA demonstration: restore the intentional bugs, drop ShadowQA state, remove fix branches.
set -euo pipefail
cd "$(dirname "$0")/.."

git checkout -- frontend/src/demo/api/payments.js frontend/src/demo/lib/promo.js frontend/src/demo/api/store.js backend/demo_store/router.py 2>/dev/null || true
# Pristine (buggy) copies are the source of truth — the same files the bridge's /demo/reset uses.
cp scripts/demo_bugs/payments.js frontend/src/demo/api/payments.js
cp scripts/demo_bugs/promo.js frontend/src/demo/lib/promo.js
cp scripts/demo_bugs/store.js frontend/src/demo/api/store.js
cp scripts/demo_bugs/router.py backend/demo_store/router.py
for b in $(git branch --list 'shadowqa/*' | tr -d ' *'); do git branch -D "$b" >/dev/null; done

DB_NAME=$(sed -nE 's/^DB_NAME=//p' backend/.env | tr -d '"')
MONGO_URL=$(sed -nE 's/^MONGO_URL=//p' backend/.env | tr -d '"')
python3 - "$MONGO_URL" "$DB_NAME" <<'EOF'
import sys
from pymongo import MongoClient
client = MongoClient(sys.argv[1])
db = client[sys.argv[2]]
for name in ("sqa_incidents", "sqa_audit", "sqa_memory", "sqa_qa_runs", "sqa_llm_log"):
    db[name].delete_many({})
print("ShadowQA state cleared")
EOF
echo "Demo reset: bugs restored, ShadowQA memory cleared."
