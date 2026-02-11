"""Phase 6.6.G — Contract Hashes (Runtime Trust Chain).

Single source of truth for all contract hashes the proof pack system enforces.
Every hash is computed lazily from the canonical source files and cached for the
lifetime of the process.

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
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

logger = logging.getLogger(__name__)

# ── Paths (resolved relative to this module) ──────────────────────────────
_BASE = Path(__file__).resolve().parent

LOCK_FILE_PATH = _BASE / "predicate_intel" / "risk_codes.lock.json"
SCHEMA_BUNDLE_PATH = _BASE.parent.parent / "schemas" / "ectd_stubs.bundle.schema.json"
RISK_VOCAB_PATH = LOCK_FILE_PATH  # alias — they are the same file


class ContractSnapshot(TypedDict):
    risk_vocab_hash: str
    risk_codes_lock_hash: str
    schema_hash: str
    generator_version: str


# ── Hash computation ──────────────────────────────────────────────────────

def _sha256_file(path: Path) -> str:
    """SHA-256 of a file's raw bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


@lru_cache(maxsize=1)
def compute_risk_vocab_hash() -> str:
    """SHA-256 of risk_codes.lock.json."""
    if not LOCK_FILE_PATH.exists():
        logger.error("risk_codes.lock.json not found at %s", LOCK_FILE_PATH)
        return "MISSING"
    return _sha256_file(LOCK_FILE_PATH)


@lru_cache(maxsize=1)
def compute_schema_hash() -> str:
    """SHA-256 of the eCTD bundle schema. Returns 'NONE' if file doesn't exist yet."""
    if not SCHEMA_BUNDLE_PATH.exists():
        return "NONE"
    return _sha256_file(SCHEMA_BUNDLE_PATH)


@lru_cache(maxsize=1)
def compute_generator_version() -> str:
    """Git short SHA or fallback to env/build version."""
    # Try environment variable first (set in CI/CD)
    env_version = os.environ.get("GENERATOR_VERSION") or os.environ.get("GIT_SHA")
    if env_version:
        return env_version

    # Try git
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=str(_BASE),
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass

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
    """
    current = get_contract_snapshot()
    mismatches: list[dict[str, str]] = []

    for field in ("risk_vocab_hash", "risk_codes_lock_hash", "schema_hash", "generator_version"):
        stored_val = stored.get(field, "")  # type: ignore[arg-type]
        current_val = current[field]  # type: ignore[literal-required]
        if stored_val and current_val and stored_val != current_val:
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
    """
    if not reason_codes:
        return "NONE"

    codes = set(reason_codes)
    if codes & HIGH_DRIFT_CODES:
        return "HIGH"
    if codes & MED_DRIFT_CODES:
        return "MED"
    if codes & LOW_DRIFT_CODES:
        return "LOW"
    # Unknown codes default to MED (safe)
    return "MED"


def should_block_download(drift_severity: str) -> bool:
    """Server-authoritative: block_download = severity === HIGH."""
    return drift_severity == "HIGH"
