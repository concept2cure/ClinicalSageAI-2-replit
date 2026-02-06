"""Tests for the Evidence Fabric — Phase 5.1.

Covers:
 1. Model validation (Pydantic)
 2. SQL query structure (no DB required)
 3. Runner logic with mocked DB (hashing, scoring, dedup, contradictions)
 4. Router endpoint wiring (FastAPI TestClient) + auth gate
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
from datetime import datetime


# =============================================================================
# Helper: asyncpg.Record-like object that supports dict() and ["key"]
# =============================================================================

class FakeRecord(dict):
    """Mimics asyncpg.Record: supports dict(row), row["key"], and row.get(k)."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


# =============================================================================
# 1) Model validation tests
# =============================================================================


class TestEvidenceModels:
    """Pydantic model validation — no DB needed."""

    def test_create_claim_minimal(self):
        from shadow_service.models_evidence import CreateClaimRequest

        req = CreateClaimRequest(
            program_id=uuid4(),
            claim_type="efficacy",
            claim_text="Drug X reduces mortality by 30%",
        )
        assert req.structured == {}
        assert req.section_ref is None
        assert req.supersedes_id is None
        assert req.confidence is None

    def test_create_claim_full(self):
        from shadow_service.models_evidence import CreateClaimRequest

        pid = uuid4()
        sid = uuid4()
        req = CreateClaimRequest(
            program_id=pid,
            claim_type="safety",
            claim_text="No serious adverse events",
            structured={"entity": "AE", "field": "serious_count", "value": "0"},
            section_ref="m5.3.5.1",
            supersedes_id=sid,
            confidence=0.85,
        )
        assert req.program_id == pid
        assert req.supersedes_id == sid
        assert req.confidence == 0.85

    def test_create_source_minimal(self):
        from shadow_service.models_evidence import CreateSourceRequest

        req = CreateSourceRequest(
            program_id=uuid4(),
            source_type="csr_section",
            source_ref="CSR v2.0 Section 11.4",
        )
        assert req.source_uri is None
        assert req.content is None
        assert req.metadata == {}

    def test_create_source_full(self):
        from shadow_service.models_evidence import CreateSourceRequest

        req = CreateSourceRequest(
            program_id=uuid4(),
            source_type="guideline",
            source_ref="ICH E6(R3) 4.8",
            source_uri="https://ich.org/e6r3",
            content="Informed consent must be obtained...",
            metadata={"version": "R3", "section": "4.8"},
        )
        assert req.content is not None
        assert req.metadata["version"] == "R3"

    def test_create_support_defaults(self):
        from shadow_service.models_evidence import CreateSupportRequest

        req = CreateSupportRequest(
            claim_id=uuid4(),
            source_id=uuid4(),
            program_id=uuid4(),
        )
        assert req.support_type == "supports"
        assert req.strength == 0.5

    def test_create_support_custom(self):
        from shadow_service.models_evidence import CreateSupportRequest

        req = CreateSupportRequest(
            claim_id=uuid4(),
            source_id=uuid4(),
            program_id=uuid4(),
            support_type="contradicts",
            strength=0.9,
            span_start=100,
            span_end=250,
            annotation="Direct contradiction in paragraph 3",
        )
        assert req.support_type == "contradicts"
        assert req.strength == 0.9

    def test_create_derivation_defaults(self):
        from shadow_service.models_evidence import CreateDerivationRequest

        req = CreateDerivationRequest(
            program_id=uuid4(),
            derived_claim_id=uuid4(),
            source_claim_id=uuid4(),
        )
        assert req.derivation_type == "inference"
        assert req.reasoning is None
        assert req.model_id is None

    def test_create_provenance_minimal(self):
        from shadow_service.models_evidence import CreateProvenanceRequest

        req = CreateProvenanceRequest(
            program_id=uuid4(),
            event_type="claim_created",
        )
        assert req.claim_id is None
        assert req.source_id is None
        assert req.metadata == {}

    def test_claim_response(self):
        from shadow_service.models_evidence import ClaimResponse

        now = datetime.utcnow()
        resp = ClaimResponse(
            id=uuid4(),
            program_id=uuid4(),
            claim_type="efficacy",
            claim_text="Test claim",
            structured={},
            section_ref=None,
            version=1,
            supersedes_id=None,
            status="active",
            confidence=None,
            created_by="system",
            created_at=now,
            updated_at=now,
        )
        assert resp.status == "active"
        assert resp.version == 1

    def test_claim_score_breakdown(self):
        from shadow_service.models_evidence import ClaimScoreBreakdown

        score = ClaimScoreBreakdown(
            claim_id=str(uuid4()),
            source_count=3,
            contradiction_count=1,
            avg_source_strength=0.75,
            has_guideline_source=True,
            has_csr_source=False,
            has_dataset_source=True,
            recency_factor=1.0,
            computed_confidence=0.62,
            flags=["has_contradictions"],
        )
        assert score.computed_confidence == 0.62
        assert "has_contradictions" in score.flags


