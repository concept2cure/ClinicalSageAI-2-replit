"""Regulatory Intelligence Manifest Builder — Phase 6.6.C2.

Deterministic, hashable manifest for SE Matrix payloads.
Enables Part 11 audit, downstream eCTD traceability, and Truth Machine linkage.

All hash functions produce stable output: same input → same hash, always.
No network, no DB, no time-based logic in hashing functions.

Usage:
    from shadow_service.predicate_intel.manifest import build_manifest

    manifest = build_manifest(
        program_id="...",
        product_code="...",
        subject_device={...},
        predicate_k_number="K123456",
        risk_codes_used=["IU_MISMATCH", "MATERIAL_CHANGE"],
        evidence_task_ids=["abc123def456"],
        defense_readiness_score=65,
        top_risks=["IU_MISMATCH"],
        generated_at="2025-01-24T12:00:00Z",
    )
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from typing import Any

from ..scoring.risk_code_map import RISK_CODE_MAP_VERSION, RiskCode

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────

_VOCAB_PATH = pathlib.Path(__file__).parent / "risk_vocab.yml"
_LOCK_PATH = pathlib.Path(__file__).parent / "risk_codes.lock.json"

# Generator version — bump on any change to manifest logic
GENERATOR_VERSION = "6.6.C2"


# ─────────────────────────────────────────────────────────────────────────────
# Hash helpers (all deterministic, all pure)
# ─────────────────────────────────────────────────────────────────────────────

def _sha256_hex(data: bytes) -> str:
    """Full SHA-256 hex digest."""
    return hashlib.sha256(data).hexdigest()


def _sha256_short(data: bytes, length: int = 12) -> str:
    """Truncated SHA-256 hex digest."""
    return _sha256_hex(data)[:length]


def _canonical_json(obj: Any) -> str:
    """Canonical JSON: sorted keys, no whitespace, no trailing newline."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def compute_risk_vocab_hash(path: str | pathlib.Path | None = None) -> str:
    """SHA-256[:12] of risk_vocab.yml bytes.

    Deterministic: same file → same hash, always.
    """
    target = pathlib.Path(path) if path else _VOCAB_PATH
    return _sha256_short(target.read_bytes())


def compute_subject_hash(subject_device: dict[str, Any]) -> str:
    """SHA-256[:12] of canonical JSON of subject_device.

    Stable: sorted keys, no whitespace.
    """
    return _sha256_short(_canonical_json(subject_device).encode("utf-8"))


def compute_manifest_hash(manifest_dict: dict[str, Any]) -> str:
    """SHA-256 of canonical JSON of manifest (excluding non-deterministic fields).

    Per spec: generated_at is excluded so the hash is stable for the same
    logical manifest.  manifest_hash itself is excluded to avoid circular
    self-reference (the placeholder "" would leak into the digest).
    """
    _EXCLUDED = {"generated_at", "manifest_hash"}
    hashable = {k: v for k, v in manifest_dict.items() if k not in _EXCLUDED}
    return _sha256_hex(_canonical_json(hashable).encode("utf-8"))


def load_lock_file(path: str | pathlib.Path | None = None) -> dict[str, Any]:
    """Load the canonical risk_codes.lock.json file."""
    target = pathlib.Path(path) if path else _LOCK_PATH
    with open(target, "r") as f:
        return json.load(f)


def validate_lock_file_codes() -> bool:
    """Validate that risk_codes.lock.json matches the Python RiskCode enum."""
    lock = load_lock_file()
    lock_codes = set(lock["risk_codes"])
    enum_codes = {rc.value for rc in RiskCode}
    return lock_codes == enum_codes


# ─────────────────────────────────────────────────────────────────────────────
# Canonical ordering
# ─────────────────────────────────────────────────────────────────────────────

# Fixed canonical order (same as RiskCode enum declaration order).
# Used for stable sorting of risk_codes_used to prevent snapshot churn.
CANONICAL_RISK_CODE_ORDER: list[str] = [rc.value for rc in RiskCode]

_CANONICAL_INDEX: dict[str, int] = {
    code: idx for idx, code in enumerate(CANONICAL_RISK_CODE_ORDER)
}


def canonical_sort(codes: list[str]) -> list[str]:
    """Sort risk codes in canonical (enum declaration) order."""
    return sorted(codes, key=lambda c: _CANONICAL_INDEX.get(c, 999))


# ─────────────────────────────────────────────────────────────────────────────
# Top risks extractor
# ─────────────────────────────────────────────────────────────────────────────

def extract_top_risks(
    risk_codes_used: list[str],
    severity_map: dict[str, str],
    max_count: int = 5,
) -> list[str]:
    """Extract the top N risk codes by severity (HIGH first), then canonical order.

    Args:
        risk_codes_used: All triggered risk codes (deduped, canonical sorted).
        severity_map: risk_code → severity string mapping.
        max_count: Maximum number of top risks to return.

    Returns:
        Up to max_count risk codes, highest severity first.
    """
    _SEV_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    scored = sorted(
        risk_codes_used,
        key=lambda c: (
            _SEV_ORDER.get(severity_map.get(c, "MEDIUM"), 9),
            _CANONICAL_INDEX.get(c, 999),
        ),
    )
    return scored[:max_count]


# ─────────────────────────────────────────────────────────────────────────────
# Manifest builder
# ─────────────────────────────────────────────────────────────────────────────

def build_manifest(
    *,
    program_id: str,
    product_code: str,
    subject_device: dict[str, Any],
    predicate_k_number: str,
    risk_codes_used: list[str],
    evidence_task_ids: list[str],
    defense_readiness_score: int,
    top_risks: list[str],
    generated_at: str,
) -> dict[str, Any]:
    """Build a deterministic RegulatoryIntelManifest dict.

    All hash fields are computed from inputs — no external state.

    Args:
        program_id: Regulatory program ID.
        product_code: FDA product code.
        subject_device: Subject device characteristics dict.
        predicate_k_number: Predicate K-number.
        risk_codes_used: Union of all triggered risk codes (canonical sorted).
        evidence_task_ids: Stable-ordered task IDs.
        defense_readiness_score: 0-100 readiness score.
        top_risks: Highest severity risk codes (max 5).
        generated_at: ISO UTC timestamp string.

    Returns:
        Dict matching RegulatoryIntelManifest schema.
    """
    subject_hash = compute_subject_hash(subject_device)
    risk_vocab_hash = compute_risk_vocab_hash()

    manifest = {
        "subject_hash": subject_hash,
        "program_id": program_id,
        "product_code": product_code,
        "predicate_k_number": predicate_k_number,
        "generator_version": GENERATOR_VERSION,
        "risk_code_map_version": RISK_CODE_MAP_VERSION,
        "risk_vocab_hash": risk_vocab_hash,
        "manifest_hash": "",  # placeholder; computed below
        "generated_at": generated_at,
        "risk_codes_used": risk_codes_used,
        "evidence_task_ids": evidence_task_ids,
        "defense_readiness_score": defense_readiness_score,
        "top_risks": top_risks,
    }

    # Compute manifest_hash (excludes generated_at per spec)
    manifest["manifest_hash"] = compute_manifest_hash(manifest)

    return manifest
