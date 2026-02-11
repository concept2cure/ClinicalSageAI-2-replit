"""Phase 6.6.G — Contract Hashes (Runtime Trust Chain).

Single source of truth for all contract hashes the proof pack system enforces.
Every hash is computed from the canonical source files per-request (I/O cost
is negligible for small JSON files and correctness is paramount).

Contract fields:
  - risk_vocab_hash:       SHA-256 of risk_codes.lock.json (raw bytes)
  - risk_codes_lock_hash:  Same as risk_vocab_hash (alias for spec clarity)
  - schema_hash:           SHA-256 of the eCTD bundle schema
  - generator_version:     Git SHA or build version string
  - zip_manifest_hash:     Computed per-pack (not cached here)
"""

from __future__ import annotations

import hashlib
import logging
import os
import subprocess
from pathlib import Path
from typing import TypedDict

logger = logging.getLogger(__name__)

# ── Paths (resolved relative to this module) ──────────────────────────────
_BASE = Path(__file__).resolve().parent

LOCK_FILE_PATH = _BASE / "predicate_intel" / "risk_codes.lock.json"
SCHEMA_BUNDLE_PATH = _BASE.parent.parent / "schemas" / "ectd_stubs.bundle.schema.json"
RISK_VOCAB_PATH = LOCK_FILE_PATH  # alias — they are the same file

# Sentinel values — treated as mismatches in check_contract_mismatch
_SENTINEL_MISSING = "__MISSING__"
_SENTINEL_NOT_DEPLOYED = "__NOT_DEPLOYED__"


class ContractSnapshot(TypedDict):
    risk_vocab_hash: str
    risk_codes_lock_hash: str
    schema_hash: str
    generator_version: str


# ── Hash computation ──────────────────────────────────────────────────────

def _sha256_file(path: Path) -> str:
    """SHA-256 of a file's raw bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compute_risk_vocab_hash() -> str:
    """SHA-256 of risk_codes.lock.json. Raises if file is missing in production."""
    if not LOCK_FILE_PATH.exists():
        logger.error("risk_codes.lock.json not found at %s", LOCK_FILE_PATH)
        if os.environ.get("ENV", "dev") in ("production", "staging"):
            raise RuntimeError(
                f"CRITICAL: risk_codes.lock.json missing at {LOCK_FILE_PATH}. "
                "Contract trust chain cannot be established without this file."
            )
        return _SENTINEL_MISSING
    return _sha256_file(LOCK_FILE_PATH)


def compute_schema_hash() -> str:
    """SHA-256 of the eCTD bundle schema."""
    if not SCHEMA_BUNDLE_PATH.exists():
        logger.warning("eCTD bundle schema not found at %s", SCHEMA_BUNDLE_PATH)
        return _SENTINEL_NOT_DEPLOYED
    return _sha256_file(SCHEMA_BUNDLE_PATH)


def compute_generator_version() -> str:
    """Git short SHA or fallback to env/build version."""
    # Try environment variable first (set in CI/CD)
    env_version = os.environ.get("GENERATOR_VERSION") or os.environ.get("GIT_SHA")
    if env_version:
        return env_version

    # Try git (only in dev — containers may not have .git)
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            capture_output=True,
            text=True,
            timeout=3,
            cwd=str(_BASE),
        )
        if result.returncode == 0:
            sha = result.stdout.strip()
            if sha:
                return sha
    except Exception as exc:
        logger.debug("git rev-parse failed (expected in containers): %s", exc)

    return "6.6.G-dev"


def get_contract_snapshot() -> ContractSnapshot:
    """Return all current contract hashes as a frozen snapshot."""
    risk_hash = compute_risk_vocab_hash()
    return ContractSnapshot(
        risk_vocab_hash=risk_hash,
        risk_codes_lock_hash=risk_hash,  # same file, different semantic name
        schema_hash=compute_schema_hash(),
        generator_version=compute_generator_version(),
    )


def check_contract_mismatch(
    stored: ContractSnapshot,
) -> list[dict[str, str]]:
    """Compare stored contract hashes against current runtime.

    Returns a list of mismatches: [{"field": ..., "expected": ..., "actual": ...}].
    Empty list means all hashes match.

    Sentinel values (_SENTINEL_MISSING, _SENTINEL_NOT_DEPLOYED) always trigger
    a mismatch report — they explicitly indicate the contract file is absent
    and should never silently compare equal.
    """
    current = get_contract_snapshot()
    mismatches: list[dict[str, str]] = []

    _sentinels = {_SENTINEL_MISSING, _SENTINEL_NOT_DEPLOYED, ""}

    for field in ("risk_vocab_hash", "risk_codes_lock_hash", "schema_hash", "generator_version"):
        stored_val = stored.get(field, "")  # type: ignore[arg-type]
        current_val = current[field]  # type: ignore[literal-required]

        # A sentinel on either side is always a mismatch (fail-closed)
        if stored_val in _sentinels or current_val in _sentinels:
            if stored_val != current_val:
                mismatches.append({
                    "field": field,
                    "expected": stored_val,
                    "actual": current_val,
                })
            continue

        if stored_val != current_val:
            mismatches.append({
                "field": field,
                "expected": stored_val,
                "actual": current_val,
            })

    return mismatches


# ── Drift severity mapping (spec §3 — locked, no bikeshedding) ───────────

# HIGH → blocks download
HIGH_DRIFT_CODES = frozenset({
    "CONTRACT_CHANGED",
    "RISK_CODES_CHANGED",
    "MANIFEST_CHANGED",
})

# MED → warn only
MED_DRIFT_CODES = frozenset({
    "TASKS_CHANGED",
    "READINESS_CHANGED",
})

# LOW → informational
LOW_DRIFT_CODES = frozenset({
    "ORDERING_CHANGED",
    "LABEL_CHANGED",
})


def compute_drift_severity(reason_codes: list[str]) -> str:
    """Deterministic drift severity from reason codes.

    Returns: 'HIGH' | 'MED' | 'LOW' | 'NONE'
    Unknown codes default to HIGH (fail-closed for regulatory safety).
    """
    if not reason_codes:
        return "NONE"

    codes = set(reason_codes)
    if codes & HIGH_DRIFT_CODES:
        return "HIGH"

    # Unknown codes → HIGH (fail-closed in a regulated context)
    unknown = codes - HIGH_DRIFT_CODES - MED_DRIFT_CODES - LOW_DRIFT_CODES
    if unknown:
        logger.warning("Unknown drift reason codes treated as HIGH: %s", unknown)
        return "HIGH"

    if codes & MED_DRIFT_CODES:
        return "MED"
    if codes & LOW_DRIFT_CODES:
        return "LOW"

    return "NONE"


def should_block_download(drift_severity: str) -> bool:
    """Server-authoritative: block_download = severity === HIGH."""
    return drift_severity == "HIGH"
