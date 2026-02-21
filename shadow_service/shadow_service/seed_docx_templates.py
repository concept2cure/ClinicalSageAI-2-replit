"""Phase 6.6 — Seed DOCX Factory: Premium Templates + Demo Render Packs.

Idempotent seed script that populates the DOCX Factory with enterprise-grade
regulatory templates and demo input payloads.  Safe to run multiple times.

Template Families:
  IND (10):
    1.  eCTD Cover Letter (Module 1.0)
    2.  Form FDA 1571 Narrative Summary
    3.  Investigator Brochure Change Summary
    4.  CMC Drug Substance Overview (3.2.S)
    5.  CMC Drug Product Overview (3.2.P)
    6.  Clinical Benefit/Risk Summary (2.5)
    7.  Nonclinical Overview (2.4)
    8.  Quality Overall Summary (2.3)
    9.  CSR Synopsis (5.3)
    10. Protocol Synopsis
    NDA (5):
        11. eCTD Cover Letter (NDA)
        12. NDA Clinical Overview (2.5)
        13. NDA Nonclinical Overview (2.4)
        14. NDA Quality Overall Summary (2.3)
        15. NDA CSR Synopsis (5.3)
    BLA (5):
        16. eCTD Cover Letter (BLA)
        17. BLA Clinical Overview (2.5)
        18. BLA Nonclinical Overview (2.4)
        19. BLA Quality Overall Summary (2.3)
        20. BLA CSR Synopsis (5.3)
    SOP (3):
        21. SOP — Change Control Summary
        22. SOP — CAPA Effectiveness Summary
        23. SOP — Deviation Investigation Summary
  510(k) (5):
        24. 510(k) Cover Letter
        25. Substantial Equivalence Comparison
        26. Device Description
        27. 510(k) Summary (§807.92)
        28. Biocompatibility Evaluation
  CER — eCTD 4.0 (4):
        29. Clinical Evaluation Plan
        30. Literature Analysis
        31. Benefit-Risk & PMCF
        32. State of the Art

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
    # =========================================================================
    # IND Templates (10)
    # =========================================================================
    {
        "name": "eCTD Cover Letter",
        "doc_type": "ectd_cover_letter",
        "template_file": "ectd_cover_letter.docx",
        "demo_inputs": ["ectd_cover_letter__ind_starter.json"],
        "tags": ["ectd", "module-1", "cover-letter", "universal"],
        "doc_family": "ind",
    },
    {
        "name": "Form FDA 1571 Narrative Summary",
        "doc_type": "ind_1571_narrative",
        "template_file": "fda_1571_narrative.docx",
        "demo_inputs": ["fda_1571_narrative__ind_starter.json"],
        "tags": ["ind", "fda-1571", "narrative", "phase-1"],
        "doc_family": "ind",
    },
    {
        "name": "Investigator Brochure Change Summary",
        "doc_type": "ib_change_summary",
        "template_file": "ib_change_summary.docx",
        "demo_inputs": ["ib_change_summary__ind_starter.json"],
        "tags": ["ib", "change-summary", "safety-update"],
        "doc_family": "ind",
    },
    {
        "name": "CMC Drug Substance Overview (3.2.S)",
        "doc_type": "cmc_drug_substance",
        "template_file": "cmc_drug_substance.docx",
        "demo_inputs": ["cmc_drug_substance__cmc_lite.json"],
        "tags": ["cmc", "module-3", "drug-substance", "quality"],
        "doc_family": "ind",
    },
    {
        "name": "CMC Drug Product Overview (3.2.P)",
        "doc_type": "cmc_drug_product",
        "template_file": "cmc_drug_product.docx",
        "demo_inputs": ["cmc_drug_product__cmc_lite.json"],
        "tags": ["cmc", "module-3", "drug-product", "quality"],
        "doc_family": "ind",
    },
    {
        "name": "Clinical Overview — Benefit/Risk Summary (2.5)",
        "doc_type": "clinical_benefit_risk",
        "template_file": "clinical_benefit_risk.docx",
        "demo_inputs": ["clinical_benefit_risk__ind_starter.json"],
        "tags": ["clinical", "module-2", "benefit-risk", "overview"],
        "doc_family": "ind",
    },
    {
        "name": "Nonclinical Overview (2.4)",
        "doc_type": "nonclinical_overview",
        "template_file": "nonclinical_overview.docx",
        "demo_inputs": ["nonclinical_overview__ind_starter.json"],
        "tags": ["nonclinical", "module-2", "pharmacology", "toxicology"],
        "doc_family": "ind",
    },
    {
        "name": "Quality Overall Summary (2.3)",
        "doc_type": "quality_overall_summary",
        "template_file": "quality_overall_summary.docx",
        "demo_inputs": ["quality_overall_summary__ind_starter.json"],
        "tags": ["quality", "module-2", "qos", "cmc-summary"],
        "doc_family": "ind",
    },
    {
        "name": "CSR Synopsis (5.3)",
        "doc_type": "csr_synopsis",
        "template_file": "csr_synopsis.docx",
        "demo_inputs": ["csr_synopsis__ind_starter.json"],
        "tags": ["clinical", "module-5", "csr", "ich-e3"],
        "doc_family": "ind",
    },
    {
        "name": "Protocol Synopsis",
        "doc_type": "protocol_synopsis",
        "template_file": "protocol_synopsis.docx",
        "demo_inputs": ["protocol_synopsis__ind_starter.json"],
        "tags": ["clinical", "protocol", "study-design", "phase-2"],
        "doc_family": "ind",
    },
    # =========================================================================
    # NDA Templates (5)
    # =========================================================================
    {
        "name": "eCTD Cover Letter (NDA)",
        "doc_type": "nda_cover_letter",
        "template_file": "ectd_cover_letter.docx",
        "demo_inputs": ["ectd_cover_letter__ind_starter.json"],
        "tags": ["nda", "module-1", "cover-letter", "starter"],
        "doc_family": "nda",
    },
    {
        "name": "NDA Clinical Overview (2.5)",
        "doc_type": "nda_clinical_overview",
        "template_file": "clinical_benefit_risk.docx",
        "demo_inputs": ["clinical_benefit_risk__ind_starter.json"],
        "tags": ["nda", "module-2", "clinical", "benefit-risk", "starter"],
        "doc_family": "nda",
    },
    {
        "name": "NDA Nonclinical Overview (2.4)",
        "doc_type": "nda_nonclinical_overview",
        "template_file": "nonclinical_overview.docx",
        "demo_inputs": ["nonclinical_overview__ind_starter.json"],
        "tags": ["nda", "module-2", "nonclinical", "starter"],
        "doc_family": "nda",
    },
    {
        "name": "NDA Quality Overall Summary (2.3)",
        "doc_type": "nda_quality_overall_summary",
        "template_file": "quality_overall_summary.docx",
        "demo_inputs": ["quality_overall_summary__ind_starter.json"],
        "tags": ["nda", "module-2", "quality", "qos", "starter"],
        "doc_family": "nda",
    },
    {
        "name": "NDA CSR Synopsis (5.3)",
        "doc_type": "nda_csr_synopsis",
        "template_file": "csr_synopsis.docx",
        "demo_inputs": ["csr_synopsis__ind_starter.json"],
        "tags": ["nda", "module-5", "csr", "starter"],
        "doc_family": "nda",
    },
    # =========================================================================
    # BLA Templates (5)
    # =========================================================================
    {
        "name": "eCTD Cover Letter (BLA)",
        "doc_type": "bla_cover_letter",
        "template_file": "ectd_cover_letter.docx",
        "demo_inputs": ["ectd_cover_letter__ind_starter.json"],
        "tags": ["bla", "module-1", "cover-letter", "starter"],
        "doc_family": "bla",
    },
    {
        "name": "BLA Clinical Overview (2.5)",
        "doc_type": "bla_clinical_overview",
        "template_file": "clinical_benefit_risk.docx",
        "demo_inputs": ["clinical_benefit_risk__ind_starter.json"],
        "tags": ["bla", "module-2", "clinical", "benefit-risk", "starter"],
        "doc_family": "bla",
    },
    {
        "name": "BLA Nonclinical Overview (2.4)",
        "doc_type": "bla_nonclinical_overview",
        "template_file": "nonclinical_overview.docx",
        "demo_inputs": ["nonclinical_overview__ind_starter.json"],
        "tags": ["bla", "module-2", "nonclinical", "starter"],
        "doc_family": "bla",
    },
    {
        "name": "BLA Quality Overall Summary (2.3)",
        "doc_type": "bla_quality_overall_summary",
        "template_file": "quality_overall_summary.docx",
        "demo_inputs": ["quality_overall_summary__ind_starter.json"],
        "tags": ["bla", "module-2", "quality", "qos", "starter"],
        "doc_family": "bla",
    },
    {
        "name": "BLA CSR Synopsis (5.3)",
        "doc_type": "bla_csr_synopsis",
        "template_file": "csr_synopsis.docx",
        "demo_inputs": ["csr_synopsis__ind_starter.json"],
        "tags": ["bla", "module-5", "csr", "starter"],
        "doc_family": "bla",
    },
    # =========================================================================
    # SOP Templates (3)
    # =========================================================================
    {
        "name": "SOP — Change Control Summary",
        "doc_type": "sop_change_control_summary",
        "template_file": "protocol_synopsis.docx",
        "demo_inputs": ["protocol_synopsis__ind_starter.json"],
        "tags": ["sop", "quality-system", "change-control", "starter"],
        "doc_family": "sop",
    },
    {
        "name": "SOP — CAPA Effectiveness Summary",
        "doc_type": "sop_capa_effectiveness",
        "template_file": "quality_overall_summary.docx",
        "demo_inputs": ["quality_overall_summary__ind_starter.json"],
        "tags": ["sop", "quality-system", "capa", "starter"],
        "doc_family": "sop",
    },
    {
        "name": "SOP — Deviation Investigation Summary",
        "doc_type": "sop_deviation_investigation",
        "template_file": "nonclinical_overview.docx",
        "demo_inputs": ["nonclinical_overview__ind_starter.json"],
        "tags": ["sop", "quality-system", "deviation", "starter"],
        "doc_family": "sop",
    },
    # =========================================================================
    # 510(k) Templates (5)
    # =========================================================================
    {
        "name": "510(k) Cover Letter",
        "doc_type": "510k_cover_letter",
        "template_file": "510k_cover_letter.docx",
        "demo_inputs": ["510k_cover_letter__device_pack.json"],
        "tags": ["510k", "device", "cover-letter", "premarket"],
        "doc_family": "510k",
    },
    {
        "name": "510(k) Substantial Equivalence Comparison",
        "doc_type": "510k_se_comparison",
        "template_file": "510k_se_comparison.docx",
        "demo_inputs": ["510k_se_comparison__device_pack.json"],
        "tags": ["510k", "device", "se-comparison", "predicate"],
        "doc_family": "510k",
    },
    {
        "name": "510(k) Device Description",
        "doc_type": "510k_device_description",
        "template_file": "510k_device_description.docx",
        "demo_inputs": ["510k_device_description__device_pack.json"],
        "tags": ["510k", "device", "description", "technical"],
        "doc_family": "510k",
    },
    {
        "name": "510(k) Summary (§807.92)",
        "doc_type": "510k_summary",
        "template_file": "510k_summary.docx",
        "demo_inputs": ["510k_summary__device_pack.json"],
        "tags": ["510k", "device", "summary", "807-92"],
        "doc_family": "510k",
    },
    {
        "name": "510(k) Biocompatibility Evaluation",
        "doc_type": "510k_biocompatibility",
        "template_file": "510k_biocompatibility.docx",
        "demo_inputs": ["510k_biocompatibility__device_pack.json"],
        "tags": ["510k", "device", "biocompatibility", "iso-10993"],
        "doc_family": "510k",
    },
    # =========================================================================
    # CER — eCTD 4.0 Templates (4)
    # =========================================================================
    {
        "name": "CER — Clinical Evaluation Plan",
        "doc_type": "cer_evaluation_plan",
        "template_file": "cer_evaluation_plan.docx",
        "demo_inputs": ["cer_evaluation_plan__cer_pack.json"],
        "tags": ["cer", "ectd-4", "eu-mdr", "evaluation-plan"],
        "doc_family": "cer",
    },
    {
        "name": "CER — Literature Analysis",
        "doc_type": "cer_literature_analysis",
        "template_file": "cer_literature_analysis.docx",
        "demo_inputs": ["cer_literature_analysis__cer_pack.json"],
        "tags": ["cer", "ectd-4", "eu-mdr", "literature-review"],
        "doc_family": "cer",
    },
    {
        "name": "CER — Benefit-Risk & PMCF",
        "doc_type": "cer_benefit_risk_pmcf",
        "template_file": "cer_benefit_risk_pmcf.docx",
        "demo_inputs": ["cer_benefit_risk_pmcf__cer_pack.json"],
        "tags": ["cer", "ectd-4", "eu-mdr", "benefit-risk", "pmcf"],
        "doc_family": "cer",
    },
    {
        "name": "CER — State of the Art",
        "doc_type": "cer_state_of_art",
        "template_file": "cer_state_of_art.docx",
        "demo_inputs": ["cer_state_of_art__cer_pack.json"],
        "tags": ["cer", "ectd-4", "eu-mdr", "state-of-art"],
        "doc_family": "cer",
    },
]


def _normalize_doc_family(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lower()


def _entry_family(entry: dict[str, Any]) -> str:
    return _normalize_doc_family(entry.get("doc_family")) or "ind"


def get_supported_doc_families() -> list[str]:
    """Return all available document families from the seed catalog."""
    families = sorted({_entry_family(entry) for entry in SEED_CATALOG})
    return families


def get_supported_doc_types(doc_family: str | None = None) -> list[str]:
    """Return supported doc_type values, optionally scoped by family."""
    normalized_family = _normalize_doc_family(doc_family)
    doc_types = {
        entry["doc_type"]
        for entry in SEED_CATALOG
        if not normalized_family or _entry_family(entry) == normalized_family
    }
    return sorted(doc_types)


def get_seed_catalog(
    *,
    doc_family: str | None = None,
    doc_type: str | None = None,
) -> list[dict[str, Any]]:
    """Return catalog entries filtered by family and/or doc type."""
    normalized_family = _normalize_doc_family(doc_family)
    normalized_doc_type = (doc_type or "").strip()

    results: list[dict[str, Any]] = []
    for entry in SEED_CATALOG:
        if normalized_family and _entry_family(entry) != normalized_family:
            continue
        if normalized_doc_type and entry["doc_type"] != normalized_doc_type:
            continue
        results.append(entry)

    return results


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
    doc_family: str | None = None,
    doc_type: str | None = None,
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

    catalog = get_seed_catalog(doc_family=doc_family, doc_type=doc_type)

    conn = await db.acquire_connection()
    try:
        # Set RLS context for this program
        await conn.execute(_SET_PROGRAM_CONTEXT, str(program_id))

        for entry in catalog:
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
                    template_id = existing["id"]  # type: ignore[index]
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
                    next_ver = ver_row["next_version"]  # type: ignore[index]

                    ver = await conn.fetchrow(
                        _INSERT_VERSION,
                        template_id, next_ver, storage_key, file_sha256,
                    )
                    version_id = ver["id"]  # type: ignore[index]
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
                "doc_family": _entry_family(entry),
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
    for entry in get_seed_catalog(doc_type=doc_type):
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


def get_all_demo_packs(
    *,
    doc_family: str | None = None,
    doc_type: str | None = None,
) -> list[dict[str, Any]]:
    """Return all demo input packs grouped by template (no DB required)."""
    result = []
    for entry in get_seed_catalog(doc_family=doc_family, doc_type=doc_type):
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
            "doc_family": _entry_family(entry),
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
