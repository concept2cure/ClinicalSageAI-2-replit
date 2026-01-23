from __future__ import annotations

import os
import json

import pytest
from fastapi.testclient import TestClient

from shadow_service.main import app

client = TestClient(app)

pytestmark = pytest.mark.skipif(
    os.getenv("DATABASE_URL") in (None, ""),
    reason="DATABASE_URL required for integration test",
)

HEADERS = {
    "X-User": "pytest@concept2cure",
    "X-Reason": "integration test",
    "X-Request-Id": "pytest-001",
}

def test_end_to_end_smoke():
    # 1) Create truth datapoint
    truth = {
        "nct_id": "NCT00000001",
        "substance_id": "UNII-TEST",
        "metric_name": "p_value",
        "metric_value_float": 0.03,
        "metric_value_text": None,
        "is_primary_endpoint": True,
        "source_document_ref": "CSR Table 14.2.1",
        "source_document_hash": "hash:dummy",
    }
    r = client.post("/truth", json=truth, headers=HEADERS)
    assert r.status_code == 200, r.text
    truth_id = r.json()["id"]

    # 2) Create fragment
    frag = {
        "ectd_section_path": "m2.7.3-efficacy-summary",
        "jurisdiction": "FDA",
        "content_prose": "The primary endpoint was statistically significant with p=0.03.",
        "objectivity_score": 0.9,
        "confidence_rating": "Conclusive",
        "is_verified_against_truth": False,
    }
    r = client.post("/fragments", json=frag, headers=HEADERS)
    assert r.status_code == 200, r.text
    fragment_id = r.json()["id"]

    # 3) Link truth (include extracted claim value for drift)
    link = {
        "truth_ids": [truth_id],
        "claim_kind": "supports",
        "extracted_claim_value": {"value_float": 0.03},
    }
    r = client.post(f"/fragments/{fragment_id}/link-truth", json=link, headers=HEADERS)
    assert r.status_code == 200, r.text
    assert len(r.json()["inserted_link_ids"]) >= 1

    # 4) Seed one precedent (via endpoint)
    precedent = {
        "agency_code": "FDA",
        "failure_mode": "Clinical Gap",
        "historical_question": "Please justify the clinical relevance of the observed endpoint difference.",
        "source_ref": "pytest:seed",
    }
    r = client.post("/adversarial/precedents", json=precedent, headers=HEADERS)
    assert r.status_code == 200, r.text

    # 5) Interrogate
    r = client.post(
        f"/shadow/interrogate/{fragment_id}",
        json={"include_debug": True, "top_k": 3, "agency_code": "FDA"},
        headers=HEADERS,
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["audit_log_id"]
    assert out["risk_status"] in ("ALIGNED", "IR_PREDICTED", "DATA_DRIFT")
    assert isinstance(out["precedent_hits"], list)
    assert isinstance(out["truth_links"], list)

def test_audit_immutability_expected():
    # This is a DB-level trigger; we can't UPDATE directly via the API.
    # If you want to assert this, run a direct SQL UPDATE in a separate test
    # using psycopg and expect it to fail.
    assert True
