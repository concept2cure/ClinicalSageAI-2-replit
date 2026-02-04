"""
Review Runner - Phase 3 + A5 Event Emission

Orchestrates Shadow FDA Reviewer evaluation pipeline.

Workflow:
1. Validate document graph (anchors + xrefs)
2. Run all registered rules
3. Emit review.findings_created event (if event_store provided)
4. Return deterministic, sorted findings
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, List, Optional, Tuple
from uuid import UUID
import subprocess

from lumen_cortex.core.canonical import CanonicalDocument, Finding
from lumen_cortex.core.canonical.finding import sort_findings
from lumen_cortex.core.events import (
    EventStoreAdapter,
    EventType,
    RPSEvent,
    ReviewFindingsPayload,
    derive_submission_uuid,
    derive_review_event_id,
    compute_content_hash,
)
from lumen_cortex.graph import GraphValidator, ValidationResult

from .rules import RULE_REGISTRY, RuleRegistry

# Type alias for timestamp factory (enables deterministic testing)
TimestampFactory = Callable[[], datetime]


def _get_git_sha() -> str:
    """Get current git SHA for extractor versioning."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def _default_timestamp_factory() -> datetime:
    """Default timestamp factory: returns current UTC time."""
    return datetime.now(timezone.utc)


# Cache git SHA at module load time for determinism
_EXTRACTOR_VERSION: str = _get_git_sha()

# Environment variable to enable/disable event emission
LUMEN_EVENTSTORE_ENABLED = os.environ.get("LUMEN_EVENTSTORE_ENABLED", "false").lower() == "true"



@dataclass(frozen=True)
class ReviewResult:
    """
    Immutable result of Shadow FDA Reviewer evaluation.

    Contains validation summary and findings.
    """
    doc_id: str
    content_hash: str
    extractor_version: str
    ruleset_version: str

    # Validation summary
    anchor_count: int
    xref_count: int
    broken_ref_count: int
    duplicate_anchor_count: int

    # Findings (frozen tuple)
    findings: tuple

    @property
    def finding_count(self) -> int:
        return len(self.findings)

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "Critical")

    @property
    def major_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "Major")

    @property
    def minor_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == "Minor")

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "document": {
                "doc_id": self.doc_id,
                "content_hash": self.content_hash,
            },
            "versions": {
                "extractor": self.extractor_version,
                "ruleset": self.ruleset_version,
            },
            "summary": {
                "anchors": self.anchor_count,
                "cross_references": self.xref_count,
                "broken_refs": self.broken_ref_count,
                "duplicate_anchors": self.duplicate_anchor_count,
                "findings_total": self.finding_count,
                "findings_critical": self.critical_count,
                "findings_major": self.major_count,
                "findings_minor": self.minor_count,
            },
            "findings": [
                {
                    "finding_id": str(f.finding_id),
                    "rule_id": f.rule_id,
                    "rule_name": f.rule_name,
                    "severity": f.severity,
                    "confidence": f.confidence,
                    "description": f.description,
                    "remediation": f.remediation,
                    "evidence": {
                        "paragraph_index": f.evidence.paragraph_index,
                        "text_hash": f.evidence.text_hash,
                    },
                    "fingerprint": f.fingerprint,
                }
                for f in self.findings
            ],
        }

    def to_markdown(self) -> str:
        """Generate markdown report."""
        lines = [
            "# Shadow FDA Reviewer Report",
            "",
            f"**Document ID:** `{self.doc_id}`",
            f"**Content Hash:** `{self.content_hash[:16]}...`",
            f"**Extractor Version:** `{self.extractor_version}`",
            f"**Ruleset Version:** `{self.ruleset_version}`",
            "",
            "## Summary",
            "",
            "| Metric | Count |",
            "|--------|-------|",
            f"| Anchors | {self.anchor_count} |",
            f"| Cross-References | {self.xref_count} |",
            f"| Broken Refs | {self.broken_ref_count} |",
            f"| Duplicate Anchors | {self.duplicate_anchor_count} |",
            f"| **Total Findings** | **{self.finding_count}** |",
            f"| Critical | {self.critical_count} |",
            f"| Major | {self.major_count} |",
            f"| Minor | {self.minor_count} |",
            "",
        ]

        if self.findings:
            lines.extend([
                "## Findings",
                "",
            ])

            # Group by severity
            for severity in ["Critical", "Major", "Minor", "Informational"]:
                severity_findings = [f for f in self.findings if f.severity == severity]
                if severity_findings:
                    lines.append(f"### {severity} ({len(severity_findings)})")
                    lines.append("")
                    for finding in severity_findings:
                        lines.extend([
                            f"#### {finding.rule_id}: {finding.rule_name}",
                            "",
                            f"**Description:** {finding.description}",
                            "",
                            f"**Remediation:** {finding.remediation}",
                            "",
                            f"**Location:** Paragraph {finding.evidence.paragraph_index}",
                            "",
                            f"**Fingerprint:** `{finding.fingerprint[:16]}...`",
                            "",
                            "---",
                            "",
                        ])
        else:
            lines.extend([
                "## Findings",
                "",
                "✅ No deficiencies detected.",
                "",
            ])

        return "\n".join(lines)


