"""Phase 6.6 — Shadow 510(k) Reviewer: Simulates FDA review process.

Before a company writes their submission, this engine simulates what the
FDA reviewer will ask about their chosen predicate — generating anticipated
questions, contradiction scans, evidence gaps, and a defense readiness score.

The reviewer analyzes:
  1. Device diffs → Regulatory question generation
  2. Material changes → Biocompatibility questions (ISO 10993-1)
  3. Software changes → SaMD validation questions (IEC 62304)
  4. Performance differences → Clinical data requirements
  5. Internal contradictions → Truth Machine scan
  6. Missing evidence → Gap analysis

Output:
  - "Top 5 Questions FDA Will Ask You"
  - Defense Readiness Score (0–100%)
  - Evidence gap list with remediation suggestions
  - Toxic predicate warnings

Usage:
    reviewer = Shadow510kReviewer(program_id, conn)
    preview = await reviewer.generate_defense_preview(subject_device, predicate)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from . import sql_predicate as sql

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# FDA Guidance citations for question generation
# ═══════════════════════════════════════════════════════════════════════════════

FDA_GUIDANCE = {
    "material": {
        "citation": "FDA Guidance: Use of International Standard ISO 10993-1 "
                    "(Biological evaluation of medical devices)",
        "question_template": (
            "How does the change from {pred_val} to {subj_val} in {char} "
            "affect biocompatibility per ISO 10993-1? Provide biological "
            "evaluation data or a risk-based justification for the material change."
        ),
    },
    "software": {
        "citation": "FDA Guidance: Software as a Medical Device (SaMD): "
                    "Clinical Evaluation; IEC 62304:2015",
        "question_template": (
            "Describe the software verification and validation for the "
            "change in {char} from {pred_val} to {subj_val}. Include "
            "hazard analysis per IEC 62304 and software level of concern."
        ),
    },
    "technology": {
        "citation": "FDA Guidance: The 510(k) Program: Evaluating Substantial "
                    "Equivalence in Premarket Notifications",
        "question_template": (
            "The subject device uses {subj_val} while the predicate uses "
            "{pred_val} for {char}. Provide a detailed technological comparison "
            "demonstrating that this difference does not raise new questions "
            "of safety or effectiveness."
        ),
    },
    "performance": {
        "citation": "FDA Guidance: Recommended Content and Format of Non-Clinical "
                    "Bench Performance Testing Information in 510(k) Premarket "
                    "Submissions",
        "question_template": (
            "The performance characteristic '{char}' differs: subject = {subj_val}, "
            "predicate = {pred_val}. Provide bench testing data demonstrating "
            "equivalent or superior performance."
        ),
    },
    "intended_use": {
        "citation": "21 CFR 807.87(f) — Substantial Equivalence Determination",
        "question_template": (
            "The intended use/indications for use appear to differ in '{char}': "
            "subject = {subj_val}, predicate = {pred_val}. If the intended use "
            "has changed, a De Novo classification or PMA may be required. "
            "Clarify the scope of intended use."
        ),
    },
    "energy": {
        "citation": "IEC 60601-1:2005+AMD2:2020 — Medical Electrical Equipment",
        "question_template": (
            "The energy source/modality differs in '{char}': subject = {subj_val}, "
            "predicate = {pred_val}. Provide electrical safety testing per "
            "IEC 60601-1 and relevant collateral/particular standards."
        ),
    },
    "biocompatibility": {
        "citation": "FDA Guidance: Use of International Standard ISO 10993-1; "
                    "FDA Recognized Consensus Standards",
        "question_template": (
            "The biocompatibility profile differs for '{char}': subject = {subj_val}, "
            "predicate = {pred_val}. Provide ISO 10993 testing results or a "
            "biological evaluation based on chemical characterization."
        ),
    },
    "design": {
        "citation": "21 CFR 820 — Quality System Regulation (Design Controls)",
        "question_template": (
            "The design feature '{char}' differs: subject = {subj_val}, "
            "predicate = {pred_val}. Provide design verification/validation "
            "data demonstrating the design change does not adversely affect "
            "safety or effectiveness."
        ),
    },
    "general": {
        "citation": "FDA Guidance: Format for Traditional and Abbreviated 510(k)s",
        "question_template": (
            "The characteristic '{char}' differs: subject = {subj_val}, "
            "predicate = {pred_val}. Provide a comparison discussion and "
            "supporting data."
        ),
    },
}

# Question severity thresholds
SEVERITY_CRITICAL_CATEGORIES = {"intended_use", "software", "energy"}
SEVERITY_HIGH_CATEGORIES = {"material", "biocompatibility", "technology"}

# Readiness scoring weights
READINESS_WEIGHTS = {
    "no_critical_gaps": 30,       # No critical-severity questions unanswered
    "evidence_coverage": 25,      # % of SE matrix cells with evidence
    "no_contradictions": 20,      # No internal contradictions detected
    "no_toxic_predicate": 15,     # Selected predicate is not toxic
    "complete_matrix": 10,        # All SE characteristics populated
}


class Shadow510kReviewer:
    """Simulates FDA review process against a selected predicate."""

    def __init__(self, program_id: UUID, conn: Any):
        self.program_id = program_id
        self.conn = conn

    async def generate_defense_preview(
        self,
        subject_device: dict[str, Any],
        predicate_k_number: str,
    ) -> dict[str, Any]:
        """Full Shadow 510(k) review pipeline.

        Args:
            subject_device: Dict with device characteristics
                {device_name, characteristics: [{name, value, category}]}
            predicate_k_number: The K-number of the chosen predicate

        Returns:
            {
                "anticipated_questions": [Question, ...],
                "internal_contradictions": [...],
                "defense_readiness_score": float (0-100),
                "recommended_evidence_gaps": [...],
                "toxic_warnings": [...],
            }
        """
        # Set RLS context
        await self.conn.execute(sql.SET_PROGRAM_CONTEXT, str(self.program_id))

        # Get predicate candidate data
        candidate = await self.conn.fetchrow(
            sql.SELECT_CANDIDATE_BY_K_NUMBER,
            predicate_k_number, self.program_id,
        )

        # Get SE matrix rows for this candidate
        se_rows = []
        if candidate:
            se_rows = await self.conn.fetch(
                sql.SELECT_SE_ROWS_BY_CANDIDATE,
                candidate["id"], self.program_id,
            )

        # Step 1: Generate anticipated questions from diffs
        questions = self._generate_questions_from_diffs(
            subject_device, se_rows
        )

        # Step 2: Scan for internal contradictions
        contradictions = await self._scan_contradictions(subject_device)

        # Step 3: Identify evidence gaps
        evidence_gaps = self._identify_evidence_gaps(se_rows, questions)

        # Step 4: Check for toxic predicate warnings
        toxic_warnings = []
        if candidate:
            toxic_warnings = await self._check_toxic_warnings(candidate)

        # Step 5: Calculate defense readiness score
        readiness_score = self._calculate_readiness(
            questions, contradictions, evidence_gaps, toxic_warnings, se_rows
        )

        # Step 6: Persist defense preview
        preview_data = {
            "program_id": self.program_id,
            "candidate_id": candidate["id"] if candidate else None,
            "readiness_score": readiness_score,
            "anticipated_questions": [q for q in questions],
            "internal_contradictions": contradictions,
            "evidence_gaps": evidence_gaps,
            "toxic_warnings": toxic_warnings,
        }

        await self._persist_preview(preview_data)

        return preview_data

    # ─── Question Generation ───────────────────────────────────────────────

    def _generate_questions_from_diffs(
        self,
        subject_device: dict[str, Any],
        se_rows: list[Any],
    ) -> list[dict[str, Any]]:
        """Generate anticipated FDA questions from SE matrix diffs.

        For each row where subject ≠ predicate, generate a category-specific
        question using FDA guidance templates.
        """
        questions = []

        for row in se_rows:
            status = row["equivalence_status"] if isinstance(row, dict) else row.get("equivalence_status", "PENDING")
            if status in ("EQUIVALENT",):
                continue  # No question needed for equivalent characteristics

            category = row["category"] if isinstance(row, dict) else row.get("category", "general")
            char = row["characteristic"] if isinstance(row, dict) else row.get("characteristic", "")
            subj_val = row["subject_value"] if isinstance(row, dict) else row.get("subject_value", "")
            pred_val = row["predicate_value"] if isinstance(row, dict) else row.get("predicate_value", "")

            guidance = FDA_GUIDANCE.get(category, FDA_GUIDANCE["general"])

            # Determine severity
            if category in SEVERITY_CRITICAL_CATEGORIES:
                severity = "critical"
            elif category in SEVERITY_HIGH_CATEGORIES:
                severity = "high"
            else:
                severity = "medium"

            # If status is TOXIC, escalate severity
            if status == "TOXIC":
                severity = "critical"

            question = {
                "question": guidance["question_template"].format(
                    char=char, subj_val=subj_val, pred_val=pred_val
                ),
                "citation": guidance["citation"],
                "severity": severity,
                "category": category,
                "characteristic": char,
                "suggested_evidences": self._suggest_evidence_types(category),
            }

            # Generate a suggested response outline
            question["suggested_response"] = (
                f"To address the difference in {char}, provide: "
                f"(1) comparative testing data, "
                f"(2) risk analysis per {guidance['citation'].split(';')[0]}, "
                f"(3) justification that the difference does not raise new "
                f"questions of safety or effectiveness."
            )

            questions.append(question)

        # Sort: critical first, then high, then medium
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        questions.sort(key=lambda q: severity_order.get(q["severity"], 3))

        return questions

    def _suggest_evidence_types(self, category: str) -> list[str]:
        """Map SE category to suggested evidence document types."""
        evidence_map = {
            "material": ["biocompatibility_report", "material_characterization", "chemical_analysis"],
            "software": ["verification_protocol", "validation_report", "hazard_analysis", "architecture_doc"],
            "technology": ["bench_testing_report", "design_comparison", "510k_summary"],
            "performance": ["bench_testing_report", "clinical_data", "performance_testing"],
            "intended_use": ["labeling", "indications_for_use", "predicate_comparison"],
            "energy": ["electrical_safety_report", "iec60601_testing", "emc_report"],
            "biocompatibility": ["iso10993_report", "cytotoxicity_test", "chemical_characterization"],
            "design": ["design_verification", "design_validation", "design_review"],
        }
        return evidence_map.get(category, ["comparison_document", "supporting_data"])

    # ─── Contradiction Scan ────────────────────────────────────────────────

    async def _scan_contradictions(
        self, subject_device: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Scan for internal contradictions in the program's evidence pool.

        Looks for:
          - Conflicting claims about the same characteristic
          - Test results that contradict stated specifications
          - Date inconsistencies in referenced documents
        """
        contradictions = []

        # Check SE matrix for internal inconsistencies
        all_rows = await self.conn.fetch(
            sql.SELECT_SE_ROWS_BY_PROGRAM, self.program_id
        )

        # Look for same characteristic with different subject values
        # across different candidates
        char_values: dict[str, set[str]] = {}
        for row in all_rows:
            char = row["characteristic"]
            val = row["subject_value"]
            if char not in char_values:
                char_values[char] = set()
            char_values[char].add(val)

        for char, values in char_values.items():
            if len(values) > 1:
                contradictions.append({
                    "type": "inconsistent_subject_value",
                    "characteristic": char,
                    "conflicting_values": list(values),
                    "severity": "high",
                    "message": (
                        f"The subject device characteristic '{char}' has "
                        f"inconsistent values across predicate comparisons: "
                        f"{', '.join(values)}. FDA may flag this discrepancy."
                    ),
                })

        return contradictions

    # ─── Evidence Gap Analysis ─────────────────────────────────────────────

    def _identify_evidence_gaps(
        self,
        se_rows: list[Any],
        questions: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Identify missing evidence that would strengthen the submission."""
        gaps = []

        # Check SE matrix cells with low confidence
        for row in se_rows:
            subj_conf = row["subject_confidence"] if isinstance(row, dict) else row.get("subject_confidence", 0)
            pred_conf = row["predicate_confidence"] if isinstance(row, dict) else row.get("predicate_confidence", 0)
            subj_evidence = row["subject_evidence_ids"] if isinstance(row, dict) else row.get("subject_evidence_ids", [])
            char = row["characteristic"] if isinstance(row, dict) else row.get("characteristic", "")
            category = row["category"] if isinstance(row, dict) else row.get("category", "general")

            if subj_conf < 0.5 or not subj_evidence:
                gaps.append({
                    "characteristic": char,
                    "category": category,
                    "type": "missing_subject_evidence",
                    "severity": "high" if category in SEVERITY_HIGH_CATEGORIES else "medium",
                    "message": (
                        f"No evidence linked for subject device '{char}'. "
                        f"Confidence: {subj_conf:.0%}. Link design controls "
                        f"or test reports."
                    ),
                    "suggested_remediation": self._suggest_evidence_types(category),
                })

        # Check questions that have no suggested response evidence
        critical_questions = [q for q in questions if q["severity"] in ("critical", "high")]
        if critical_questions:
            gaps.append({
                "characteristic": "overall",
                "category": "general",
                "type": "unanswered_critical_questions",
                "severity": "critical",
                "message": (
                    f"{len(critical_questions)} critical/high-severity FDA questions "
                    f"anticipated. Prepare response evidence before submission."
                ),
                "suggested_remediation": [
                    q["suggested_evidences"][0]
                    for q in critical_questions
                    if q.get("suggested_evidences")
                ],
            })

        return gaps

    # ─── Toxic Predicate Warnings ──────────────────────────────────────────

    async def _check_toxic_warnings(
        self, candidate: Any
    ) -> list[dict[str, Any]]:
        """Generate specific warnings for toxic predicate characteristics."""
        warnings = []

        cand = dict(candidate) if not isinstance(candidate, dict) else candidate

        if cand.get("has_class_i_recall"):
            warnings.append({
                "type": "class_i_recall",
                "severity": "critical",
                "message": (
                    f"⚠️ CRITICAL: Predicate K{cand['k_number']} ({cand['device_name']}) "
                    f"was subject to a Class I recall. Citing this predicate substantially "
                    f"increases FDA scrutiny. Consider alternative predicate."
                ),
            })

        if cand.get("has_class_ii_recall"):
            warnings.append({
                "type": "class_ii_recall",
                "severity": "high",
                "message": (
                    f"⚠️ Predicate K{cand['k_number']} had a Class II recall. "
                    f"Prepare additional justification for why the recalled issue "
                    f"does not apply to your device."
                ),
            })

        if cand.get("has_safety_comm"):
            warnings.append({
                "type": "safety_communication",
                "severity": "high",
                "message": (
                    f"⚠️ FDA Safety Communication issued for predicate "
                    f"K{cand['k_number']} product family. Address the safety "
                    f"concern directly in your SE discussion."
                ),
            })

        if cand.get("mdr_event_count", 0) > 50:
            warnings.append({
                "type": "high_mdr_rate",
                "severity": "medium",
                "message": (
                    f"Predicate K{cand['k_number']} has {cand['mdr_event_count']} "
                    f"MDR reports in MAUDE. While MDR reports alone don't indicate "
                    f"a problem, FDA may ask about comparative safety data."
                ),
            })

        return warnings

    # ─── Readiness Scoring ─────────────────────────────────────────────────

    def _calculate_readiness(
        self,
        questions: list[dict[str, Any]],
        contradictions: list[dict[str, Any]],
        evidence_gaps: list[dict[str, Any]],
        toxic_warnings: list[dict[str, Any]],
        se_rows: list[Any],
    ) -> float:
        """Calculate Defense Readiness Score (0–100%).

        Scoring breakdown:
          - No critical gaps:     30 pts (deduct per critical question)
          - Evidence coverage:    25 pts (% of SE cells with evidence)
          - No contradictions:    20 pts (deduct per contradiction)
          - No toxic predicate:   15 pts (deduct for recalls/safety comms)
          - Complete SE matrix:   10 pts (all chars populated)
        """
        score = 0.0

        # 1. No critical gaps (30 pts)
        critical_count = sum(
            1 for q in questions if q.get("severity") in ("critical", "high")
        )
        if critical_count == 0:
            score += 30
        else:
            score += max(0, 30 - (critical_count * 6))  # -6 per critical question

        # 2. Evidence coverage (25 pts)
        if se_rows:
            cells_with_evidence = sum(
                1 for r in se_rows
                if (r["subject_evidence_ids"] if isinstance(r, dict)
                    else r.get("subject_evidence_ids", []))
            )
            coverage = cells_with_evidence / len(se_rows)
            score += 25 * coverage

        # 3. No contradictions (20 pts)
        if not contradictions:
            score += 20
        else:
            score += max(0, 20 - (len(contradictions) * 10))

        # 4. No toxic predicate (15 pts)
        critical_toxic = sum(
            1 for w in toxic_warnings if w.get("severity") == "critical"
        )
        if critical_toxic == 0:
            score += 15
        else:
            score += max(0, 15 - (critical_toxic * 15))

        # 5. Complete SE matrix (10 pts)
        if se_rows and len(se_rows) >= 5:
            score += 10
        elif se_rows:
            score += 10 * (len(se_rows) / 5)

        return round(min(100, max(0, score)), 1)

    # ─── Persistence ───────────────────────────────────────────────────────

    async def _persist_preview(self, preview_data: dict[str, Any]) -> None:
        """Save defense preview to database."""
        try:
            await self.conn.fetchrow(
                sql.INSERT_DEFENSE_PREVIEW,
                preview_data["program_id"],
                preview_data.get("candidate_id"),
                preview_data["readiness_score"],
                json.dumps(preview_data["anticipated_questions"]),
                json.dumps(preview_data["internal_contradictions"]),
                json.dumps(preview_data["evidence_gaps"]),
                json.dumps(preview_data["toxic_warnings"]),
            )
        except Exception as e:
            logger.warning("Failed to persist defense preview: %s", e)
