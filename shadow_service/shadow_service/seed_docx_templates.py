"""Phase 6.5 — Seed DOCX Factory: Starter Templates + Demo Render Packs.

Idempotent seed script that populates the DOCX Factory with regulatory-real
starter templates and demo input payloads.  Safe to run multiple times.

Templates seeded:
  1. eCTD Cover Letter
  2. Form FDA 1571 Narrative Summary
  3. Investigator Brochure Change Summary
  4. CMC Drug Substance Overview (Module 3.2.S)
  5. Clinical Overview: Benefit/Risk Summary (Module 2.5)
  6. 510(k) Cover Letter + Administrative Summary

Each template gets:
  - 1 version (DOCX file stored via BlobStore)
  - 1+ demo input packs (JSON) for instant rendering

Usage:
    # Seed for a specific program
    python3 -m shadow_service.shadow_service.seed_docx_templates --program-id <UUID>

    # Dry-run (no writes)
    python3 -m shadow_service.shadow_service.seed_docx_templates --program-id <UUID> --dry-run

API usage (called from POST /docx/seed):
    from shadow_service.seed_docx_templates import seed_for_program
    result = await seed_for_program(program_id)
"""

import asyncio
import hashlib
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)

# Directories relative to this file
_THIS_DIR = Path(__file__).parent
_TEMPLATES_DIR = _THIS_DIR / "demo_templates"
_INPUTS_DIR = _THIS_DIR / "demo_inputs"


# =============================================================================
# Template catalog — defines what gets seeded
# =============================================================================

SEED_CATALOG: list[dict[str, Any]] = [
    {
        "name": "eCTD Cover Letter",
        "doc_type": "ectd_cover_letter",
        "template_file": "ectd_cover_letter.docx",
        "demo_inputs": ["ectd_cover_letter__ind_starter.json"],
        "tags": ["ectd", "module-1", "cover-letter", "universal"],
    },
    {
        "name": "Form FDA 1571 Narrative Summary",
        "doc_type": "ind_1571_narrative",
        "template_file": "fda_1571_narrative.docx",
        "demo_inputs": ["fda_1571_narrative__ind_starter.json"],
        "tags": ["ind", "fda-1571", "narrative", "phase-1"],
    },
    {
        "name": "Investigator Brochure Change Summary",
        "doc_type": "ib_change_summary",
        "template_file": "ib_change_summary.docx",
        "demo_inputs": ["ib_change_summary__ind_starter.json"],
        "tags": ["ib", "change-summary", "safety-update"],
    },
    {
        "name": "CMC Drug Substance Overview (3.2.S)",
        "doc_type": "cmc_drug_substance",
        "template_file": "cmc_drug_substance.docx",
        "demo_inputs": ["cmc_drug_substance__cmc_lite.json"],
        "tags": ["cmc", "module-3", "drug-substance", "quality"],
    },
    {
        "name": "Clinical Overview — Benefit/Risk Summary (2.5)",
        "doc_type": "clinical_benefit_risk",
        "template_file": "clinical_benefit_risk.docx",
        "demo_inputs": ["clinical_benefit_risk__ind_starter.json"],
        "tags": ["clinical", "module-2", "benefit-risk", "overview"],
    },
    {
        "name": "510(k) Cover Letter + Administrative Summary",
        "doc_type": "510k_cover_letter",
        "template_file": "510k_cover_letter.docx",
        "demo_inputs": ["510k_cover_letter__device_pack.json"],
        "tags": ["510k", "device", "cover-letter", "premarket"],
    },
]


# =============================================================================
# SQL — idempotent inserts
# =============================================================================

_SET_PROGRAM_CONTEXT = """
SELECT set_config('app.current_program_id', $1::TEXT, TRUE)
"""

# Upsert template by (program_id, name) — returns existing on conflict
_UPSERT_TEMPLATE = """
INSERT INTO documents.templates (program_id, name, doc_type, status)
VALUES ($1, $2, $3, 'active')
ON CONFLICT DO NOTHING
RETURNING id, program_id, name, doc_type, status, created_at, updated_at
"""

_SELECT_TEMPLATE_BY_NAME = """
SELECT id, program_id, name, doc_type, status, created_at, updated_at
  FROM documents.templates
 WHERE program_id = $1 AND name = $2
"""

_SELECT_TEMPLATE_VERSIONS = """
SELECT id, template_id, version, storage_key, sha256, created_at
  FROM documents.template_versions
 WHERE template_id = $1
 ORDER BY version DESC
 LIMIT 1
"""

_SELECT_NEXT_VERSION = """
SELECT COALESCE(MAX(version), 0) + 1 AS next_version
  FROM documents.template_versions
 WHERE template_id = $1
"""

_INSERT_VERSION = """
INSERT INTO documents.template_versions (template_id, version, storage_key, sha256)
VALUES ($1, $2, $3, $4)
RETURNING id, template_id, version, storage_key, sha256, created_at
"""


# =============================================================================
# Core seed logic
# =============================================================================

