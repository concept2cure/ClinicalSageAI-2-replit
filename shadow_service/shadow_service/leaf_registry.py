"""Phase 6.6.H — Leaf Registry.

Single manifest of every leaf in a proof-pack submission.
Each entry records the leaf's relative path, checksum, title,
lifecycle operation, and module placement.

The registry is built from the leaf_map + sequence_plan from
the eCTD stubs bundle and the actual artifact bytes.
It is the authoritative source for downstream assembly tooling.

Hard rule: Everything is driven from the same manifest + contract snapshot.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def build_leaf_registry(
    *,
    leaf_map: dict[str, Any],
    sequence_plan: dict[str, Any],
    artifacts: dict[str, bytes] | None = None,
    contract_snapshot: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a Leaf Registry manifest from leaf_map + sequence_plan.

    Args:
        leaf_map:           The leaf_map section from the eCTD bundle data.
        sequence_plan:      The sequence_plan section from the eCTD bundle data.
        artifacts:          Optional map of leaf_id or artifact_path → bytes.
                            Used to compute checksums and sizes.
        contract_snapshot:  Optional contract snapshot for traceability.

    Returns:
        Dict representing the registry manifest:
        {
            "version": "1.0.0",
            "generated_at": "ISO timestamp",
            "sequence_number": "0000",
            "submission_type": "510k",
            "contract_snapshot": {...},
            "total_leaves": N,
            "leaves": [
                {
                    "leaf_id": "m4-2-1-se-matrix",
                    "title": "Substantial Equivalence Matrix",
                    "module": 4,
                    "section": "4.2.1",
                    "artifact_path": "proof-pack/outputs/se_matrix_payload.json",
                    "checksum_sha256": "abc123...",
                    "size_bytes": 1234,
                    "lifecycle_operation": "new",
                    "mime_type": "application/json",
                    "has_content": true
                },
                ...
            ]
        }
    """
    artifacts = artifacts or {}

    # Build ops lookup: leaf_id → operation
    ops_by_leaf: dict[str, str] = {}
    for op in sequence_plan.get("lifecycle_operations", []):
        ops_by_leaf[op["leaf_id"]] = op["operation"]

    leaves: list[dict[str, Any]] = []
    for leaf in leaf_map.get("leaves", []):
        leaf_id = leaf["leaf_id"]
        artifact_path = leaf.get("artifact_path", "")

        # Resolve artifact bytes
        content: bytes | None = None
        if leaf_id in artifacts:
            content = artifacts[leaf_id]
        elif artifact_path in artifacts:
            content = artifacts[artifact_path]

        entry: dict[str, Any] = {
            "leaf_id": leaf_id,
            "title": leaf.get("title", ""),
            "module": leaf["module"],
            "section": leaf["section"],
            "artifact_path": artifact_path,
            "checksum_sha256": _sha256(content) if content else None,
            "size_bytes": len(content) if content else 0,
            "lifecycle_operation": ops_by_leaf.get(leaf_id, "unknown"),
            "mime_type": leaf.get("mime_type", "application/octet-stream"),
            "has_content": content is not None,
        }
        leaves.append(entry)

    # Sort deterministically by module then section
    leaves.sort(key=lambda e: (e["module"], e["section"], e["leaf_id"]))

    registry: dict[str, Any] = {
        "version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sequence_number": sequence_plan.get("sequence_number", "0000"),
        "submission_type": sequence_plan.get("submission_type", "510k"),
        "contract_snapshot": contract_snapshot or {},
        "total_leaves": len(leaves),
        "leaves": leaves,
    }

    logger.info(
        "Leaf registry: built %d leaves for sequence %s",
        len(leaves), registry["sequence_number"],
    )
    return registry


def verify_leaf_registry(
    registry: dict[str, Any],
    artifacts: dict[str, bytes],
) -> tuple[bool, list[str]]:
    """Verify a leaf registry against actual artifact bytes.

    Checks:
    1. Every leaf with has_content=True has a matching artifact
    2. Every artifact's checksum matches the registry
    3. No extra artifacts exist that aren't in the registry

    Returns:
        (all_ok, errors): True + [] if valid, False + error list if not.
    """
    errors: list[str] = []
    registry_paths: set[str] = set()

    for leaf in registry.get("leaves", []):
        leaf_id = leaf["leaf_id"]
        artifact_path = leaf.get("artifact_path", "")
        expected_hash = leaf.get("checksum_sha256")

        if leaf.get("has_content"):
            # Must have matching artifact
            content = artifacts.get(leaf_id) or artifacts.get(artifact_path)
            if content is None:
                errors.append(f"Leaf {leaf_id}: has_content=True but artifact not found")
                continue

            actual_hash = _sha256(content)
            if expected_hash and actual_hash != expected_hash:
                errors.append(
                    f"Leaf {leaf_id}: checksum mismatch "
                    f"(expected={expected_hash[:16]}… actual={actual_hash[:16]}…)"
                )

            actual_size = len(content)
            expected_size = leaf.get("size_bytes", 0)
            if actual_size != expected_size:
                errors.append(
                    f"Leaf {leaf_id}: size mismatch "
                    f"(expected={expected_size} actual={actual_size})"
                )

        registry_paths.add(leaf_id)
        if artifact_path:
            registry_paths.add(artifact_path)

    # Check for extra artifacts not in registry
    all_keys = set(artifacts.keys())
    extra = all_keys - registry_paths
    for extra_key in sorted(extra):
        errors.append(f"Extra artifact not in registry: {extra_key}")

    return len(errors) == 0, errors