# =============================================================================
# 2) SQL query structure tests
# =============================================================================


class TestEvidenceSQLStructure:
    """Validate SQL strings are well-formed — no DB needed."""

    def test_all_queries_are_strings(self):
        from shadow_service import sql_evidence as sql

        query_names = [
            "INSERT_CLAIM", "SELECT_CLAIM_BY_ID", "SELECT_CLAIMS_BY_PROGRAM",
            "SELECT_CLAIMS_BY_SECTION", "UPDATE_CLAIM_STATUS", "UPDATE_CLAIM_CONFIDENCE",
            "INSERT_SOURCE", "SELECT_SOURCE_BY_ID", "SELECT_SOURCES_BY_PROGRAM",
            "SELECT_SOURCE_BY_HASH",
            "INSERT_SUPPORT", "SELECT_SUPPORT_FOR_CLAIM", "SELECT_CONTRADICTIONS_FOR_CLAIM",
            "INSERT_DERIVATION", "SELECT_DERIVATIONS_FOR_CLAIM", "SELECT_DERIVATION_CHAIN",
            "INSERT_PROVENANCE", "SELECT_PROVENANCE_FOR_CLAIM",
            "SELECT_PROVENANCE_FOR_STEP", "SELECT_PROVENANCE_BY_REQUEST",
            "INSERT_HASH_ENTRY", "VERIFY_HASH",
            "SET_PROGRAM_CONTEXT",
        ]
        for name in query_names:
            val = getattr(sql, name)
            assert isinstance(val, str), f"{name} should be a string"
            assert len(val.strip()) > 10, f"{name} should not be empty"

    def test_insert_claim_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.INSERT_CLAIM.upper()

    def test_insert_source_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.INSERT_SOURCE.upper()

    def test_insert_support_has_on_conflict(self):
        from shadow_service import sql_evidence as sql
        assert "ON CONFLICT" in sql.INSERT_SUPPORT.upper()

    def test_derivation_chain_is_recursive(self):
        from shadow_service import sql_evidence as sql
        upper = sql.SELECT_DERIVATION_CHAIN.upper()
        assert "RECURSIVE" in upper
        assert "UNION ALL" in upper

    def test_derivation_chain_has_depth_limit(self):
        from shadow_service import sql_evidence as sql
        # Must have depth guard to prevent infinite recursion
        assert "depth" in sql.SELECT_DERIVATION_CHAIN.lower()

    def test_hash_entry_insert_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.INSERT_HASH_ENTRY.upper()

    def test_verify_hash_selects_content_hash(self):
        from shadow_service import sql_evidence as sql
        assert "content_hash" in sql.VERIFY_HASH.lower()

    def test_set_program_context_uses_guc(self):
        from shadow_service import sql_evidence as sql
        assert "set_config" in sql.SET_PROGRAM_CONTEXT.lower()

    def test_rls_guc_is_transaction_local(self):
        from shadow_service import sql_evidence as sql
        # Third arg = TRUE means transaction-local
        assert "true" in sql.SET_PROGRAM_CONTEXT.lower()

    def test_claims_by_program_has_limit(self):
        from shadow_service import sql_evidence as sql
        assert "LIMIT" in sql.SELECT_CLAIMS_BY_PROGRAM.upper()

    def test_claims_by_section_has_limit(self):
        from shadow_service import sql_evidence as sql
        assert "LIMIT" in sql.SELECT_CLAIMS_BY_SECTION.upper()

    def test_contradictions_query_filters_type(self):
        from shadow_service import sql_evidence as sql
        assert "contradicts" in sql.SELECT_CONTRADICTIONS_FOR_CLAIM.lower()


# =============================================================================
# 3) Runner logic tests (mocked DB)
# =============================================================================