async def seed_for_program(
    program_id: UUID,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Seed all starter templates + versions into a specific program.

    Idempotent: skips templates that already exist (by name + program_id).
    Skips version upload if the latest version already has the same sha256.

    Returns a summary dict: {templates_created, templates_skipped,
    versions_created, versions_skipped, demo_packs_count}.
    """
    # Import here to avoid circular imports when used as a module
    from .blob_store import get_blob_store
    from . import db

    store = get_blob_store()

    stats = {
        "templates_created": 0,
        "templates_skipped": 0,
        "versions_created": 0,
        "versions_skipped": 0,
        "demo_packs_count": 0,
        "templates": [],
    }

    conn = await db.acquire_connection()
    try:
        # Set RLS context for this program
        await conn.execute(_SET_PROGRAM_CONTEXT, str(program_id))

        for entry in SEED_CATALOG:
            template_name = entry["name"]
            template_file = _TEMPLATES_DIR / entry["template_file"]

            if not template_file.exists():
                logger.warning("Template file missing: %s — skipping", template_file)
                continue

            # --- Template (idempotent) ----------------------------------
            # Try insert; on conflict, fetch existing
            if not dry_run:
                row = await conn.fetchrow(
                    _UPSERT_TEMPLATE,
                    program_id, template_name, entry["doc_type"],
                )
                if row:
                    template_id = row["id"]
                    stats["templates_created"] += 1
                    logger.info("Created template: %s (%s)", template_name, template_id)
                else:
                    existing = await conn.fetchrow(
                        _SELECT_TEMPLATE_BY_NAME, program_id, template_name,
                    )
                    template_id = existing["id"]
                    stats["templates_skipped"] += 1
                    logger.info("Template exists: %s (%s)", template_name, template_id)
            else:
                template_id = None
                logger.info("[DRY RUN] Would create template: %s", template_name)
                stats["templates_created"] += 1

            # --- Version (idempotent by sha256) -------------------------
            file_bytes = template_file.read_bytes()
            file_sha256 = hashlib.sha256(file_bytes).hexdigest()
            storage_key = f"templates/{entry['template_file']}"

            if not dry_run:
                # Check if latest version already has this sha256
                latest = await conn.fetchrow(_SELECT_TEMPLATE_VERSIONS, template_id)
                if latest and latest["sha256"] == file_sha256:
                    stats["versions_skipped"] += 1
                    version_id = latest["id"]
                    logger.info(
                        "Version unchanged for %s (sha256=%s)",
                        template_name, file_sha256[:12],
                    )
                else:
                    # Upload to blob store
                    await store.put_bytes(storage_key, file_bytes)

                    # Get next version number
                    ver_row = await conn.fetchrow(_SELECT_NEXT_VERSION, template_id)
                    next_ver = ver_row["next_version"]

                    ver = await conn.fetchrow(
                        _INSERT_VERSION,
                        template_id, next_ver, storage_key, file_sha256,
                    )
                    version_id = ver["id"]
                    stats["versions_created"] += 1
                    logger.info(
                        "Created version %d for %s (sha256=%s)",
                        next_ver, template_name, file_sha256[:12],
                    )
            else:
                version_id = None
                logger.info("[DRY RUN] Would upload version for: %s", template_name)
                stats["versions_created"] += 1

            # --- Demo input packs (metadata only — not rendered) --------
            demo_packs = []
            for input_file in entry["demo_inputs"]:
                input_path = _INPUTS_DIR / input_file
                if input_path.exists():
                    pack = json.loads(input_path.read_text())
                    demo_packs.append({
                        "file": input_file,
                        "label": pack.get("label", input_file),
                        "description": pack.get("description", ""),
                        "inputs": pack.get("inputs", {}),
                    })
                    stats["demo_packs_count"] += 1

            stats["templates"].append({
                "name": template_name,
                "template_id": str(template_id) if template_id else None,
                "version_id": str(version_id) if version_id else None,
                "doc_type": entry["doc_type"],
                "tags": entry["tags"],
                "demo_packs": demo_packs,
            })

    finally:
        await db.release_connection(conn)

    return stats


def get_demo_packs_for_template(doc_type: str) -> list[dict[str, Any]]:
    """Return demo input packs for a given doc_type (no DB required).

    Useful for the UI to show "Use demo inputs" options.
    """
    packs = []
    for entry in SEED_CATALOG:
        if entry["doc_type"] == doc_type:
            for input_file in entry["demo_inputs"]:
                input_path = _INPUTS_DIR / input_file
                if input_path.exists():
                    data = json.loads(input_path.read_text())
                    packs.append({
                        "file": input_file,
                        "label": data.get("label", input_file),
                        "description": data.get("description", ""),
                        "inputs": data.get("inputs", {}),
                    })
    return packs


def get_all_demo_packs() -> list[dict[str, Any]]:
    """Return all demo input packs grouped by template (no DB required)."""
    result = []
    for entry in SEED_CATALOG:
        packs = []
        for input_file in entry["demo_inputs"]:
            input_path = _INPUTS_DIR / input_file
            if input_path.exists():
                data = json.loads(input_path.read_text())
                packs.append({
                    "file": input_file,
                    "label": data.get("label", input_file),
                    "description": data.get("description", ""),
                    "inputs": data.get("inputs", {}),
                })
        result.append({
            "template_name": entry["name"],
            "doc_type": entry["doc_type"],
            "tags": entry["tags"],
            "demo_packs": packs,
        })
    return result


# =============================================================================
# CLI entry point
# =============================================================================

async def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Seed DOCX Factory templates")
    parser.add_argument(
        "--program-id", required=True,
        help="UUID of the program to seed into",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be done without writing",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    program_id = UUID(args.program_id)
    logger.info("Seeding DOCX Factory for program %s", program_id)

    result = await seed_for_program(program_id, dry_run=args.dry_run)

    print("\n" + "=" * 60)
    print("DOCX Factory Seed Summary")
    print("=" * 60)
    print(f"  Templates created:  {result['templates_created']}")
    print(f"  Templates skipped:  {result['templates_skipped']}")
    print(f"  Versions created:   {result['versions_created']}")
    print(f"  Versions skipped:   {result['versions_skipped']}")
    print(f"  Demo packs loaded:  {result['demo_packs_count']}")
    print("=" * 60)

    if result["templates_created"] == 0 and result["versions_created"] == 0:
        print("  (No changes — everything already seeded)")


if __name__ == "__main__":
    asyncio.run(_main())
