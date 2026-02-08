"""Defense Packet ZIP Builder — Phase 6.6.C/D.

Assembles the complete FDA defense packet as a ZIP archive:

  510k_defense_packet_{k_number}_{date}.zip
  ├── SE_Matrix_{subject}_{predicate}.docx     — The comparison DOCX
  ├── defense_manifest.json                    — Chain-of-custody manifest
  ├── reviewer_questions.json                  — Anticipated FDA questions
  └── README.txt                               — Packet description

Usage:
    builder = DefensePacketBuilder()
    zip_buf = await builder.build(
        se_payload=se_payload,
        reviewer_questions=questions,
        toxicity_warnings=warnings,
    )
    # zip_buf is io.BytesIO ready for streaming
"""
from __future__ import annotations

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any

from .defense_manifest import build_manifest_from_se_payload
from .docx_factory import SEMatrixDocxFactory

logger = logging.getLogger(__name__)


class DefensePacketBuilder:
    """Assembles a ZIP containing DOCX + manifest + metadata."""

    def build(
        self,
        se_payload: dict[str, Any],
        reviewer_questions: list[dict[str, Any]] | None = None,
        toxicity_warnings: list[dict[str, Any]] | None = None,
    ) -> io.BytesIO:
        """Build the complete defense packet ZIP.

        Args:
            se_payload: Output of SEMatrixGenerator.generate_payload()
            reviewer_questions: From /reviewer-questions endpoint
            toxicity_warnings: From toxic-detail or defense-preview

        Returns:
            BytesIO containing the ZIP archive
        """
        reviewer_questions = reviewer_questions or []
        toxicity_warnings = toxicity_warnings or []

        # 1. Build defense manifest
        manifest = build_manifest_from_se_payload(
            se_payload=se_payload,
            reviewer_questions=reviewer_questions,
            toxicity_warnings=toxicity_warnings,
        )
        manifest_hash = manifest.get("manifest_hash", "")

        # 2. Render SE Matrix DOCX
        factory = SEMatrixDocxFactory()
        docx_buf = factory.render(
            se_payload=se_payload,
            reviewer_questions=reviewer_questions,
            toxicity_warnings=toxicity_warnings,
            manifest_hash=manifest_hash,
        )

        # 3. Prepare file names
        subject_name = _sanitize_filename(
            se_payload.get("device_name", "subject")
        )
        pred_k = se_payload.get("predicate_k_number", "predicate")
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")

        docx_filename = f"SE_Matrix_{subject_name}_{pred_k}.docx"
        zip_filename = f"510k_defense_packet_{pred_k}_{date_str}"

        # 4. Build README
        readme_text = _build_readme(
            se_payload, manifest, reviewer_questions, toxicity_warnings,
        )

        # 5. Assemble ZIP
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # SE Matrix DOCX
            zf.writestr(
                f"{zip_filename}/{docx_filename}",
                docx_buf.getvalue(),
            )

            # Defense manifest
            zf.writestr(
                f"{zip_filename}/defense_manifest.json",
                json.dumps(manifest, indent=2, default=str),
            )

            # Reviewer questions
            if reviewer_questions:
                zf.writestr(
                    f"{zip_filename}/reviewer_questions.json",
                    json.dumps({
                        "questions": reviewer_questions,
                        "total": len(reviewer_questions),
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                    }, indent=2, default=str),
                )

            # Toxicity warnings
            if toxicity_warnings:
                zf.writestr(
                    f"{zip_filename}/toxicity_warnings.json",
                    json.dumps({
                        "warnings": toxicity_warnings,
                        "total": len(toxicity_warnings),
                    }, indent=2, default=str),
                )

            # README
            zf.writestr(f"{zip_filename}/README.txt", readme_text)

        zip_buf.seek(0)
        logger.info(
            "Defense packet built: %s (%d bytes)",
            zip_filename, zip_buf.getbuffer().nbytes,
        )
        return zip_buf

    def get_zip_filename(self, se_payload: dict[str, Any]) -> str:
        """Return the expected ZIP filename for Content-Disposition."""
        pred_k = se_payload.get("predicate_k_number", "predicate")
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        return f"510k_defense_packet_{pred_k}_{date_str}.zip"


def _sanitize_filename(name: str) -> str:
    """Remove characters unsafe for filenames."""
    safe = "".join(
        c if c.isalnum() or c in ("-", "_", ".") else "_"
        for c in name
    )
    return safe[:60] or "device"


def _build_readme(
    se_payload: dict[str, Any],
    manifest: dict[str, Any],
    reviewer_questions: list[dict[str, Any]],
    toxicity_warnings: list[dict[str, Any]],
) -> str:
    """Generate a human-readable README for the defense packet."""
    readiness = manifest.get("defense_readiness_score", 0)
    summary = manifest.get("summary", {})

    lines = [
        "=" * 60,
        "  510(k) DEFENSE PACKET",
        "  Generated by ClinicalSage Predicate Intelligence v6.6",
        "=" * 60,
        "",
        f"Subject Device:      {se_payload.get('device_name', 'Unknown')}",
        f"Predicate Device:    {se_payload.get('predicate_device_name', 'Unknown')}",
        f"Predicate K-Number:  {se_payload.get('predicate_k_number', 'Unknown')}",
        f"Generated:           {datetime.now(timezone.utc).isoformat()}",
        f"Defense Readiness:   {readiness:.1f} / 100",
        "",
        "─" * 60,
        "  CONTENTS",
        "─" * 60,
        "",
        "  SE_Matrix_*.docx         Substantial Equivalence comparison",
        "                           document with color-coded evidence",
        "                           cells and EV_ bookmarks.",
        "",
        "  defense_manifest.json    Machine-readable manifest with",
        "                           SHA-256 hash for chain-of-custody.",
        "",
    ]

    if reviewer_questions:
        lines += [
            "  reviewer_questions.json  Anticipated FDA reviewer questions",
            f"                           ({len(reviewer_questions)} questions)",
            "",
        ]

    if toxicity_warnings:
        lines += [
            "  toxicity_warnings.json   Predicate safety signals",
            f"                           ({len(toxicity_warnings)} warnings)",
            "",
        ]

    lines += [
        "  README.txt               This file",
        "",
        "─" * 60,
        "  SUMMARY",
        "─" * 60,
        "",
        f"  Total characteristics compared:  {summary.get('total_cells', 0)}",
        f"  Equivalent:                      {summary.get('equivalent_count', 0)}",
        f"  Discussion required:             {summary.get('discussion_required_count', 0)}",
        f"  Not equivalent:                  {summary.get('not_equivalent_count', 0)}",
        f"  Evidence complete:               {summary.get('evidence_complete_count', 0)}",
        f"  Missing evidence:                {summary.get('missing_evidence_count', 0)}",
        "",
        f"  Manifest hash:  {manifest.get('manifest_hash', '—')}",
        "",
        "─" * 60,
        "  NOTES",
        "─" * 60,
        "",
        "  • EV_ bookmarks in the DOCX can be extracted programmatically",
        "    for automated evidence verification.",
        "",
        "  • The defense_manifest.json file provides tamper-evident",
        "    chain-of-custody. Verify the manifest_hash matches the",
        "    SHA-256 of the cells array before relying on the readiness",
        "    score.",
        "",
        "  • Reviewer questions are deterministic (no LLM) and based",
        "    on FDA regulatory logic applied to device characteristic",
        "    differences.",
        "",
        "=" * 60,
    ]

    return "\n".join(lines)
