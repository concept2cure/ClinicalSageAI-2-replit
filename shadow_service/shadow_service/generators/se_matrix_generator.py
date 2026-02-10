"""SE Matrix Payload Generator — Phase 6.6.C.

Generates the Substantial Equivalence comparison matrix payload
from subject device + selected predicate.  Every cell is an Evidence Cell
with confidence scoring, evidence IDs, and diff analysis.

Integrates with DOCX Factory for rendering and Truth Machine for traceability.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from shadow_service.models_predicate import (
    DiffSeverity,
    EquivalenceStatus,
    EvidenceCell,
    SECategory,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Difference Analysis Result
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class DiffResult:
    """Result of comparing subject vs predicate for a characteristic."""
    flag: EquivalenceStatus
    auto_text: str
    severity: DiffSeverity = DiffSeverity.NONE
    requires_citation: bool = False
    suggested_tests: list[str] | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Regulatory standards for auto-generated discussion text
# ─────────────────────────────────────────────────────────────────────────────

ISO_STANDARDS: dict[str, str] = {
    "materials": "ISO 10993-1 (Biological evaluation of medical devices)",
    "biocompatibility": "ISO 10993-5 (Cytotoxicity), ISO 10993-10 (Sensitization)",
    "sterilization": "ISO 11135 (EO), ISO 11137 (Radiation), ISO 17665 (Steam)",
    "software": "IEC 62304 (Medical device software life cycle)",
    "electrical": "IEC 60601-1 (Electrical safety)",
    "energy_source": "IEC 60601-1 (Electrical safety), IEC 60601-1-2 (EMC)",
    "performance": "ISO 14155 (Clinical investigation), device-specific guidance",
    "packaging": "ISO 11607 (Packaging for terminally sterilized devices)",
    "intended_use": "21 CFR 807.87(f) (Substantial Equivalence Determination)",
    "technology": "FDA Guidance: The 510(k) Program",
}

SIGNIFICANT_MATERIAL_CHANGES = {
    "titanium", "stainless steel", "cobalt chromium", "nitinol",
    "silicone", "polyethylene", "peek", "ptfe", "latex",
}


class SEMatrixGenerator:
    """Generates SE matrix payload from subject device vs predicate."""

    # ─────────────────────────────────────────────────────────────────
    # Comparison characteristics
    # ─────────────────────────────────────────────────────────────────

    CHARACTERISTICS: list[tuple[SECategory, str]] = [
        (SECategory.INTENDED_USE, "Intended Use"),
        (SECategory.TECHNOLOGY, "Technological Characteristics"),
        (SECategory.MATERIALS, "Materials of Construction"),
        (SECategory.ENERGY_SOURCE, "Energy Source"),
        (SECategory.PERFORMANCE, "Performance Characteristics"),
        (SECategory.BIOCOMPATIBILITY, "Biocompatibility"),
        (SECategory.STERILIZATION, "Sterilization Method"),
        (SECategory.SOFTWARE, "Software/Firmware"),
        (SECategory.GENERAL, "Labeling / General"),
    ]

    def generate_payload(
        self,
        subject_device: dict[str, Any],
        selected_predicate: dict[str, Any],
        design_control_ids: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """Build SE matrix payload ready for DOCX rendering.

        Args:
            subject_device: dict with keys matching SECategory values
                (intended_use, technology, materials, etc.)
            selected_predicate: dict from fda_510k_clearances row
            design_control_ids: optional map of characteristic→evidence_id

        Returns:
            Template payload for 510k_se_matrix_v2 with evidence cells.
        """
        design_control_ids = design_control_ids or {}
        rows: list[dict[str, Any]] = []
        k_number = selected_predicate.get("k_number", "UNKNOWN")

        for idx, (category, char_name) in enumerate(self.CHARACTERISTICS):
            cat_key = category.value  # e.g. "intended_use"
            subj_val = str(subject_device.get(cat_key, "N/A"))
            pred_val = str(selected_predicate.get(cat_key, "N/A"))

            # Analyze the difference
            diff = self.analyze_difference(cat_key, subj_val, pred_val)

            # Build evidence-linked cells
            subject_evidence_ids = []
            if design_control_ids.get(cat_key):
                subject_evidence_ids.append(design_control_ids[cat_key])

            subject_cell = EvidenceCell(
                value=subj_val,
                evidence_ids=subject_evidence_ids,
                confidence=0.95 if subject_evidence_ids else 0.50,
            )

            predicate_cell = EvidenceCell(
                value=pred_val,
                evidence_ids=[f"FDA_510k_{k_number}"],
                confidence=0.90,
            )

            row = {
                "sort_order": idx + 1,
                "category": cat_key,
                "characteristic": char_name,
                "subject_value": subject_cell.model_dump(),
                "predicate_value": predicate_cell.model_dump(),
                "equivalence_status": diff.flag.value,
                "diff_severity": diff.severity.value,
                "discussion_text": diff.auto_text,
                "requires_citation": diff.requires_citation,
                "suggested_tests": diff.suggested_tests or [],
            }
            rows.append(row)

        readiness = self.calculate_readiness(rows)

        # C0 enhancement: evidence manifest mapping row_id → placeholders
        evidence_manifest = self._build_evidence_manifest(rows)

        return {
            "template_id": "510k_se_matrix_v2",
            "version": "6.6.0",
            "device_name": subject_device.get("device_name", "Subject Device"),
            "predicate_k_number": k_number,
            "predicate_device_name": selected_predicate.get("device_name", ""),
            "comparison_rows": rows,
            "defense_readiness_score": readiness,
            "evidence_linkage": True,
            "regulatory_standard": "FDA_510k_SE",
            "generation_timestamp": datetime.now(timezone.utc).isoformat(),
            "evidence_manifest": evidence_manifest,
        }

    # ─────────────────────────────────────────────────────────────────
    # C0 — Evidence Manifest (row_id → evidence_placeholders[])
    # ─────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_evidence_manifest(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Build JSON manifest mapping each row to evidence placeholders.

        This enables downstream truth-machine evidence attachment
        without redesign — each row knows what evidence it needs.
        """
        manifest: list[dict[str, Any]] = []
        for row in rows:
            row_id = f"row_{row['sort_order']}"
            placeholders: list[str] = []

            # Subject evidence
            sv = row.get("subject_value", {})
            if isinstance(sv, dict):
                for eid in sv.get("evidence_ids", []):
                    placeholders.append(f"EV_{eid}")
                if not sv.get("evidence_ids") and sv.get("value") not in ("N/A", "n/a", ""):
                    placeholders.append(f"EV_NEEDED_subject_{row['category']}")

            # Predicate evidence
            pv = row.get("predicate_value", {})
            if isinstance(pv, dict):
                for eid in pv.get("evidence_ids", []):
                    placeholders.append(f"EV_{eid}")

            # Suggested tests as evidence placeholders
            for test in row.get("suggested_tests", []):
                placeholders.append(f"TEST_{test.replace(' ', '_')[:40]}")

            manifest.append({
                "row_id": row_id,
                "category": row.get("category", ""),
                "characteristic": row.get("characteristic", ""),
                "equivalence_status": row.get("equivalence_status", "PENDING"),
                "diff_flag": row.get("equivalence_status", "PENDING"),
                "evidence_placeholders": placeholders,
                "highlight": row.get("equivalence_status") == "DISCUSSION_REQUIRED",
            })
        return manifest

    # ─────────────────────────────────────────────────────────────────
    # Difference Analysis
    # ─────────────────────────────────────────────────────────────────

    def analyze_difference(
        self, category: str, subject: str, predicate: str,
    ) -> DiffResult:
        """Regulatory logic: Is this difference meaningful to FDA?"""
        subj_norm = subject.strip().lower()
        pred_norm = predicate.strip().lower()

        # Identical = Equivalent
        if subj_norm == pred_norm:
            return DiffResult(
                flag=EquivalenceStatus.EQUIVALENT,
                auto_text="Identical characteristics — no discussion required.",
                severity=DiffSeverity.NONE,
            )

        # N/A on both sides
        if subj_norm in ("n/a", "", "none") and pred_norm in ("n/a", "", "none"):
            return DiffResult(
                flag=EquivalenceStatus.EQUIVALENT,
                auto_text="Not applicable for both devices.",
                severity=DiffSeverity.NONE,
            )

        # Category-specific analysis
        if category == "materials":
            return self._analyze_materials(subject, predicate)
        if category == "energy_source":
            return self._analyze_energy(subject, predicate)
        if category == "sterilization":
            return self._analyze_sterilization(subject, predicate)
        if category == "software":
            return self._analyze_software(subject, predicate)
        if category == "intended_use":
            return self._analyze_intended_use(subject, predicate)

        # Default: discussion required
        return DiffResult(
            flag=EquivalenceStatus.DISCUSSION_REQUIRED,
            auto_text=(
                f"Differences noted between subject ({subject}) and "
                f"predicate ({predicate}). Discussion provided below."
            ),
            severity=DiffSeverity.LOW,
            requires_citation=True,
        )

    def _analyze_materials(self, subj: str, pred: str) -> DiffResult:
        """Material changes are always discussion-required."""
        subj_mats = {w.strip().lower() for w in subj.replace(",", " ").split()}
        pred_mats = {w.strip().lower() for w in pred.replace(",", " ").split()}

        significant_change = bool(
            (subj_mats - pred_mats) & SIGNIFICANT_MATERIAL_CHANGES
            or (pred_mats - subj_mats) & SIGNIFICANT_MATERIAL_CHANGES
        )

        if significant_change:
            return DiffResult(
                flag=EquivalenceStatus.DISCUSSION_REQUIRED,
                auto_text=(
                    f"Change from {pred} to {subj} requires biocompatibility "
                    f"assessment per {ISO_STANDARDS['materials']}. "
                    "See biocompatibility evaluation report."
                ),
                severity=DiffSeverity.HIGH,
                requires_citation=True,
                suggested_tests=[
                    "Biocompatibility per ISO 10993-1",
                    "Material characterization",
                    "Chemical analysis",
                ],
            )

        return DiffResult(
            flag=EquivalenceStatus.DISCUSSION_REQUIRED,
            auto_text=(
                f"Material difference noted ({pred} → {subj}). "
                "Materials are within the same family — "
                "biocompatibility data supports equivalence."
            ),
            severity=DiffSeverity.MEDIUM,
            requires_citation=True,
            suggested_tests=["Material equivalence justification"],
        )

    def _analyze_energy(self, subj: str, pred: str) -> DiffResult:
        """Energy source changes are significant."""
        if subj.strip().lower() in ("n/a", "none", "") and pred.strip().lower() in ("n/a", "none", ""):
            return DiffResult(
                flag=EquivalenceStatus.EQUIVALENT,
                auto_text="Neither device uses external energy source.",
                severity=DiffSeverity.NONE,
            )

        return DiffResult(
            flag=EquivalenceStatus.DISCUSSION_REQUIRED,
            auto_text=(
                f"Different energy source ({pred} → {subj}). "
                f"May affect safety profile per {ISO_STANDARDS['electrical']}. "
                "Requires bench testing verification."
            ),
            severity=DiffSeverity.HIGH,
            requires_citation=True,
            suggested_tests=[
                "Electrical safety per IEC 60601-1",
                "Bench testing verification",
            ],
        )

    def _analyze_sterilization(self, subj: str, pred: str) -> DiffResult:
        """Sterilization method changes."""
        return DiffResult(
            flag=EquivalenceStatus.DISCUSSION_REQUIRED,
            auto_text=(
                f"Sterilization method differs ({pred} → {subj}). "
                f"Validation required per {ISO_STANDARDS['sterilization']}."
            ),
            severity=DiffSeverity.MEDIUM,
            requires_citation=True,
            suggested_tests=["Sterilization validation report"],
        )

    def _analyze_software(self, subj: str, pred: str) -> DiffResult:
        """Software/firmware changes often trigger additional review."""
        subj_has_sw = subj.strip().lower() not in ("n/a", "none", "")
        pred_has_sw = pred.strip().lower() not in ("n/a", "none", "")

        if subj_has_sw and not pred_has_sw:
            return DiffResult(
                flag=EquivalenceStatus.NOT_EQUIVALENT,
                auto_text=(
                    "Subject device includes software not present in predicate. "
                    f"Requires software documentation per {ISO_STANDARDS['software']}. "
                    "FDA may request additional software review."
                ),
                severity=DiffSeverity.CRITICAL,
                requires_citation=True,
                suggested_tests=[
                    "Software documentation per IEC 62304",
                    "Software hazard analysis",
                    "Cybersecurity documentation",
                ],
            )

        return DiffResult(
            flag=EquivalenceStatus.DISCUSSION_REQUIRED,
            auto_text=(
                f"Software differences noted ({pred} → {subj}). "
                f"Review per {ISO_STANDARDS['software']}."
            ),
            severity=DiffSeverity.MEDIUM,
            requires_citation=True,
            suggested_tests=["Software documentation per IEC 62304"],
        )

    def _analyze_intended_use(self, subj: str, pred: str) -> DiffResult:
        """Intended use differences are the most impactful."""
        # Simple word overlap check
        subj_words = set(subj.lower().split())
        pred_words = set(pred.lower().split())
        overlap = len(subj_words & pred_words)
        total = max(len(subj_words | pred_words), 1)
        similarity = overlap / total

        if similarity > 0.8:
            return DiffResult(
                flag=EquivalenceStatus.EQUIVALENT,
                auto_text=(
                    "Intended use is substantially similar. "
                    "Minor wording differences do not affect equivalence."
                ),
                severity=DiffSeverity.NONE,
            )

        if similarity > 0.5:
            return DiffResult(
                flag=EquivalenceStatus.DISCUSSION_REQUIRED,
                auto_text=(
                    "Intended use overlap is moderate. Discussion addresses "
                    "differences in scope and patient population."
                ),
                severity=DiffSeverity.MEDIUM,
                requires_citation=True,
            )

        return DiffResult(
            flag=EquivalenceStatus.NOT_EQUIVALENT,
            auto_text=(
                "Significant difference in intended use. "
                "FDA may not accept this predicate for SE comparison."
            ),
            severity=DiffSeverity.CRITICAL,
            requires_citation=True,
        )

    # ─────────────────────────────────────────────────────────────────
    # Readiness Score
    # ─────────────────────────────────────────────────────────────────

    @staticmethod
    def calculate_readiness(rows: list[dict[str, Any]]) -> float:
        """Defense Readiness Score (0–100).

        Components:
            - 30 pts: No NOT_EQUIVALENT rows
            - 25 pts: Evidence coverage (% of cells with evidence_ids)
            - 20 pts: No CRITICAL severity diffs
            - 15 pts: All DISCUSSION_REQUIRED rows have auto_text
            - 10 pts: No empty subject values
        """
        if not rows:
            return 0.0

        score = 0.0
        total = len(rows)

        # 30 pts: no outright failures
        not_eq_count = sum(
            1 for r in rows
            if r.get("equivalence_status") == EquivalenceStatus.NOT_EQUIVALENT.value
        )
        if not_eq_count == 0:
            score += 30.0
        else:
            score += max(0, 30.0 - (not_eq_count * 15.0))

        # 25 pts: evidence coverage
        evidence_count = 0
        for r in rows:
            sv = r.get("subject_value", {})
            if isinstance(sv, dict) and sv.get("evidence_ids"):
                evidence_count += 1
        score += 25.0 * (evidence_count / total)

        # 20 pts: no critical diffs
        critical_count = sum(
            1 for r in rows
            if r.get("diff_severity") == DiffSeverity.CRITICAL.value
        )
        if critical_count == 0:
            score += 20.0
        else:
            score += max(0, 20.0 - (critical_count * 10.0))

        # 15 pts: discussion text completeness
        discussion_needed = [
            r for r in rows
            if r.get("equivalence_status") == EquivalenceStatus.DISCUSSION_REQUIRED.value
        ]
        if discussion_needed:
            with_text = sum(1 for r in discussion_needed if r.get("discussion_text"))
            score += 15.0 * (with_text / len(discussion_needed))
        else:
            score += 15.0

        # 10 pts: no empty subject values
        empty_count = sum(
            1 for r in rows
            if not r.get("subject_value", {}).get("value")
            or r.get("subject_value", {}).get("value") in ("N/A", "n/a", "")
        )
        if empty_count == 0:
            score += 10.0
        else:
            score += max(0, 10.0 - (empty_count * 2.0))

        return round(min(score, 100.0), 1)
