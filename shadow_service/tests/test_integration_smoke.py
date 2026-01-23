"""Integration smoke tests for Shadow Interrogation Service.

These tests verify the full end-to-end flow using the ASGI transport
(no live server required). Mark with @pytest.mark.integration.

Run: pytest -m integration -v
"""

import asyncio
import json
import pytest
import httpx
from uuid import uuid4

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_health_endpoint(database_url, monkeypatch):
    """Test health endpoint returns OK with database connection."""
    from shadow_service.main import app
    
    monkeypatch.setenv("DATABASE_URL", database_url)
    
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        r = await client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"


async def test_full_shadow_interrogation_loop(
    database_url, 
    monkeypatch,
    sample_truth_data,
    sample_fragment_data,
    sample_precedent_data,
):
    """
    Test complete shadow interrogation workflow:
    1. Create truth datapoint
    2. Create prose fragment
    3. Link truth to fragment
    4. Create precedent
    5. Interrogate fragment
    6. Verify audit log created
    """
    from shadow_service.main import app
    
    monkeypatch.setenv("DATABASE_URL", database_url)
    
    headers = {
        "X-Actor": "integration.test@concept2cure.ai",
        "X-Request-ID": f"TEST-{uuid4().hex[:8]}",
        "X-Change-Reason": "integration test",
    }
    
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        timeout=30.0,
    ) as client:
        # 1) Create truth datapoint
        r = await client.post("/truth", json=sample_truth_data, headers=headers)
        assert r.status_code == 200, f"Truth creation failed: {r.text}"
        truth_id = r.json()["id"]
        
        # 2) Create prose fragment
        r = await client.post("/fragments", json=sample_fragment_data, headers=headers)
        assert r.status_code == 200, f"Fragment creation failed: {r.text}"
        fragment_data = r.json()
        fragment_id = fragment_data["id"]
        assert "version_id" in fragment_data
        
        # 3) Link truth to fragment with extracted claim value
        link_payload = {
            "truth_ids": [truth_id],
            "claim_kind": "supports",
            "extracted_claim_value": {"value_float": 0.025},
        }
        r = await client.post(
            f"/fragments/{fragment_id}/link-truth",
            json=link_payload,
            headers=headers,
        )
        assert r.status_code == 200, f"Link creation failed: {r.text}"
        
        # 4) Create precedent
        r = await client.post("/precedents", json=sample_precedent_data, headers=headers)
        assert r.status_code == 200, f"Precedent creation failed: {r.text}"
        
        # 5) Interrogate fragment
        r = await client.post(
            f"/shadow/interrogate/{fragment_id}",
            headers=headers,
        )
        assert r.status_code == 200, f"Interrogation failed: {r.text}"
        
        result = r.json()
        
        # Verify response structure
        assert result["fragment_id"] == fragment_id
        assert "audit_log_id" in result
        assert result["risk_status"] in ["ALIGNED", "DATA_DRIFT", "IR_PREDICTED"]
        assert "drift_magnitude" in result
        assert isinstance(result["drift_magnitude"], float)
        assert 0.0 <= result["drift_magnitude"] <= 1.0
        
        # Verify analysis payload (API may return feedback_payload or analysis)
        if "feedback_payload" in result:
            payload = result["feedback_payload"]
            assert payload["actor"] == "integration.test@concept2cure.ai"
            assert "truth" in payload
            assert "adversarial" in payload
        elif "analysis" in result:
            # Alternative structure - analysis contains fragment details
            analysis = result["analysis"]
            assert "confidence_rating" in analysis or "fragment_section" in analysis
        
        print(f"\n✅ Interrogation complete:")
        print(f"   Fragment: {fragment_id}")
        print(f"   Risk: {result['risk_status']}")
        print(f"   Drift: {result['drift_magnitude']:.2%}")
        print(f"   Audit: {result['audit_log_id']}")


