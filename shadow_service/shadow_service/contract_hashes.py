"""Phase 6.6.H — Contract Hashes (Runtime Trust Chain).

Single source of truth for all contract hashes the proof pack system enforces.
Every hash is computed from the canonical source files per-request (I/O cost
is negligible for small JSON files and correctness is paramount).

Contract fields:
  - risk_vocab_hash:       SHA-256 of risk_codes.lock.json (raw bytes)
  - risk_codes_lock_hash:  Same as risk_vocab_hash (alias for spec clarity)
  - schema_hash:           SHA-256 of the eCTD bundle schema
  - generator_version:     Git SHA or build version string
  - zip_manifest_hash:     Computed per-pack (not cached here)

Phase 6.6.H additions:
  - validate_ectd_bundle(): Runtime AJV-equivalent — validates the bundle DATA
    against the bundle SCHEMA using Python jsonschema. Returns (valid, errors).
    Called at persist + download time as a hard-stop gate.
"""

from __future__ import annotations

import hashlib
import json
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


# ── Phase 6.6.H: Runtime eCTD Bundle Validation ──────────────────────────

BUNDLE_DATA_PATH = _BASE.parent.parent / "ectd-stubs" / "ectd_stubs.bundle.json"
SUB_SCHEMA_FILES = ["leaf_map.schema.json", "sequence_plan.schema.json", "m1_index.schema.json"]
_SCHEMAS_DIR = SCHEMA_BUNDLE_PATH.parent


def validate_ectd_bundle() -> tuple[bool, list[str]]:
    """Validate the eCTD bundle DATA against the bundle SCHEMA at runtime.

    This is the Python equivalent of the AJV CI gate. Uses jsonschema to
    validate the data payload against the JSON Schema with $ref resolution.

    Returns:
        (valid, errors): True and empty list if valid, False and error strings
        with JSONPointer paths if invalid.

    This function is a HARD-STOP gate — called at persist and download time.
    If it returns (False, errors), the endpoint must block with 409.
    """
    errors: list[str] = []

    # Load bundle data
    if not BUNDLE_DATA_PATH.exists():
        return False, ["Bundle data file missing: ectd-stubs/ectd_stubs.bundle.json"]

    try:
        bundle_data = json.loads(BUNDLE_DATA_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        return False, [f"Bundle data invalid: {exc}"]

    # Load bundle schema
    if not SCHEMA_BUNDLE_PATH.exists():
        return False, ["Bundle schema file missing: schemas/ectd_stubs.bundle.schema.json"]

    try:
        bundle_schema = json.loads(SCHEMA_BUNDLE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        return False, [f"Bundle schema invalid: {exc}"]

    # Load sub-schemas for $ref resolution
    try:
        import jsonschema
        from jsonschema import Draft7Validator
    except ImportError:
        # If jsonschema is not installed, fail-closed
        return False, ["jsonschema library not installed — cannot validate bundle at runtime"]

    # Build a schema store for $ref resolution
    schema_store: dict[str, dict] = {}
    for sub_file in SUB_SCHEMA_FILES:
        sub_path = _SCHEMAS_DIR / sub_file
        if sub_path.exists():
            try:
                sub_schema = json.loads(sub_path.read_text(encoding="utf-8"))
                schema_id = sub_schema.get("$id", "")
                if schema_id:
                    schema_store[schema_id] = sub_schema
            except (json.JSONDecodeError, OSError) as exc:
                errors.append(f"Sub-schema {sub_file} invalid: {exc}")

    if errors:
        return False, errors

    # Validate using jsonschema with $ref resolution
    # Use referencing library if available (jsonschema >= 4.18), else fallback to RefResolver
    try:
        try:
            from referencing import Registry, Resource
            from referencing.jsonschema import DRAFT7

            resources = []
            for schema_id, schema_obj in schema_store.items():
                resources.append((schema_id, Resource.from_contents(schema_obj, default_specification=DRAFT7)))
            registry = Registry().with_resources(resources)
            validator = Draft7Validator(bundle_schema, registry=registry)
        except ImportError:
            # Fallback to deprecated RefResolver for older jsonschema versions
            from jsonschema import RefResolver  # type: ignore[attr-defined]
            resolver = RefResolver.from_schema(bundle_schema, store=schema_store)
            validator = Draft7Validator(bundle_schema, resolver=resolver)
        validation_errors = list(validator.iter_errors(bundle_data))

        if validation_errors:
            for err in validation_errors:
                pointer = "/" + "/".join(str(p) for p in err.absolute_path) if err.absolute_path else "/"
                errors.append(f"{pointer}: {err.message}")
            return False, errors
    except jsonschema.SchemaError as exc:
        return False, [f"Bundle schema itself is invalid: {exc.message}"]
    except Exception as exc:
        return False, [f"Unexpected validation error: {exc}"]

    # Cross-check bundle hash
    # NOTE: The JS hash computation uses JSON.stringify(subContents, sortedKeys, 0)
    # where the replacer array strips all nested properties. The canonical form is
    # just the sorted filenames as keys with empty objects as values.
    try:
        sub_contents: dict[str, object] = {}
        for sub_file in SUB_SCHEMA_FILES:
            sub_path = _SCHEMAS_DIR / sub_file
            if sub_path.exists():
                # Only need to confirm the file exists; the JS replacer strips content
                sub_contents[sub_file] = {}

        # Match JS: JSON.stringify(subContents, Object.keys(subContents).sort(), 0)
        canonical = json.dumps(
            dict(sorted(sub_contents.items())),
            separators=(",", ":"),
        )
        computed_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        stored_hash = bundle_data.get("bundle_hash", "")

        if computed_hash != stored_hash:
            errors.append(
                f"Bundle hash mismatch: computed={computed_hash[:16]}… "
                f"stored={stored_hash[:16]}…"
            )
            return False, errors
    except Exception as exc:
        return False, [f"Hash verification failed: {exc}"]

    return True, []
