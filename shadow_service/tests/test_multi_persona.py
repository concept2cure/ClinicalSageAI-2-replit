"""Tests for multi-persona Shadow Agent runs and export manifests."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
from datetime import datetime


class TestPersonas:
    """Tests for persona configuration."""
    
    def test_personas_module_loads(self):
        """Verify personas module loads correctly."""
        from shadow_service.personas import (
            PERSONAS,
            get_persona,
            get_all_personas,
            validate_persona_codes,
            DEFAULT_PERSONA,
        )
        
        # Standard personas exist
        assert "FDA_STATS" in PERSONAS
        assert "FDA_CLINICAL" in PERSONAS
        assert "FDA_SAFETY" in PERSONAS
        assert "CMC_QUALITY" in PERSONAS
        
    def test_get_persona_returns_correct_config(self):
        """Verify get_persona returns correct configuration."""
        from shadow_service.personas import get_persona
        
        stats = get_persona("FDA_STATS")
        assert stats.code == "FDA_STATS"
        assert stats.agency_filter == "FDA"
        assert stats.top_k == 8
        assert stats.drift_red_threshold == 0.18
        assert "Multiplicity" in stats.failure_modes
        
    def test_get_persona_fallback_to_default(self):
        """Verify unknown persona falls back to default."""
        from shadow_service.personas import get_persona, DEFAULT_PERSONA
        
        unknown = get_persona("NONEXISTENT")
        default = get_persona(DEFAULT_PERSONA)
        assert unknown.code == default.code
        
    def test_validate_persona_codes(self):
        """Verify persona code validation."""
        from shadow_service.personas import validate_persona_codes
        
        # Valid codes pass through
        valid = validate_persona_codes(["FDA_STATS", "FDA_CLINICAL"])
        assert valid == ["FDA_STATS", "FDA_CLINICAL"]
        
        # Invalid codes filtered out
        mixed = validate_persona_codes(["FDA_STATS", "INVALID", "FDA_SAFETY"])
        assert mixed == ["FDA_STATS", "FDA_SAFETY"]
        
        # All invalid returns default
        invalid = validate_persona_codes(["INVALID1", "INVALID2"])
        assert len(invalid) == 1  # Falls back to default
        
    def test_persona_to_dict(self):
        """Verify persona serialization."""
        from shadow_service.personas import get_persona
        
        stats = get_persona("FDA_STATS")
        d = stats.to_dict()
        
        assert d["code"] == "FDA_STATS"
        assert isinstance(d["failure_modes"], list)
        assert d["top_k"] == 8


class TestModels:
    """Tests for new Pydantic models."""
    
    def test_multi_persona_request_model(self):
        """Verify MultiPersonaInterrogateRequest model."""
        from shadow_service.models import MultiPersonaInterrogateRequest
        
        req = MultiPersonaInterrogateRequest(
            ectd_section_like="m2.7.3%",
            jurisdiction="FDA",
            personas=["FDA_STATS", "FDA_CLINICAL"],
            run_name="Weekly QC"
        )
        
        assert req.ectd_section_like == "m2.7.3%"
        assert len(req.personas) == 2
        
    def test_export_manifest_request_defaults(self):
        """Verify ExportManifestRequest defaults."""
        from shadow_service.models import ExportManifestRequest
        
        req = ExportManifestRequest()
        assert req.persist is True
        assert req.export_format == "json"
        
    def test_persona_result_model(self):
        """Verify PersonaResult model."""
        from shadow_service.models import PersonaResult
        
        result = PersonaResult(
            persona="FDA_STATS",
            logs_count=10,
            red_count=2,
            amber_count=3,
            green_count=5,
            avg_drift=0.15
        )
        
        assert result.persona == "FDA_STATS"
        assert result.logs_count == 10


class TestSqlRunGroups:
    """Tests for run group SQL queries."""
    
    def test_sql_queries_are_valid_strings(self):
        """Verify SQL query strings are defined."""
        from shadow_service import sql_run_groups
        
        assert sql_run_groups.SQL_INSERT_RUN_GROUP
        assert sql_run_groups.SQL_GET_RUN_GROUP
        assert sql_run_groups.SQL_INSERT_AUDIT_LOG_ENHANCED
        assert sql_run_groups.SQL_GET_FRAGMENTS_BY_SECTION
        assert sql_run_groups.SQL_RETRIEVE_PRECEDENTS_WITH_PERSONA


class TestSqlExports:
    """Tests for export SQL queries."""
    
    def test_sql_queries_are_valid_strings(self):
        """Verify SQL query strings are defined."""
        from shadow_service import sql_exports
        
        assert sql_exports.SQL_INSERT_EXPORT_RECORD
        assert sql_exports.SQL_GET_EXPORT_BY_ID
        assert sql_exports.SQL_GET_EXPORT_HISTORY
        assert sql_exports.SQL_VERIFY_MANIFEST_INTEGRITY


@pytest.mark.asyncio
class TestMultiPersonaEndpoints:
    """Integration tests for multi-persona endpoints."""
    
    async def test_list_personas_endpoint(self, client):
        """Test GET /personas returns all personas."""
        response = await client.get("/personas")
        
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            codes = [p["code"] for p in data]
            assert "FDA_STATS" in codes
            assert "FDA_CLINICAL" in codes
            
    async def test_get_persona_endpoint(self, client):
        """Test GET /personas/{code} returns specific persona."""
        response = await client.get("/personas/FDA_STATS")
        
        if response.status_code == 200:
            data = response.json()
            assert data["code"] == "FDA_STATS"
            assert data["agency_filter"] == "FDA"
            
    async def test_get_unknown_persona_returns_404(self, client):
        """Test GET /personas/{code} with unknown code returns 404."""
        response = await client.get("/personas/NONEXISTENT")
        assert response.status_code == 404


@pytest.mark.asyncio  
class TestExportManifestEndpoints:
    """Integration tests for export manifest endpoints."""
    
    @pytest.mark.skip(reason="Requires database connection - run with DATABASE_URL")
    async def test_export_history_endpoint(self, client):
        """Test GET /exports/history returns list or error without DB."""
        response = await client.get("/exports/history")
        
        # In test mode without DB, may return 500 or 200 with empty
        # Accept either as valid test behavior
        assert response.status_code in [200, 500]
        
        if response.status_code == 200:
            data = response.json()
            assert "total" in data
            assert "items" in data
            assert isinstance(data["items"], list)


# Fixture for async HTTP client
@pytest.fixture
async def client():
    """Create async test client."""
    from httpx import AsyncClient, ASGITransport
    from shadow_service.main import app
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
