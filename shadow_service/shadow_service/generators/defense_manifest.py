"""Defense Manifest Generator — Phase 6.6.C.

Produces defense_manifest.json alongside every SE Matrix DOCX:
every cell → evidence_ids → confidence → diff_flag → reviewer_question.

This ties into Truth Machine + Defense Packet for chain-of-custody.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


class DefenseManifest:
    """Builds the defense-grade manifest that accompanies every SE Matrix render."""

    def __init__(
        self,
        subject_device_name: str,
        predicate_k_number: str,
        predicate_device_name: str,
    ) -> None:
        self.subject_device_name = subject_device_name
        self.predicate_k_number = predicate_k_number
        self.predicate_device_name = predicate_device_name
        self.cells: list[dict[str, Any]] = []
        self.reviewer_questions: list[dict[str, Any]] = []
        self.toxicity_warnings: list[dict[str, Any]] = []
        self.generated_at = datetime.now(timezone.utc).isoformat()

    def add_cell(
        self,
        row_index: int,
        characteristic: str,
        category: str,
        subject_value: dict[str, Any],
        predicate_value: dict[str, Any],
        equivalence_status: str,
        diff_severity: str,
        discussion_text: str,
        requires_citation: bool,
        suggested_tests: list[str] | None = None,
    ) -> None:
        """Register a single SE matrix cell in the manifest."""
        self.cells.append({
            "row_index": row_index,
            "characteristic": characteristic,
            "category": category,
            "subject": {
                "value": subject_value.get("value", ""),
                "evidence_ids": subject_value.get("evidence_ids", []),
                "confidence": subject_value.get("confidence", 0.0),
                "has_evidence": bool(subject_value.get("evidence_ids")),
            },
            "predicate": {
                "value": predicate_value.get("value", ""),
                "evidence_ids": predicate_value.get("evidence_ids", []),
                "confidence": predicate_value.get("confidence", 0.0),
                "has_evidence": bool(predicate_value.get("evidence_ids")),
            },
            "equivalence_status": equivalence_status,
            "diff_severity": diff_severity,
            "discussion_text": discussion_text,
            "requires_citation": requires_citation,
            "suggested_tests": suggested_tests or [],
            "evidence_complete": bool(
                subject_value.get("evidence_ids")
                and predicate_value.get("evidence_ids")
            ),
        })

    def add_reviewer_question(
        self,
        question: str,
        severity: str,
        citation: str,
        required_evidence: list[str],
        field: str = "",
    ) -> None:
        """Track an anticipated FDA reviewer question."""
        self.reviewer_questions.append({
            "question": question,
            "severity": severity,
            "citation": citation,
            "required_evidence": required_evidence,
            "field": field,
        })

    def add_toxicity_warning(
        self,
        k_number: str,
        signal_type: str,
        signal_date: str | None,
        severity_score: float,
        description: str,
    ) -> None:
        """Track a toxic predicate warning."""
        self.toxicity_warnings.append({
            "k_number": k_number,
            "signal_type": signal_type,
            "signal_date": signal_date,
            "severity_score": severity_score,
            "description": description[:500],
        })

    def calculate_defense_readiness(self) -> float:
        """Score 0–100 based on evidence completeness, severity, and gaps."""
        if not self.cells:
            return 0.0

        total = len(self.cells)
        score = 0.0

        # 30 pts: No NOT_EQUIVALENT cells
        not_eq = sum(1 for c in self.cells if c["equivalence_status"] == "NOT_EQUIVALENT")
        score += max(0, 30.0 - (not_eq * 15.0))

        # 25 pts: Evidence coverage
        with_evidence = sum(1 for c in self.cells if c["evidence_complete"])
        score += 25.0 * (with_evidence / total)

        # 20 pts: No CRITICAL severity
        critical = sum(1 for c in self.cells if c["diff_severity"] == "critical")
        score += max(0, 20.0 - (critical * 10.0))

        # 15 pts: No toxicity warnings
        if not self.toxicity_warnings:
            score += 15.0
        else:
            score += max(0, 15.0 - (len(self.toxicity_warnings) * 7.5))

        # 10 pts: Low question count
        high_q = sum(
            1 for q in self.reviewer_questions
            if q["severity"] in ("critical", "high")
        )
        score += max(0, 10.0 - (high_q * 2.5))

        return round(min(score, 100.0), 1)

    def build(self) -> dict[str, Any]:
        """Produce the final defense_manifest.json payload."""
        readiness = self.calculate_defense_readiness()

        # Create content hash for integrity verification
        content = json.dumps(self.cells, sort_keys=True, default=str)
        manifest_hash = hashlib.sha256(content.encode()).hexdigest()

        missing_evidence = [
            {
                "row_index": c["row_index"],
                "characteristic": c["characteristic"],
                "category": c["category"],
                "missing_from": (
                    "subject" if not c["subject"]["has_evidence"]
                    else "predicate" if not c["predicate"]["has_evidence"]
                    else "none"
                ),
            }
            for c in self.cells
            if not c["evidence_complete"]
        ]

        return {
            "manifest_version": "6.6.0",
            "generated_at": self.generated_at,
            "manifest_hash": manifest_hash,
            "subject_device_name": self.subject_device_name,
            "predicate_k_number": self.predicate_k_number,
            "predicate_device_name": self.predicate_device_name,
            "defense_readiness_score": readiness,
            "summary": {
                "total_cells": len(self.cells),
                "equivalent_count": sum(
                    1 for c in self.cells
                    if c["equivalence_status"] == "EQUIVALENT"
                ),
                "discussion_required_count": sum(
                    1 for c in self.cells
                    if c["equivalence_status"] == "DISCUSSION_REQUIRED"
                ),
                "not_equivalent_count": sum(
                    1 for c in self.cells
                    if c["equivalence_status"] == "NOT_EQUIVALENT"
                ),
                "evidence_complete_count": sum(
                    1 for c in self.cells if c["evidence_complete"]
                ),
                "missing_evidence_count": len(missing_evidence),
            },
            "cells": self.cells,
            "missing_evidence": missing_evidence,
            "reviewer_questions": self.reviewer_questions,
            "toxicity_warnings": self.toxicity_warnings,
        }


def build_manifest_from_se_payload(
    se_payload: dict[str, Any],
    reviewer_questions: list[dict[str, Any]] | None = None,
    toxicity_warnings: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Convenience: build manifest directly from SE matrix generator output.

    Args:
        se_payload: Output of SEMatrixGenerator.generate_payload()
        reviewer_questions: From /reviewer-questions endpoint
        toxicity_warnings: From toxic-detail or defense-preview

    Returns:
        defense_manifest.json payload
    """
    manifest = DefenseManifest(
        subject_device_name=se_payload.get("device_name", "Unknown"),
        predicate_k_number=se_payload.get("predicate_k_number", ""),
        predicate_device_name=se_payload.get("predicate_device_name", ""),
    )

    for idx, row in enumerate(se_payload.get("comparison_rows", [])):
        manifest.add_cell(
            row_index=idx,
            characteristic=row.get("characteristic", ""),
            category=row.get("category", ""),
            subject_value=row.get("subject_value", {}),
            predicate_value=row.get("predicate_value", {}),
            equivalence_status=row.get("equivalence_status", "PENDING"),
            diff_severity=row.get("diff_severity", "none"),
            discussion_text=row.get("discussion_text", ""),
            requires_citation=row.get("requires_citation", False),
            suggested_tests=row.get("suggested_tests"),
        )

    for q in (reviewer_questions or []):
        manifest.add_reviewer_question(
            question=q.get("question", ""),
            severity=q.get("severity", "medium"),
            citation=q.get("citation", ""),
            required_evidence=q.get("required_evidence", []),
            field=q.get("field", ""),
        )

    for w in (toxicity_warnings or []):
        manifest.add_toxicity_warning(
            k_number=w.get("k_number", ""),
            signal_type=w.get("signal_type", ""),
            signal_date=w.get("signal_date"),
            severity_score=w.get("severity_score", 0.0),
            description=w.get("description", ""),
        )

    return manifest.build()
