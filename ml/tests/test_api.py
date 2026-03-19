"""
Tests: FastAPI endpoints
ตรวจ schema, response codes, field types
"""

import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from fastapi.testclient import TestClient
    from api.main import app
    HAS_API = True
except Exception:
    HAS_API = False


@pytest.fixture(scope="module")
def client():
    if not HAS_API:
        pytest.skip("FastAPI or data not available")
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert data["status"] == "ok"
    assert "model_metrics" in data


def test_predict_churn_schema(client):
    r = client.post("/predict/churn", json={"acc_id": 23})
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assert "churn_probability" in data
        assert "churn_tier" in data
        assert "top_risk_factors" in data
        assert isinstance(data["top_risk_factors"], list)
        assert 0 <= data["churn_probability"] <= 1


def test_predict_clv_schema(client):
    r = client.post("/predict/clv", json={"acc_id": 23})
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assert "predicted_clv_6m" in data
        assert "ci_95" in data
        assert "p_alive" in data
        assert len(data["ci_95"]) == 2
        assert data["ci_95"][0] <= data["ci_95"][1]


def test_predict_credit_schema(client):
    r = client.post("/predict/credit", json={"acc_id": 23})
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        if "p50" in data:
            assert data["p10"] <= data["p25"] <= data["p50"] <= data["p75"] <= data["p90"]
            assert data["urgency"] in ("Critical", "Warning", "Monitor", "Stable")


def test_predict_all_schema(client):
    r = client.post("/predict/all", json={"acc_id": 23})
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assert "churn_probability" in data
        assert "action" in data
        assert "priority_score" in data


def test_explain_schema(client):
    r = client.post("/explain/23")
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assert "top_risk_factors" in data


def test_what_if_schema(client):
    r = client.post("/what-if/23", json={
        "acc_id": 23, "feature": "days_since_last_access", "new_value": 0.0
    })
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assert "original_probability" in data
        assert "new_probability" in data
        assert "delta" in data


def test_not_found_returns_404(client):
    r = client.post("/predict/churn", json={"acc_id": 999999999})
    assert r.status_code == 404


def test_segments_summary(client):
    r = client.get("/segments/summary")
    assert r.status_code == 200
    data = r.json()
    assert "total_active" in data
    assert "revenue_at_risk" in data