class ReviewRunner:
    """
    Orchestrates Shadow FDA Reviewer evaluation.

    Usage:
        runner = ReviewRunner(program_id=uuid)
        result = runner.review(canonical_doc)
        print(result.to_markdown())

    With event emission:
        runner = ReviewRunner(
            program_id=uuid,
            event_store=adapter,
        )
        result = runner.review(canonical_doc)
        # Event emitted to vault.rps_events
    """

    def __init__(
        self,
        program_id: Optional[UUID] = None,
        registry: Optional[RuleRegistry] = None,
        extractor_version: Optional[str] = None,
        event_store: Optional[EventStoreAdapter] = None,
        timestamp_factory: Optional[TimestampFactory] = None,
    ):
        """
        Initialize reviewer.

        Args:
            program_id: Program/tenant isolation key (required for event emission)
            registry: Rule registry (default: RULE_REGISTRY)
            extractor_version: Override version (default: git SHA)
            event_store: Optional adapter for event emission to vault.rps_events
            timestamp_factory: Optional factory for timestamps (for deterministic tests)
        """
        self._program_id = program_id
        self._registry = registry or RULE_REGISTRY
        self._extractor_version = extractor_version or _EXTRACTOR_VERSION
        self._event_store = event_store
        self._timestamp_factory = timestamp_factory or _default_timestamp_factory
        self._validator = GraphValidator()

    def review(self, doc: CanonicalDocument) -> ReviewResult:
        """
        Run full Shadow FDA Reviewer evaluation.

        Returns deterministic ReviewResult with sorted findings.
        Emits review.findings_created event if event_store is configured.
        """
        # Step 1: Validate document graph
        validation = self._validator.validate(doc)

        # Step 2: Run all rules
        findings = self._registry.evaluate_all(
            doc=doc,
            validation_result=validation,
            extractor_version=self._extractor_version,
        )

        # Step 3: Emit event if event_store is provided and program_id is set
        if self._event_store is not None and self._program_id is not None:
            self._emit_findings_event(doc, findings)

        # Step 4: Build result (findings already sorted by registry)
        return ReviewResult(
            doc_id=str(doc.doc_id),
            content_hash=doc.content_hash,
            extractor_version=self._extractor_version,
            ruleset_version=self._registry.version,
            anchor_count=validation.anchor_count,
            xref_count=validation.xref_count,
            broken_ref_count=validation.broken_count,
            duplicate_anchor_count=validation.duplicate_anchor_count,
            findings=tuple(findings),
        )

    def _emit_findings_event(
        self,
        doc: CanonicalDocument,
        findings: List[Finding],
    ) -> None:
        """
        Emit a single review.findings_created event to the event store.

        Creates a deterministic event with:
        - submission_uuid derived from doc_id
        - event_id derived from program_id + doc_id + payload_hash
        - Payload containing finding count, rule_ids, severity breakdown, fingerprints
        """
        # Build typed payload
        findings_by_severity = {}
        for f in findings:
            findings_by_severity[f.severity] = findings_by_severity.get(f.severity, 0) + 1

        payload = ReviewFindingsPayload(
            document_id=str(doc.doc_id),
            rule_ids=sorted(set(f.rule_id for f in findings)),
            finding_count=len(findings),
            findings_by_severity=findings_by_severity,
            fingerprints=[f.fingerprint for f in findings],
            registry_version=self._registry.version,
        )

        # Derive deterministic identifiers
        submission_uuid = derive_submission_uuid(doc.doc_id)
        payload_dict = payload.to_dict()
        payload_hash = compute_content_hash(payload_dict)
        event_id = derive_review_event_id(
            program_id=self._program_id,
            doc_id=doc.doc_id,
            payload_hash=payload_hash,
        )

        # Create event with deterministic event_id
        event = RPSEvent(
            event_id=event_id,
            program_id=self._program_id,
            submission_uuid=submission_uuid,
            event_type=EventType.REVIEW_FINDINGS_CREATED,
            event_timestamp=self._timestamp_factory(),
            actor_id="shadow-reviewer",
            content_hash=payload_hash,
            payload=payload_dict,
            ordinal=0,
        )

        # Queue for emission (caller must flush)
        self._event_store.queue_event(event)

    @property
    def extractor_version(self) -> str:
        return self._extractor_version

    @property
    def ruleset_version(self) -> str:
        return self._registry.version

    @property
    def program_id(self) -> Optional[UUID]:
        return self._program_id


def review_document(doc: CanonicalDocument) -> ReviewResult:
    """
    Convenience function for document review.

    Usage:
        result = review_document(canonical_doc)
        print(result.to_markdown())
    """
    runner = ReviewRunner()
    return runner.review(doc)
