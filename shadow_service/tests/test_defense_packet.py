"""Tests for Phase 5.3.B — Defense Packet generator.

Covers:
 1. build_defense_packet — ZIP structure, manifest integrity, file list
 2. Actor redaction — SHA-256 prefix hashing, no PII leak
 3. Summary generation — counts, integrity, disclosure
 4. JSON serialization — UUID, datetime, JSONB (dict)
 5. Edge cases — empty program (no data), partial data
 6. Helper functions — _hash_actor, _redact_actors, _json_serial
"""

import hashlib
import io
import json
import os
import pytest
import zipfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4


# =============================================================================
# Helper: asyncpg.Record-like object
# =============================================================================

class FakeRecord(dict):
    """Mimics asyncpg.Record: supports dict(row), row["key"], and row.get(k)."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


# =============================================================================
# Row factories
# =============================================================================

def _make_claim_row(**overrides):
    defaults = {
        "id": uuid4(),
        "program_id": uuid4(),
        "claim_type": "efficacy",
        "claim_text": "Drug X reduces symptom Y by 30%",
        "structured": {"key": "value"},
        "section_ref": "2.7.3",
        "version": 1,
        "status": "active",
        "confidence": 0.95,
        "content_hash": "abc123",
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


def _make_source_row(**overrides):
    defaults = {
        "id": uuid4(),
        "program_id": uuid4(),
        "source_type": "csr",
        "source_ref": "CSR-001",
        "source_uri": "s3://bucket/csr-001.pdf",
        "content_hash": "def456",
        "metadata": {"pages": 150},
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


def _make_support_row(**overrides):
    defaults = {
        "id": uuid4(),
        "claim_id": uuid4(),
        "source_id": uuid4(),
        "support_type": "direct",
        "strength": 0.9,
        "span": "Table 14.2.1",
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


def _make_derivation_row(**overrides):
    defaults = {
        "id": uuid4(),
        "parent_claim_id": uuid4(),
        "child_claim_id": uuid4(),
        "derivation_type": "inference",
        "reasoning": "Derived from Table 14.2.1",
        "model_id": "gpt-4o-2025-01-15",
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


def _make_provenance_row(**overrides):
    defaults = {
        "id": uuid4(),
        "program_id": uuid4(),
        "workflow_run_id": uuid4(),
        "step_run_id": uuid4(),
        "batch_id": "batch-001",
        "event_type": "claim_created",
        "actor": "admin@example.com",
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


def _make_hash_row(**overrides):
    defaults = {
        "id": uuid4(),
        "program_id": uuid4(),
        "entity_type": "claim",
        "entity_id": uuid4(),
        "content_hash": "abc123",
        "prev_hash": None,
        "algorithm": "sha256",
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


def _make_scan_row(**overrides):
    defaults = {
        "id": uuid4(),
        "program_id": uuid4(),
        "scan_type": "full",
        "section_ref": None,
        "status": "completed",
        "total_claims": 5,
        "contradictions_found": 2,
        "results": json.dumps([{"entity_field": "AE:count", "severity": "medium"}]),
        "triggered_by": "manual",
        "actor": "system",
        "error_message": None,
        "started_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
        "completed_at": datetime(2025, 1, 15, 10, 5, 0, tzinfo=timezone.utc),
        "created_at": datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return FakeRecord(defaults)


# =============================================================================
# Import module under test
# =============================================================================

from shadow_service.defense_packet import (
    build_defense_packet,
    _hash_actor,
    _redact_actors,
    _json_serial,
    _to_dicts,
)
from shadow_service import defense_packet as dp


# =============================================================================
# Tests: Helper functions
# =============================================================================

class TestHelpers:
    """Tests for utility functions."""

    def test_json_serial_datetime(self):
        dt = datetime(2025, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        assert _json_serial(dt) == "2025-01-15T10:00:00+00:00"

    def test_json_serial_uuid(self):
        uid = UUID("12345678-1234-5678-1234-567812345678")
        assert _json_serial(uid) == "12345678-1234-5678-1234-567812345678"

    def test_json_serial_unsupported_type(self):
        with pytest.raises(TypeError):
            _json_serial(set())

    def test_hash_actor_deterministic(self):
        result = _hash_actor("admin@example.com")
        expected = hashlib.sha256("admin@example.com".encode()).hexdigest()[:8]
        assert result == expected

    def test_hash_actor_none(self):
        assert _hash_actor(None) == "unknown"

    def test_hash_actor_empty(self):
        assert _hash_actor("") == "unknown"

    def test_redact_actors(self):
        items = [
            {"id": 1, "actor": "alice@test.com"},
            {"id": 2, "actor": "bob@test.com"},
            {"id": 3, "actor": None},
        ]
        result = _redact_actors(items)
        assert result[0]["actor"] == hashlib.sha256("alice@test.com".encode()).hexdigest()[:8]
        assert result[1]["actor"] == hashlib.sha256("bob@test.com".encode()).hexdigest()[:8]
        assert result[2]["actor"] == "unknown"

    def test_to_dicts_converts_records(self):
        rows = [FakeRecord({"a": 1}), FakeRecord({"b": 2})]
        result = _to_dicts(rows)
        assert result == [{"a": 1}, {"b": 2}]
        assert all(isinstance(d, dict) for d in result)


# =============================================================================
# Tests: build_defense_packet
# =============================================================================

class TestBuildDefensePacket:
    """Tests for the main ZIP generator."""

    @pytest.fixture
    def program_id(self):
        return uuid4()

    @pytest.fixture
    def mock_rows(self, program_id):
        """A complete set of mock rows across all 7 tables."""
        return {
            "claims": [_make_claim_row(program_id=program_id)],
            "sources": [_make_source_row(program_id=program_id)],
            "support": [_make_support_row()],
            "derivations": [_make_derivation_row()],
            "provenance": [_make_provenance_row(program_id=program_id, actor="alice@test.com")],
            "hash_ledger": [_make_hash_row(program_id=program_id)],
            "scans": [_make_scan_row(program_id=program_id, actor="system")],
        }

    def _setup_mock_conn(self, mock_rows):
        """Create a mock connection that returns rows based on query."""
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()

        call_count = 0

        async def fake_fetch(query, *args):
            nonlocal call_count
            ordered_keys = ["claims", "sources", "support", "derivations",
                            "provenance", "hash_ledger", "scans"]
            key = ordered_keys[call_count] if call_count < len(ordered_keys) else "claims"
            call_count += 1
            return mock_rows[key]

        mock_conn.fetch = AsyncMock(side_effect=fake_fetch)
        return mock_conn

    @pytest.mark.asyncio
    async def test_zip_contains_expected_files(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            names = set(zf.namelist())

        expected = {
            "manifest.json", "claims.json", "sources.json",
            "support_links.json", "derivations.json", "provenance.json",
            "hash_ledger.json", "scans.json", "summary.json",
        }
        assert names == expected

    @pytest.mark.asyncio
    async def test_manifest_has_sha256_for_all_files(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            manifest = json.loads(zf.read("manifest.json"))

        assert manifest["version"] == "1.0.0"
        assert manifest["program_id"] == str(program_id)
        assert "generated_at" in manifest

        # Every file except manifest itself should have an entry
        for name in ["claims.json", "sources.json", "summary.json"]:
            assert name in manifest["files"]
            assert "sha256" in manifest["files"][name]
            assert "size" in manifest["files"][name]

    @pytest.mark.asyncio
    async def test_manifest_sha256_matches_content(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            manifest = json.loads(zf.read("manifest.json"))
            for name, meta in manifest["files"].items():
                content = zf.read(name)
                actual_hash = hashlib.sha256(content).hexdigest()
                assert actual_hash == meta["sha256"], f"SHA mismatch for {name}"
                assert len(content) == meta["size"], f"Size mismatch for {name}"

    @pytest.mark.asyncio
    async def test_actor_redacted_in_provenance(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            provenance = json.loads(zf.read("provenance.json"))

        # Actor should be hashed, not raw email
        for entry in provenance:
            assert "@" not in entry["actor"], "Actor PII leaked!"
            assert len(entry["actor"]) == 8, "Actor hash should be 8 chars"

    @pytest.mark.asyncio
    async def test_actor_redacted_in_scans(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            scans = json.loads(zf.read("scans.json"))

        for entry in scans:
            assert len(entry["actor"]) == 8

    @pytest.mark.asyncio
    async def test_summary_counts(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            summary = json.loads(zf.read("summary.json"))

        counts = summary["counts"]
        assert counts["claims_total"] == 1
        assert counts["sources"] == 1
        assert counts["support_links"] == 1
        assert counts["derivations"] == 1
        assert counts["provenance_entries"] == 1
        assert counts["hash_ledger_entries"] == 1
        assert counts["scans_total"] == 1
        assert counts["scans_completed"] == 1

    @pytest.mark.asyncio
    async def test_summary_disclosure(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            summary = json.loads(zf.read("summary.json"))

        disc = summary["disclosure"]
        assert "SHA-256" in disc["actor_handling"]
        assert disc["model_ids_included"] is True
        assert disc["raw_data_included"] is False

    @pytest.mark.asyncio
    async def test_empty_program_produces_valid_zip(self, program_id):
        """Edge case: a program with no data should still produce a valid ZIP."""
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        with zipfile.ZipFile(buf, "r") as zf:
            manifest = json.loads(zf.read("manifest.json"))
            summary = json.loads(zf.read("summary.json"))

        assert manifest["program_id"] == str(program_id)
        assert summary["counts"]["claims_total"] == 0
        assert summary["counts"]["sources"] == 0
        assert summary["integrity"]["latest_scan_id"] is None

    @pytest.mark.asyncio
    async def test_connection_released_on_success(self, program_id, mock_rows):
        mock_conn = self._setup_mock_conn(mock_rows)
        release_mock = AsyncMock()

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", release_mock):
            await build_defense_packet(program_id)

        release_mock.assert_awaited_once_with(mock_conn)

    @pytest.mark.asyncio
    async def test_connection_released_on_error(self, program_id):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetch = AsyncMock(side_effect=Exception("DB error"))
        release_mock = AsyncMock()

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", release_mock):
            with pytest.raises(Exception, match="DB error"):
                await build_defense_packet(program_id)

        release_mock.assert_awaited_once_with(mock_conn)

    @pytest.mark.asyncio
    async def test_json_handles_uuid_and_datetime(self, program_id, mock_rows):
        """Ensure UUIDs and datetimes in rows serialize without error."""
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            buf = await build_defense_packet(program_id)

        # Should not raise — all content is valid JSON
        with zipfile.ZipFile(buf, "r") as zf:
            for name in zf.namelist():
                content = zf.read(name)
                json.loads(content)  # Must parse without error

    @pytest.mark.asyncio
    async def test_sets_rls_context(self, program_id, mock_rows):
        """Verify that SET_PROGRAM_CONTEXT is called with the program_id."""
        mock_conn = self._setup_mock_conn(mock_rows)

        from shadow_service import defense_packet as dp
        from shadow_service import sql_evidence as sql
        with patch.object(dp.db, "acquire_connection", return_value=mock_conn), \
             patch.object(dp.db, "release_connection", new_callable=AsyncMock):
            await build_defense_packet(program_id)

        mock_conn.execute.assert_awaited_once_with(sql.SET_PROGRAM_CONTEXT, str(program_id))
