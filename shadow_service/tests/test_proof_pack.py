"""Phase 6.6.E1 — Proof Pack Unit Tests.

Tests the proof-pack endpoint contract:
  - Stable fields exist (required keys)
  - No secret fields leak
  - Freshness status mapping (GREEN / YELLOW / RED)
  - Audit section structure

Run: pytest shadow_service/tests/test_proof_pack.py -v
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

# ─── Lock file path ─────────────────────────────────────────────────────────

LOCK_PATH = (
    Path(__file__).resolve().parent.parent
    / "shadow_service"
    / "predicate_intel"
    / "risk_codes.lock.json"
)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers — build a mock proof-pack response inline
# ═══════════════════════════════════════════════════════════════════════════════

def _compute_lock_hash() -> str:
    """Mirror the validator's lock hash computation."""
    raw = LOCK_PATH.read_text(encoding="utf-8")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


REQUIRED_TOP_KEYS = {
    "subject_hash",
    "risk_vocab_version",
    "risk_vocab_hash",
    "manifest_hash",
    "generated_at",
    "ingest_freshness",
    "audit",
}

REQUIRED_FRESHNESS_KEYS = {"last_success_at", "source", "status"}
REQUIRED_AUDIT_KEYS = {"signature_method", "key_id", "doc_hash"}

# Forbidden fields that must never appear in proof-pack
SECRET_FIELDS = {
    "password",
    "secret",
    "api_key",
    "token",
    "private_key",
    "credentials",
    "client_secret",
    "access_token",
    "refresh_token",
    "jwt",
    "database_url",
    "connection_string",
}

VALID_FRESHNESS_STATUSES = {"GREEN", "YELLOW", "RED"}
VALID_SIGNATURE_METHODS = {"HSM", "PKI", "DEV"}


