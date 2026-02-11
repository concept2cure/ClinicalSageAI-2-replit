"""Gate 2 — Runtime Risk-Code Contract Validator.

Runs on FastAPI startup to guarantee zero drift between:
  1. risk_codes.lock.json  (the canonical lock)
  2. scoring.risk_code_map  (Python runtime maps)
  3. SIGNIFICANT_RISK_CODES  (Python set)

If any check fails the service logs a CRITICAL error and raises
``SystemExit`` — the app must NOT serve with a broken contract.

Phase 6.6.C — Zero Drift Enforcement
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Lock file path (resolved relative to this module) ──────────────────────
_LOCK_PATH = (
    Path(__file__).resolve().parent.parent
    / "predicate_intel"
    / "risk_codes.lock.json"
)


class RiskCodeContractError(Exception):
    """Raised when the risk-code contract is violated at startup."""


def _load_lock() -> dict:
    """Load and parse the canonical lock file."""
    if not _LOCK_PATH.exists():
        raise RiskCodeContractError(
            f"Lock file not found: {_LOCK_PATH}"
        )
    with open(_LOCK_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _compute_lock_hash() -> str:
    """SHA-256 of the raw lock file (matches TS generator output)."""
    raw = _LOCK_PATH.read_text(encoding="utf-8")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def validate_risk_code_contract() -> dict:
    """Validate the risk-code contract at startup.

    Returns a summary dict for logging.
    Raises RiskCodeContractError on any mismatch.
    """
    # Late imports to avoid circular deps at module scope
    from ..scoring.risk_code_map import (
        ALL_RISK_CODES,
        RISK_CODE_DISCUSSION_TEMPLATE,
        RISK_CODE_LABELS,
        RISK_CODE_MAP_VERSION,
        RISK_CODE_SEVERITY_DEFAULT,
        RISK_CODE_TO_ARTIFACTS,
        RISK_CODE_TO_CATEGORY,
        SIGNIFICANT_RISK_CODES,
    )

    lock = _load_lock()
    lock_codes = set(lock["risk_codes"])
    lock_significant = set(lock["significant_risk_codes"])
    lock_version = lock.get("version")
    lock_hash = _compute_lock_hash()

    errors: list[str] = []

    # ── 1. Exact count match ───────────────────────────────────────────────
    if len(lock["risk_codes"]) != len(ALL_RISK_CODES):
        errors.append(
            f"Count mismatch: lock has {len(lock['risk_codes'])} codes, "
            f"ALL_RISK_CODES has {len(ALL_RISK_CODES)}"
        )

    # ── 2. Exact set match ─────────────────────────────────────────────────
    py_codes = set(ALL_RISK_CODES)
    if lock_codes != py_codes:
        missing = lock_codes - py_codes
        extra = py_codes - lock_codes
        if missing:
            errors.append(f"Missing from Python: {sorted(missing)}")
        if extra:
            errors.append(f"Extra in Python (not in lock): {sorted(extra)}")

    # ── 3. Version match ───────────────────────────────────────────────────
    if lock_version and lock_version != RISK_CODE_MAP_VERSION:
        errors.append(
            f"Version mismatch: lock={lock_version}, "
            f"RISK_CODE_MAP_VERSION={RISK_CODE_MAP_VERSION}"
        )

    # ── 4. Significant set match ───────────────────────────────────────────
    py_significant = set(SIGNIFICANT_RISK_CODES)
    if lock_significant != py_significant:
        errors.append(
            f"SIGNIFICANT mismatch: lock={sorted(lock_significant)}, "
            f"Python={sorted(py_significant)}"
        )

    # ── 5. Templates coverage ──────────────────────────────────────────────
    missing_templates = lock_codes - set(RISK_CODE_DISCUSSION_TEMPLATE.keys())
    if missing_templates:
        errors.append(
            f"Missing discussion templates: {sorted(missing_templates)}"
        )

    # ── 6. Labels coverage ─────────────────────────────────────────────────
    missing_labels = lock_codes - set(RISK_CODE_LABELS.keys())
    if missing_labels:
        errors.append(f"Missing labels: {sorted(missing_labels)}")

    # ── 7. Severity coverage ──────────────────────────────────────────────
    missing_severity = lock_codes - set(RISK_CODE_SEVERITY_DEFAULT.keys())
    if missing_severity:
        errors.append(f"Missing severity defaults: {sorted(missing_severity)}")

    # ── 8. Category coverage ──────────────────────────────────────────────
    missing_category = lock_codes - set(RISK_CODE_TO_CATEGORY.keys())
    if missing_category:
        errors.append(f"Missing category mapping: {sorted(missing_category)}")

    # ── 9. Artifact coverage ──────────────────────────────────────────────
    missing_artifacts = lock_codes - set(RISK_CODE_TO_ARTIFACTS.keys())
    if missing_artifacts:
        errors.append(f"Missing artifact mapping: {sorted(missing_artifacts)}")

    # ── Report ────────────────────────────────────────────────────────────
    summary = {
        "lock_version": lock_version,
        "lock_hash": lock_hash,
        "risk_code_count": len(lock["risk_codes"]),
        "significant_count": len(lock["significant_risk_codes"]),
        "map_version": RISK_CODE_MAP_VERSION,
        "errors": errors,
        "status": "FAIL" if errors else "PASS",
    }

    if errors:
        for e in errors:
            logger.critical("Risk-code contract violation: %s", e)
        raise RiskCodeContractError(
            f"Risk-code contract failed with {len(errors)} error(s): "
            + "; ".join(errors)
        )

    logger.info(
        "Risk-code contract validated: %d codes, %d significant, "
        "version=%s, hash=%s",
        summary["risk_code_count"],
        summary["significant_count"],
        summary["lock_version"],
        summary["lock_hash"][:12],
    )
    return summary