def _make_claim_row(claim_id=None, **overrides):
    """Factory for a mock claim DB row."""
    row = {
        "id": claim_id or uuid4(),
        "program_id": uuid4(),
        "claim_type": "efficacy",
        "claim_text": "Test claim",
        "structured": "{}",
        "section_ref": "m5.3.5.1",
        "version": 1,
        "supersedes_id": None,
        "status": "active",
        "confidence": None,
        "created_by": "system",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


def _make_source_row(source_id=None, **overrides):
    """Factory for a mock source DB row."""
    row = {
        "id": source_id or uuid4(),
        "program_id": uuid4(),
        "source_type": "csr_section",
        "source_ref": "CSR v2.0 Section 11.4",
        "source_uri": None,
        "content_hash": "abc123",
        "metadata": "{}",
        "captured_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


def _make_support_row(**overrides):
    """Factory for a mock support DB row."""
    row = {
        "id": uuid4(),
        "claim_id": uuid4(),
        "source_id": uuid4(),
        "program_id": uuid4(),
        "support_type": "supports",
        "strength": 0.8,
        "span_start": None,
        "span_end": None,
        "annotation": None,
        "created_by": "system",
        "created_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


class TestEvidenceRunnerHashing:
    """Content hashing — deterministic, canonical."""

    def test_hash_content_deterministic(self):
        from shadow_service.evidence_runner import _hash_content
        h1 = _hash_content("hello world")
        h2 = _hash_content("hello world")
        assert h1 == h2

    def test_hash_content_different(self):
        from shadow_service.evidence_runner import _hash_content
        h1 = _hash_content("hello")
        h2 = _hash_content("world")
        assert h1 != h2

    def test_hash_is_sha256_hex(self):
        from shadow_service.evidence_runner import _hash_content
        h = _hash_content("test")
        assert len(h) == 64  # sha256 hex length
        assert all(c in "0123456789abcdef" for c in h)

    def test_canonical_claim_content_stable(self):
        from shadow_service.evidence_runner import _canonical_claim_content
        c1 = _canonical_claim_content("claim", {"b": 2, "a": 1})
        c2 = _canonical_claim_content("claim", {"a": 1, "b": 2})
        assert c1 == c2  # sort_keys ensures stability

    def test_canonical_claim_content_format(self):
        from shadow_service.evidence_runner import _canonical_claim_content
        result = _canonical_claim_content("text", {"key": "val"})
        assert result == 'text|{"key": "val"}'


class TestEvidenceRunnerCreateClaim:
    """Claim creation with hash ledger + provenance."""

    @pytest.mark.asyncio
    async def test_create_claim_basic(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()
        mock_row = _make_claim_row(claim_id=claim_id, program_id=program_id)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.create_claim(
                program_id=program_id,
                claim_type="efficacy",
                claim_text="Drug X works",
            )
            assert result["id"] == claim_id
            # Should call execute for RLS + fetchrow for claim + hash + no provenance (no request_id)
            assert mock_conn.execute.call_count == 1  # RLS set_config
            assert mock_conn.fetchrow.call_count >= 2  # claim INSERT + hash INSERT

    @pytest.mark.asyncio
    async def test_create_claim_with_provenance(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()
        mock_row = _make_claim_row(claim_id=claim_id, program_id=program_id)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.create_claim(
                program_id=program_id,
                claim_type="safety",
                claim_text="No SAEs",
                request_id="req-123",
            )
            assert result["id"] == claim_id
            # claim INSERT + hash INSERT + provenance INSERT = 3 fetchrow calls
            assert mock_conn.fetchrow.call_count >= 3


class TestEvidenceRunnerCreateSource:
    """Source creation with dedup."""

    @pytest.mark.asyncio
    async def test_create_source_no_dedup(self):
        from shadow_service import evidence_runner as runner

        source_id = uuid4()
        program_id = uuid4()
        mock_row = _make_source_row(source_id=source_id)

        mock_conn = AsyncMock()
        # fetchrow: dedup check returns None, then insert returns row, then hash entry
        mock_conn.fetchrow = AsyncMock(side_effect=[None, mock_row, mock_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.create_source(
                program_id=program_id,
                source_type="csr_section",
                source_ref="CSR 11.4",
                content="Some content",
            )
            assert result["id"] == source_id

    @pytest.mark.asyncio
    async def test_create_source_dedup_returns_existing(self):
        from shadow_service import evidence_runner as runner

        existing_id = uuid4()
        program_id = uuid4()
        existing_row = _make_source_row(source_id=existing_id)

        mock_conn = AsyncMock()
        # dedup check returns existing row → short-circuit
        mock_conn.fetchrow = AsyncMock(return_value=existing_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.create_source(
                program_id=program_id,
                source_type="csr_section",
                source_ref="CSR 11.4",
                content="Same content",
            )
            assert result["id"] == existing_id


class TestEvidenceRunnerScoring:
    """Claim scoring & anti-hallucination."""

    @pytest.mark.asyncio
    async def test_score_unsupported_claim(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])  # no support links
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.score_claim(claim_id, program_id)
            assert result["source_count"] == 0
            assert result["computed_confidence"] == 0.0
            assert "unsupported_claim" in result["flags"]
            assert "low_confidence" in result["flags"]

    @pytest.mark.asyncio
    async def test_score_with_contradictions(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()

        supports = [
            _make_support_row(support_type="supports", strength=0.8),
            _make_support_row(support_type="supports", strength=0.7),
            _make_support_row(support_type="contradicts", strength=0.9),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=supports)
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.score_claim(claim_id, program_id)
            assert result["contradiction_count"] == 1
            assert "has_contradictions" in result["flags"]
            # confidence should be penalized
            assert result["computed_confidence"] < 1.0

    @pytest.mark.asyncio
    async def test_score_with_guideline_bonus(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()

        supports = [
            _make_support_row(support_type="supports", strength=0.9, source_type="guideline"),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=supports)
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.score_claim(claim_id, program_id)
            assert result["has_guideline_source"] is True


class TestEvidenceRunnerContradictions:
    """Contradiction detection across claims."""

    @pytest.mark.asyncio
    async def test_no_contradictions_when_same_values(self):
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        claims = [
            _make_claim_row(structured='{"entity": "AE", "field": "count", "value": "5"}'),
            _make_claim_row(structured='{"entity": "AE", "field": "count", "value": "5"}'),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=claims)
        mock_conn.execute = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.detect_contradictions(program_id)
            assert len(result) == 0

    @pytest.mark.asyncio
    async def test_detects_contradicting_values(self):
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        claims = [
            _make_claim_row(structured='{"entity": "AE", "field": "count", "value": "5"}'),
            _make_claim_row(structured='{"entity": "AE", "field": "count", "value": "10"}'),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=claims)
        mock_conn.execute = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.detect_contradictions(program_id)
            assert len(result) == 1
            assert result[0]["entity_field"] == "AE:count"
            assert set(result[0]["distinct_values"]) == {"5", "10"}
            assert result[0]["severity"] == "medium"

    @pytest.mark.asyncio
    async def test_high_severity_with_three_values(self):
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        claims = [
            _make_claim_row(structured='{"entity": "dose", "field": "amount", "value": "100mg"}'),
            _make_claim_row(structured='{"entity": "dose", "field": "amount", "value": "200mg"}'),
            _make_claim_row(structured='{"entity": "dose", "field": "amount", "value": "300mg"}'),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=claims)
        mock_conn.execute = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.detect_contradictions(program_id)
            assert len(result) == 1
            assert result[0]["severity"] == "high"


class TestEvidenceRunnerVerify:
    """Hash verification tests."""

    @pytest.mark.asyncio
    async def test_verify_claim_not_found(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.verify_claim_integrity(claim_id, program_id)
            assert result["valid"] is False
            assert result["error"] == "claim_not_found"

    @pytest.mark.asyncio
    async def test_verify_claim_no_ledger_hash(self):
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()
        claim = _make_claim_row(claim_id=claim_id, structured="{}")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=claim)
        mock_conn.fetchval = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.verify_claim_integrity(claim_id, program_id)
            assert result["valid"] is False
            assert result["error"] == "no_hash_in_ledger"


# =============================================================================
# 4) Router endpoint wiring tests (FastAPI TestClient)
# =============================================================================


class TestEvidenceRouterAuth:
    """Auth gate — fail-closed, same as orchestration."""

    def _get_client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from shadow_service.router_evidence import router
        app = FastAPI()
        app.include_router(router)
        return TestClient(app)

    def test_no_env_var_returns_503(self):
        client = self._get_client()
        with patch.dict("os.environ", {}, clear=True):
            resp = client.get("/evidence/claims", params={"program_id": str(uuid4())})
            assert resp.status_code == 503

    def test_wrong_token_returns_403(self):
        client = self._get_client()
        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "correct"}):
            resp = client.get(
                "/evidence/claims",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "wrong"},
            )
            assert resp.status_code == 403

    def test_no_token_header_returns_403(self):
        client = self._get_client()
        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "correct"}):
            resp = client.get(
                "/evidence/claims",
                params={"program_id": str(uuid4())},
            )
            assert resp.status_code == 403

    def test_correct_token_passes_auth(self):
        """Auth passes, runner mocked — expect 200, not 403/503."""
        client = self._get_client()
        pid = uuid4()
        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "secret123"}), \
             patch("shadow_service.router_evidence.runner.list_claims", new_callable=AsyncMock, return_value=[]):
            resp = client.get(
                "/evidence/claims",
                params={"program_id": str(pid)},
                headers={"X-Admin-Token": "secret123"},
            )
            assert resp.status_code == 200


class TestEvidenceRouterEndpoints:
    """Endpoint wiring with mocked runner."""

    def _get_client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from shadow_service.router_evidence import router
        app = FastAPI()
        app.include_router(router)
        return TestClient(app)

    def test_create_claim_endpoint(self):
        client = self._get_client()
        pid = uuid4()
        cid = uuid4()
        now = datetime.utcnow().isoformat()

        mock_result = {
            "id": cid, "program_id": pid, "claim_type": "efficacy",
            "claim_text": "Drug X works", "structured": {}, "section_ref": None,
            "version": 1, "supersedes_id": None, "status": "active",
            "confidence": None, "created_by": "test", "created_at": now, "updated_at": now,
        }

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}), \
             patch("shadow_service.router_evidence.runner.create_claim", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post(
                "/evidence/claims",
                json={"program_id": str(pid), "claim_type": "efficacy", "claim_text": "Drug X works"},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["claim_type"] == "efficacy"

    def test_list_claims_endpoint(self):
        client = self._get_client()
        pid = uuid4()

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}), \
             patch("shadow_service.router_evidence.runner.list_claims", new_callable=AsyncMock, return_value=[]):
            resp = client.get(
                "/evidence/claims",
                params={"program_id": str(pid)},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["claims"] == []
            assert data["total"] == 0

    def test_create_source_endpoint(self):
        client = self._get_client()
        pid = uuid4()
        sid = uuid4()
        now = datetime.utcnow().isoformat()

        mock_result = {
            "id": sid, "program_id": pid, "source_type": "guideline",
            "source_ref": "ICH E6", "source_uri": None, "content_hash": "abc",
            "metadata": {}, "captured_at": now, "created_at": now, "updated_at": now,
        }

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}), \
             patch("shadow_service.router_evidence.runner.create_source", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post(
                "/evidence/sources",
                json={"program_id": str(pid), "source_type": "guideline", "source_ref": "ICH E6"},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data["source_type"] == "guideline"

    def test_create_support_endpoint(self):
        client = self._get_client()
        pid = uuid4()
        now = datetime.utcnow().isoformat()

        mock_result = {
            "id": uuid4(), "claim_id": uuid4(), "source_id": uuid4(),
            "program_id": pid, "support_type": "supports", "strength": 0.8,
            "span_start": None, "span_end": None, "annotation": None,
            "created_by": "test", "created_at": now,
        }

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}), \
             patch("shadow_service.router_evidence.runner.create_support", new_callable=AsyncMock, return_value=mock_result):
            resp = client.post(
                "/evidence/support",
                json={
                    "claim_id": str(uuid4()),
                    "source_id": str(uuid4()),
                    "program_id": str(pid),
                },
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 201

    def test_score_claim_endpoint(self):
        client = self._get_client()
        cid = uuid4()
        pid = uuid4()

        mock_score = {
            "claim_id": str(cid),
            "source_count": 2,
            "contradiction_count": 0,
            "avg_source_strength": 0.85,
            "has_guideline_source": True,
            "has_csr_source": False,
            "has_dataset_source": False,
            "recency_factor": 1.0,
            "computed_confidence": 0.67,
            "flags": [],
        }

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}), \
             patch("shadow_service.router_evidence.runner.score_claim", new_callable=AsyncMock, return_value=mock_score):
            resp = client.get(
                f"/evidence/claims/{cid}/score",
                params={"program_id": str(pid)},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["computed_confidence"] == 0.67

    def test_contradictions_endpoint(self):
        client = self._get_client()
        pid = uuid4()

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}), \
             patch("shadow_service.router_evidence.runner.detect_contradictions", new_callable=AsyncMock, return_value=[]):
            resp = client.get(
                "/evidence/contradictions",
                params={"program_id": str(pid)},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["contradictions"] == []

    def test_provenance_requires_filter(self):
        """Must provide at least one of claim_id, step_run_id, request_id."""
        client = self._get_client()

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}):
            resp = client.get(
                "/evidence/provenance",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 400

    def test_list_claims_pagination_cap(self):
        """Limit is capped at 100."""
        client = self._get_client()

        with patch.dict("os.environ", {"REVIEW_ADMIN_TOKEN": "tok"}):
            resp = client.get(
                "/evidence/claims",
                params={"program_id": str(uuid4()), "limit": 999},
                headers={"X-Admin-Token": "tok"},
            )
            assert resp.status_code == 422  # FastAPI validates le=100
