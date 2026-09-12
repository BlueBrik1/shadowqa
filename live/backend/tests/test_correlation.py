from shadowqa import correlation


def _payload():
    t = 1_700_000_000_000
    return {
        "app": {"route": "/checkout"},
        "failure": {"kind": "unhandled_rejection", "type": "TypeError", "message": "Cannot read properties of undefined (reading 'toUpperCase')", "ts": t + 1200},
        "events": [
            {"id": "e1", "ts": t, "kind": "navigation", "from": "/cart", "to": "/checkout"},
            {"id": "e2", "ts": t + 100, "kind": "input", "target": {"tag": "input", "text": "Street address", "selector": '[data-testid="checkout-address"]', "testid": "checkout-address"}, "value": "1 Ridge"},
            {"id": "e3", "ts": t + 900, "kind": "click", "target": {"tag": "button", "text": "Pay $303.00", "selector": '[data-testid="checkout-pay-btn"]', "component": "Checkout"}},
            {"id": "e4", "ts": t + 901, "kind": "submit", "target": {"tag": "form", "text": "checkout-form", "selector": '[data-testid="checkout-form"]'}},
        ],
        "network": [
            {"id": "n1", "ts": t + 905, "end_ts": t + 1100, "method": "POST", "url": "https://x/api/demo/payment", "path": "/api/demo/payment", "status": 422, "duration_ms": 195},
        ],
        "dom": {"trigger": {"component": "Checkout"}},
    }


def test_correlation_builds_causal_chain_and_replay_plan():
    frames = [{"function": "handlePay", "url": "https://x/static/js/bundle.js", "line": 10, "column": 2, "resolved": True,
               "original": {"file": "frontend/src/demo/pages/Checkout.jsx", "line": 31, "column": 1, "vendor": False}}]
    out = correlation.build(_payload(), frames)
    assert out["title"] == "Checkout failed"
    assert out["trigger"]["id"] == "e3"  # click preferred over the submit it caused
    assert out["related_request"]["status"] == 422
    assert out["source_location"] == {"file": "frontend/src/demo/pages/Checkout.jsx", "line": 31, "column": 1, "function": "handlePay", "resolved": True}
    labels = [t["label"] for t in out["timeline"]]
    assert any("Route changed" in l for l in labels) and any("HTTP 422" in l for l in labels) and labels[-1].startswith("Source →")
    types = [n["type"] for n in out["graph"]["nodes"]]
    assert types == ["user_action", "ui_element", "component", "route", "network_request", "network_response", "runtime_error", "source_location", "file"]
    steps = out["replay_plan"]["steps"]
    assert [s["action"] for s in steps] == ["navigate", "fill", "click"]  # submit collapsed into the click
    assert out["replay_plan"]["expectations"]["request"] == {"method": "POST", "path": "/api/demo/payment", "status_min": 200, "status_max": 399}
    assert len(out["fingerprint"]) == 16


def test_fingerprint_stable_across_numbers():
    fp1 = correlation.fingerprint({"type": "TypeError", "message": "x 12 y"}, None)
    fp2 = correlation.fingerprint({"type": "TypeError", "message": "x 99 y"}, None)
    assert fp1 == fp2


def test_route_name():
    assert correlation.route_name("/") == "Home"
    assert correlation.route_name("/product-details/1") == "Product details"