async def test_fragment_version_history(database_url, monkeypatch, sample_fragment_data):
    """Test that fragment updates create version history."""
    from shadow_service.main import app
    
    monkeypatch.setenv("DATABASE_URL", database_url)
    
    headers = {
        "X-Actor": "version.test@concept2cure.ai",
        "X-Request-ID": f"TEST-VER-{uuid4().hex[:8]}",
        "X-Change-Reason": "initial creation",
    }
    
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        timeout=30.0,
    ) as client:
        # Create fragment
        r = await client.post("/fragments", json=sample_fragment_data, headers=headers)
        assert r.status_code == 200
        fragment_id = r.json()["id"]
        initial_version = r.json()["version_id"]
        
        # Update fragment with attribution (required for regulatory compliance)
        update_payload = {
            "content_prose": "Updated: The endpoint showed significant improvement (p=0.018).",
            "attribution": {
                "user": "version.test@concept2cure.ai",
                "reason": "updated content for testing"
            }
        }
        r = await client.patch(
            f"/fragments/{fragment_id}",
            json=update_payload,
            headers=headers,
        )
        assert r.status_code == 200, f"Fragment update failed: {r.text}"
        new_version = r.json()["version_id"]
        
        # Version should increment
        assert new_version > initial_version
        
        # Get version history
        r = await client.get(f"/fragments/{fragment_id}/versions")
        assert r.status_code == 200
        versions = r.json()
        
        # Should have at least 2 versions (may be a list or dict with 'versions' key)
        if isinstance(versions, dict) and "versions" in versions:
            versions = versions["versions"]
        assert len(versions) >= 2
        
        print(f"\n✅ Version history verified:")
        print(f"   Fragment: {fragment_id}")
        # Handle different response formats
        if isinstance(versions[0], dict):
            print(f"   Versions: {[v.get('version_id', v) for v in versions]}")
        else:
            print(f"   Versions: {versions}")


async def test_heatmap_endpoints(database_url, monkeypatch):
    """Test heatmap rollup endpoints."""
    from shadow_service.main import app
    
    monkeypatch.setenv("DATABASE_URL", database_url)
    
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        timeout=30.0,
    ) as client:
        # Section rollup
        r = await client.get("/heatmap/sections")
        assert r.status_code == 200
        sections = r.json()
        assert isinstance(sections, list)
        
        # Jurisdiction rollup
        r = await client.get("/heatmap/jurisdictions")
        assert r.status_code == 200
        jurisdictions = r.json()
        assert isinstance(jurisdictions, list)
        
        # Full heatmap
        r = await client.get("/heatmap")
        assert r.status_code == 200
        heatmap = r.json()
        # API returns section_rollups and jurisdiction_rollups
        assert "section_rollups" in heatmap or "sections" in heatmap
        assert "jurisdiction_rollups" in heatmap or "jurisdictions" in heatmap
        
        print(f"\n✅ Heatmap endpoints working:")
        print(f"   Sections: {len(sections)} rollups")
        print(f"   Jurisdictions: {len(jurisdictions)} rollups")


async def test_dashboard_rollup_endpoints(database_url, monkeypatch):
    """Test dashboard rollup endpoints (legacy compatibility)."""
    from shadow_service.main import app
    
    monkeypatch.setenv("DATABASE_URL", database_url)
    
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        timeout=30.0,
    ) as client:
        # Section rollup
        r = await client.get("/dashboard/section-rollup")
        assert r.status_code == 200
        
        # Jurisdiction rollup  
        r = await client.get("/dashboard/jurisdiction-rollup")
        assert r.status_code == 200


async def test_interrogate_nonexistent_fragment(database_url, monkeypatch):
    """Test that interrogating non-existent fragment returns 404."""
    from shadow_service.main import app
    
    monkeypatch.setenv("DATABASE_URL", database_url)
    
    fake_id = str(uuid4())
    headers = {"X-Actor": "test@test.com"}
    
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        r = await client.post(f"/shadow/interrogate/{fake_id}", headers=headers)
        assert r.status_code == 404
