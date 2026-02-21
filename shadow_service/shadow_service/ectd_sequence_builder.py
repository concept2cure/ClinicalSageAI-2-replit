"""Phase 6.6.H — eCTD Sequence Builder v0.

Builds the ``sequence/0000/`` folder layout for an initial eCTD submission.
All content is driven from the leaf_map + sequence_plan from the
ectd-stubs bundle — never from ad-hoc constants.

Folder Layout (inside the proof-pack ZIP):
    sequence/0000/
        index.xml           — stub regional index
        m1/
            us/             — regional admin stubs
                cover-letter.placeholder
        m4/
            4-2-1/          — SE matrix output
            4-2-2/          — defense packet
        m5/
            5-1-1/          — toxicity profile
            5-1-2/          — lineage graph

Hard rule: Everything is driven from the manifest + contract snapshot.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _canonical_json(obj: Any) -> str:
    """Produce canonical sorted JSON for deterministic hashing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _module_subdir(section: str) -> str:
    """Convert a section like '4.2.1' to a path segment like '4-2-1'."""
    return section.replace(".", "-")


def build_sequence_0000(
    *,
    leaf_map: dict[str, Any],
    sequence_plan: dict[str, Any],
    m1_index: dict[str, Any] | None = None,
    contract_snapshot: dict[str, str] | None = None,
    artifacts: dict[str, bytes] | None = None,
) -> dict[str, bytes]:
    """Build the sequence/0000/ folder layout as a dict of relative paths → bytes.

    Args:
        leaf_map:           The leaf_map section from the eCTD bundle data.
        sequence_plan:      The sequence_plan section from the eCTD bundle data.
        m1_index:           Optional m1_index section for Module 1 entries.
        contract_snapshot:  Optional contract snapshot to embed in the sequence.
        artifacts:          Optional map of leaf_id → artifact bytes.
                            Missing artifacts get a placeholder stub.

    Returns:
        Dict mapping relative paths (e.g. "sequence/0000/m4/4-2-1/se_matrix_payload.json")
        to their bytes content. These are ready to be added to a ZIP.
    """
    artifacts = artifacts or {}
    seq_num = sequence_plan.get("sequence_number", "0000")
    seq_type = sequence_plan.get("sequence_type", "initial")
    submission_type = sequence_plan.get("submission_type", "510k")
    prefix = f"sequence/{seq_num}"

    files: dict[str, bytes] = {}

    # ── Lay out leaves per lifecycle_operations ──
    leaves_by_id: dict[str, dict[str, Any]] = {}
    for leaf in leaf_map.get("leaves", []):
        leaves_by_id[leaf["leaf_id"]] = leaf

    for op in sequence_plan.get("lifecycle_operations", []):
        leaf_id = op["leaf_id"]
        operation = op["operation"]
        leaf = leaves_by_id.get(leaf_id)
        if not leaf:
            logger.warning("Sequence builder: leaf_id %s in ops but not in leaf_map — skipping", leaf_id)
            continue

        module = leaf["module"]
        section = leaf["section"]
        subdir = _module_subdir(section)

        # Determine filename from artifact_path (basename)
        artifact_path = leaf.get("artifact_path", "")
        filename = artifact_path.rsplit("/", 1)[-1] if "/" in artifact_path else artifact_path
        if not filename:
            filename = f"{leaf_id}.placeholder"

        # Resolve content
        if leaf_id in artifacts:
            content = artifacts[leaf_id]
        elif artifact_path in artifacts:
            content = artifacts[artifact_path]
        else:
            # Placeholder stub
            stub = {
                "placeholder": True,
                "leaf_id": leaf_id,
                "title": leaf.get("title", ""),
                "module": module,
                "section": section,
                "operation": operation,
                "note": f"Placeholder for {leaf.get('title', leaf_id)} — replace with actual content",
            }
            content = _canonical_json(stub).encode("utf-8")

        path = f"{prefix}/m{module}/{subdir}/{filename}"
        files[path] = content

    # ── Module 1 admin stubs from m1_index ──
    if m1_index:
        region = m1_index.get("region", "us")
        for entry in m1_index.get("entries", []):
            section = entry.get("section", "")
            if entry.get("placeholder", True):
                leaf_id = entry.get("leaf_id", "")
                artifact_path = entry.get("artifact_path", "")
                filename = artifact_path.rsplit("/", 1)[-1] if "/" in artifact_path else f"section-{section}.placeholder"
                stub = {
                    "placeholder": True,
                    "section": section,
                    "title": entry.get("title", ""),
                    "form_type": entry.get("form_type"),
                    "required": entry.get("required", False),
                }
                content = _canonical_json(stub).encode("utf-8")
                subdir = _module_subdir(section)
                path = f"{prefix}/m1/{region}/{subdir}/{filename}"
                files[path] = content

    # ── Build per-leaf operations lookup for index.xml ──
    leaf_operations: dict[str, str] = {}
    for op in sequence_plan.get("lifecycle_operations", []):
        leaf_operations[op["leaf_id"]] = op["operation"]

    # ── index.xml stub ──
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    index_xml = _build_index_xml(
        sequence_number=seq_num,
        sequence_type=seq_type,
        submission_type=submission_type,
        leaves=list(leaves_by_id.values()),
        leaf_operations=leaf_operations,
        timestamp=now_iso,
    )
    files[f"{prefix}/index.xml"] = index_xml.encode("utf-8")

    # ── Contract snapshot (if provided) ──
    if contract_snapshot:
        contract_bytes = _canonical_json(contract_snapshot).encode("utf-8")
        files[f"{prefix}/contract_snapshot.json"] = contract_bytes

    logger.info(
        "Sequence builder: built %d files for sequence/%s (%s, %s)",
        len(files), seq_num, seq_type, submission_type,
    )
    return files


def _build_index_xml(
    *,
    sequence_number: str,
    sequence_type: str,
    submission_type: str,
    leaves: list[dict[str, Any]],
    leaf_operations: dict[str, str],
    timestamp: str,
) -> str:
    """Build a minimal eCTD index.xml stub for a sequence.

    This is a v0 stub — not a full DTD-valid eCTD index.xml.
    It contains enough structure for downstream tooling to parse.

    Args:
        leaf_operations: Map of leaf_id → lifecycle operation (e.g. "new", "replace").
                         Falls back to sequence_type if a leaf has no explicit operation.
    """
    leaf_entries = []
    for leaf in sorted(leaves, key=lambda l: l.get("section", "")):
        # Use the per-leaf lifecycle operation, falling back to sequence_type
        op = leaf_operations.get(leaf["leaf_id"], sequence_type)
        leaf_entries.append(
            f'    <leaf ID="{leaf["leaf_id"]}" '
            f'operation="{op}" '
            f'xlink:href="m{leaf["module"]}/{_module_subdir(leaf["section"])}/" '
            f'checksum-type="SHA-256">'
            f'\n      <title>{leaf.get("title", leaf["leaf_id"])}</title>'
            f"\n    </leaf>"
        )

    leaves_xml = "\n".join(leaf_entries)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- eCTD Sequence Index (v0 stub) — Generated by ClinicalSageAI Phase 6.6.H -->
<!-- This is a structural stub. Replace with DTD-valid XML for actual submission. -->
<ectd:ectd xmlns:ectd="urn:hl7-org:v3" xmlns:xlink="http://www.w3.org/1999/xlink">
  <submission type="{submission_type}">
    <sequence-number>{sequence_number}</sequence-number>
    <sequence-type>{sequence_type}</sequence-type>
    <generated-at>{timestamp}</generated-at>
{leaves_xml}
  </submission>
</ectd:ectd>
"""