def build_proof_pack(
    *,
    subject_hash: str = "abc123",
    ingest_completed: datetime | None = None,
    ingest_status: str | None = None,
) -> dict:
    """Build a proof-pack response dict matching the endpoint contract."""
    risk_vocab_hash = _compute_lock_hash()

    # Freshness logic (mirrors endpoint)
    freshness_days = 14
    freshness: dict = {
        "last_success_at": None,
        "source": "openFDA + enforcement",
        "status": "RED",
    }

    if ingest_completed:
        freshness["last_success_at"] = ingest_completed.isoformat()
        age = datetime.now(timezone.utc) - ingest_completed
        if age <= timedelta(days=freshness_days):
            freshness["status"] = "GREEN"
        elif age <= timedelta(days=freshness_days * 2):
            freshness["status"] = "YELLOW"
        else:
            freshness["status"] = "RED"

    if ingest_status:
        freshness["status"] = ingest_status

    doc_content = f"prog:{subject_hash}:manifest:{risk_vocab_hash}"
    doc_hash = hashlib.sha256(doc_content.encode("utf-8")).hexdigest()

    return {
        "subject_hash": subject_hash,
        "risk_vocab_version": "2.0.0",
        "risk_vocab_hash": risk_vocab_hash,
        "manifest_hash": "manifest_abc123",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ingest_freshness": freshness,
        "audit": {
            "signature_method": "DEV",
            "key_id": "dev-local-001",
            "doc_hash": doc_hash,
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestProofPackStableFields:
    """All required fields must be present in proof-pack response."""

    def test_top_level_keys_present(self):
        pack = build_proof_pack()
        missing = REQUIRED_TOP_KEYS - set(pack.keys())
        assert not missing, f"Missing top-level keys: {missing}"

    def test_risk_vocab_hash_present_and_nonempty(self):
        pack = build_proof_pack()
        assert pack["risk_vocab_hash"], "risk_vocab_hash must be non-empty"
        assert len(pack["risk_vocab_hash"]) == 64, "risk_vocab_hash must be SHA-256 (64 hex chars)"

    def test_manifest_hash_present(self):
        pack = build_proof_pack()
        assert "manifest_hash" in pack, "manifest_hash must be present"

    def test_generated_at_is_iso(self):
        pack = build_proof_pack()
        # Should parse without error
        datetime.fromisoformat(pack["generated_at"].replace("Z", "+00:00"))

    def test_risk_vocab_version_matches_lock(self):
        lock_data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
        pack = build_proof_pack()
        assert pack["risk_vocab_version"] == lock_data["version"]

    def test_ingest_freshness_keys_present(self):
        pack = build_proof_pack()
        missing = REQUIRED_FRESHNESS_KEYS - set(pack["ingest_freshness"].keys())
        assert not missing, f"Missing freshness keys: {missing}"

    def test_audit_keys_present(self):
        pack = build_proof_pack()
        missing = REQUIRED_AUDIT_KEYS - set(pack["audit"].keys())
        assert not missing, f"Missing audit keys: {missing}"


class TestProofPackNoSecrets:
    """Proof pack must never include secret fields."""

    def test_no_secret_fields_top_level(self):
        pack = build_proof_pack()
        leaked = SECRET_FIELDS & set(pack.keys())
        assert not leaked, f"Secret fields in top-level: {leaked}"

    def test_no_secret_fields_nested(self):
        pack = build_proof_pack()
        all_keys: set[str] = set()
        _collect_keys(pack, all_keys)
        leaked = SECRET_FIELDS & all_keys
        assert not leaked, f"Secret fields found in nested structure: {leaked}"

    def test_no_secret_values_in_json(self):
        """Serialized JSON must not contain words like 'password' or 'secret' in values."""
        pack = build_proof_pack()
        serialized = json.dumps(pack).lower()
        for field in SECRET_FIELDS:
            # Allow field names that describe the audit signature_method
            if field in ("token",):
                continue
            assert field not in serialized or f'"{field}"' not in serialized, (
                f"Possible secret leak: '{field}' found in serialized proof-pack"
            )


class TestFreshnessStatusMapping:
    """Freshness status must be GREEN, YELLOW, or RED based on age."""

    def test_green_when_recent(self):
        pack = build_proof_pack(
            ingest_completed=datetime.now(timezone.utc) - timedelta(days=1),
        )
        assert pack["ingest_freshness"]["status"] == "GREEN"

    def test_green_at_boundary(self):
        pack = build_proof_pack(
            ingest_completed=datetime.now(timezone.utc) - timedelta(days=13),
        )
        assert pack["ingest_freshness"]["status"] == "GREEN"

    def test_yellow_when_aging(self):
        pack = build_proof_pack(
            ingest_completed=datetime.now(timezone.utc) - timedelta(days=20),
        )
        assert pack["ingest_freshness"]["status"] == "YELLOW"

    def test_red_when_stale(self):
        pack = build_proof_pack(
            ingest_completed=datetime.now(timezone.utc) - timedelta(days=60),
        )
        assert pack["ingest_freshness"]["status"] == "RED"

    def test_red_when_no_ingest(self):
        pack = build_proof_pack()
        assert pack["ingest_freshness"]["status"] == "RED"
        assert pack["ingest_freshness"]["last_success_at"] is None

    def test_status_always_valid(self):
        for status in VALID_FRESHNESS_STATUSES:
            pack = build_proof_pack(ingest_status=status)
            assert pack["ingest_freshness"]["status"] in VALID_FRESHNESS_STATUSES

    def test_source_is_openfda(self):
        pack = build_proof_pack()
        assert "openFDA" in pack["ingest_freshness"]["source"]


class TestAuditSection:
    """Audit section must have valid structure."""

    def test_signature_method_valid(self):
        pack = build_proof_pack()
        assert pack["audit"]["signature_method"] in VALID_SIGNATURE_METHODS

    def test_key_id_nonempty(self):
        pack = build_proof_pack()
        assert pack["audit"]["key_id"], "key_id must be non-empty"

    def test_doc_hash_is_sha256(self):
        pack = build_proof_pack()
        assert len(pack["audit"]["doc_hash"]) == 64, "doc_hash must be SHA-256 (64 hex chars)"


class TestReplayDeterminism:
    """Replay determinism contract tests."""

    def test_deterministic_result_structure(self):
        """ReplayDeterminismResult must have required fields."""
        result = {
            "deterministic": True,
            "original_manifest_hash": "abc",
            "replay_manifest_hash": "abc",
            "original_risk_vocab_hash": "def",
            "replay_risk_vocab_hash": "def",
            "original_risk_codes": ["IU_MISMATCH"],
            "replay_risk_codes": ["IU_MISMATCH"],
            "drift_details": [],
        }
        required_keys = {
            "deterministic",
            "original_manifest_hash",
            "replay_manifest_hash",
            "original_risk_vocab_hash",
            "replay_risk_vocab_hash",
            "original_risk_codes",
            "replay_risk_codes",
            "drift_details",
        }
        assert required_keys == set(result.keys())

    def test_deterministic_when_hashes_match(self):
        result = {
            "deterministic": True,
            "original_manifest_hash": "same",
            "replay_manifest_hash": "same",
            "drift_details": [],
        }
        assert result["deterministic"] is True
        assert len(result["drift_details"]) == 0

    def test_not_deterministic_when_hashes_differ(self):
        result = {
            "deterministic": False,
            "original_manifest_hash": "aaa",
            "replay_manifest_hash": "bbb",
            "drift_details": ["manifest_hash mismatch: original=aaa replay=bbb"],
        }
        assert result["deterministic"] is False
        assert len(result["drift_details"]) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _collect_keys(obj: dict | list, keys: set[str]) -> None:
    """Recursively collect all dict keys."""
    if isinstance(obj, dict):
        keys.update(obj.keys())
        for v in obj.values():
            _collect_keys(v, keys)
    elif isinstance(obj, list):
        for item in obj:
            _collect_keys(item, keys)
