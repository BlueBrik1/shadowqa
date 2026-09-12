"""Backend integration tests for ShadowQA bridge + demo store API.

Covers:
 - ShadowQA health/auth
 - Demo store: auth/login, products, dashboard, payment (bug + happy), settings
 - ShadowQA incidents lifecycle (create, get, list, dismiss, memory/flows/audit/telemetry)
 - Workspace file safety (allow-list + traversal + secret protection)
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://context-bridge-18.preview.emergentagent.com").rstrip("/")
TOKEN = "sqa_bridge_7f3c9a1e4b2d"
SQA = f"{BASE}/api/shadowqa"
DEMO = f"{BASE}/api/demo"
H = {"X-ShadowQA-Token": TOKEN}


# ---------- ShadowQA bridge ----------
class TestShadowqaHealth:
    def test_health_requires_token(self):
        r = requests.get(f"{SQA}/health", timeout=15)
        assert r.status_code == 401

    def test_health_with_token(self):
        r = requests.get(f"{SQA}/health", headers=H, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        assert j.get("autonomy") == "auto_low"
        assert "workspace" in j
        assert j.get("git", {}).get("available") is True


# ---------- Demo store ----------
class TestDemoStore:
    @pytest.fixture(scope="class")
    def token(self):
        r = requests.post(f"{DEMO}/auth/login",
                          json={"email": "demo@lumen.supply", "password": "lumen-demo"}, timeout=15)
        assert r.status_code == 200, r.text
        t = r.json().get("token")
        assert t
        return t

    def test_login_wrong_password(self):
        r = requests.post(f"{DEMO}/auth/login",
                          json={"email": "demo@lumen.supply", "password": "bad"}, timeout=15)
        assert r.status_code == 401

    def test_support_tickets_matches_scenario_state(self, token):
        """Backend demo bug: raw Mongo docs → 500 while present; fixed → 200 with the seeded ticket."""
        state = {s["id"]: s["bug_present"] for s in requests.get(f"{SQA}/demo/scenarios", headers=H, timeout=15).json()["scenarios"]}
        r = requests.get(f"{DEMO}/support/tickets", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if state["tickets"]:
            assert r.status_code == 500
        else:
            assert r.status_code == 200
            ids = [t["id"] for t in r.json()["tickets"]]
            assert "LUM-T4821" in ids and all("_id" not in t for t in r.json()["tickets"])

    def test_products(self):
        r = requests.get(f"{DEMO}/products", timeout=15)
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("products", data.get("items", []))
        assert len(items) == 6

    def test_dashboard(self, token):
        r = requests.get(f"{DEMO}/dashboard", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "stats" in j
        assert "recent_orders" in j

    def test_payment_missing_amount(self, token):
        # bug payload — sends total instead of amount
        r = requests.post(f"{DEMO}/payment",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"total": 10}, timeout=15)
        assert r.status_code == 422

    def test_payment_happy(self, token):
        payload = {
            "amount": 4200,
            "currency": "USD",
            "items": [{"product_id": "lum-01", "qty": 1}],
            "customer": {"name": "T Tester", "email": "demo@lumen.supply",
                         "address": "1 Ridge Rd", "city": "Bend", "postal_code": "97701"},
            "card": {"number": "4242424242424242", "exp": "12/28", "cvc": "123"},
        }
        r = requests.post(f"{DEMO}/payment",
                          headers={"Authorization": f"Bearer {token}"},
                          json=payload, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("transactionId") or j.get("transaction_id")
        assert j.get("orderId") or j.get("order_id")

    def test_settings_get_put(self, token):
        auth = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{DEMO}/settings", headers=auth, timeout=15)
        assert r.status_code == 200
        body = r.json()
        r2 = requests.put(f"{DEMO}/settings", headers=auth, json=body, timeout=15)
        assert r2.status_code in (200, 204)


# ---------- Incidents pipeline ----------
class TestIncidents:
    @pytest.fixture(scope="class")
    def incident_id(self):
        now = int(time.time() * 1000)
        payload = {
            "failure": {"kind": "runtime_error", "type": "TypeError",
                        "message": "synthetic", "stack": "", "ts": now},
            "app": {"route": "/cart", "name": "t"},
            "events": [{"id": "e1", "ts": now - 500, "kind": "click",
                        "target": {"tag": "button", "text": "Apply",
                                   "selector": '[data-testid="cart-apply-promo-btn"]'}}],
            "network": [],
        }
        r = requests.post(f"{SQA}/incidents", headers=H, json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        j = r.json()
        assert j.get("id")
        assert j.get("status") == "captured"
        assert isinstance(j.get("timeline"), list)
        assert "graph" in j and isinstance(j["graph"].get("nodes"), list)
        assert "replay_plan" in j and isinstance(j["replay_plan"].get("steps"), list)
        assert j.get("fingerprint")
        return j["id"]

    def test_get_incident(self, incident_id):
        # allow ~40s for real LLM
        deadline = time.time() + 45
        acceptable = {"captured", "diagnosing", "diagnosed",
                      "no_safe_fix", "diagnosis_failed", "planned"}
        last = None
        while time.time() < deadline:
            r = requests.get(f"{SQA}/incidents/{incident_id}", headers=H, timeout=15)
            assert r.status_code == 200
            last = r.json()
            if last.get("status") != "captured":
                break
            time.sleep(2)
        assert last.get("status") in acceptable, f"status={last.get('status')}"

    def test_list_incidents(self, incident_id):
        r = requests.get(f"{SQA}/incidents", headers=H, timeout=15)
        assert r.status_code == 200
        j = r.json()
        arr = j if isinstance(j, list) else j.get("incidents", j.get("items", []))
        assert any(i.get("id") == incident_id for i in arr)

    def test_dismiss(self, incident_id):
        r = requests.post(f"{SQA}/incidents/{incident_id}/dismiss", headers=H, timeout=15)
        assert r.status_code in (200, 204)


class TestReadOnlyEndpoints:
    @pytest.mark.parametrize("path", ["memory", "qa/flows", "audit", "telemetry"])
    def test_json_200(self, path):
        r = requests.get(f"{SQA}/{path}", headers=H, timeout=15)
        assert r.status_code == 200
        # ensure JSON parseable
        r.json()

    def test_flows_declared_eleven(self):
        r = requests.get(f"{SQA}/qa/flows", headers=H, timeout=15)
        j = r.json()
        flows = j if isinstance(j, list) else j.get("flows", j.get("items", []))
        declared = [f for f in flows if f.get("source") == "declared"]
        assert len(declared) == 12
        assert {"Order tracking", "Wishlist", "Account", "Help", "Support tickets"} <= {f["name"] for f in declared}


class TestWorkspaceFile:
    def test_allowed(self):
        r = requests.get(f"{SQA}/workspace/file",
                         headers=H,
                         params={"path": "frontend/src/demo/lib/promo.js", "line": 11},
                         timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "lines" in j or "content" in j

    @pytest.mark.parametrize("bad", [
        "backend/.env",
        "../etc/passwd",
        "frontend/src/shadowqa/core.js",
    ])
    def test_forbidden(self, bad):
        r = requests.get(f"{SQA}/workspace/file", headers=H,
                         params={"path": bad}, timeout=15)
        assert r.status_code == 403
