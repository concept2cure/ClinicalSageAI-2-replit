"""
Review Runner - Phase 3 + A5 Event Emission + A7 Batch Review

Orchestrates Shadow FDA Reviewer evaluation pipeline.

Workflow:
1. Validate document graph (anchors + xrefs)
2. Run all registered rules
3. Emit review.findings_created event (if event_store provided)
4. Return deterministic, sorted findings

Batch Workflow:
1. Sort documents by content_hash (then doc_id as tiebreaker)
2. Review each document (emitting findings_created per doc)
3. Emit review.batch_completed summary event
4. Return deterministic BatchReviewResult
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Tuple
from uuid import UUID
import subprocess

from lumen_cortex.core.canonical import CanonicalDocument, Finding
from lumen_cortex.core.canonical.finding import sort_findings
from lumen_cortex.core.events import (
    EventStoreAdapter,
    EventType,
    RPSEvent,
    ReviewFindingsPayload,
    BatchCompletedPayload,
    BatchDocumentSummary,
    derive_submission_uuid,
    derive_review_event_id,
    derive_batch_id,
    derive_batch_event_id,
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


@dataclass(frozen=True)
class BatchDocumentResult:
    """Result for a single document in a batch review."""
    doc_id: str
    content_hash: str
    findings: tuple
    findings_digest: str

    @property
    def findings_count(self) -> int:
        return len(self.findings)


@dataclass(frozen=True)
class BatchReviewResult:
    """
    Immutable result of batch Shadow FDA Reviewer evaluation.

    Documents are sorted by content_hash, then doc_id for determinism.
    """
    batch_id: str
    program_id: str
    extractor_version: str
    ruleset_version: str
    documents: tuple  # Tuple[BatchDocumentResult, ...]

    @property
    def total_documents(self) -> int:
        return len(self.documents)

    @property
    def total_findings(self) -> int:
        return sum(d.findings_count for d in self.documents)

    @property
    def findings_by_severity(self) -> Dict[str, int]:
        """Aggregate severity counts across all documents."""
        counts: Dict[str, int] = {"Critical": 0, "Major": 0, "Minor": 0, "Informational": 0}
        for doc_result in self.documents:
            for finding in doc_result.findings:
                counts[finding.severity] = counts.get(finding.severity, 0) + 1
        return counts

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "batch_id": self.batch_id,
            "program_id": self.program_id,
            "documents": [
                {
                    "filename": None,
                    "doc_id": d.doc_id,
                    "content_hash": d.content_hash,
                    "findings_count": d.findings_count,
                    "findings_digest": d.findings_digest,
                    "findings_truncated": False,
                    "findings_preview": [
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
                        for f in d.findings
                    ],
                    "errors": [],
                }
                for d in self.documents
            ],
            "summary": {
                "documents": self.total_documents,
                "findings_total": self.total_findings,
                "by_severity": self.findings_by_severity,
            },
        }


def _compute_findings_digest(findings: List[Finding]) -> str:
    """
    Compute deterministic digest of findings.

    Digest = SHA-256 of |-joined fingerprints (sorted).
    """
    sorted_fingerprints = sorted(f.fingerprint for f in findings)
    joined = "|".join(sorted_fingerprints)
    return hashlib.sha256(joined.encode()).hexdigest()


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

    def review_batch(
        self,
        docs: List[CanonicalDocument],
        program_id: UUID,
        extractor_version: Optional[str] = None,
        ruleset_version: Optional[str] = None,
        content_hashes: Optional[List[str]] = None,
    ) -> BatchReviewResult:
        """
        Review multiple documents in a deterministic batch.

        Documents are sorted by (content_hash, doc_id) before processing.
        Emits N review.findings_created events + 1 review.batch_completed event.

        Args:
            docs: List of CanonicalDocuments to review
            program_id: Program/tenant isolation key (required)
            extractor_version: Override extractor version
            ruleset_version: Override ruleset version (for contract)

        Returns:
            BatchReviewResult with deterministic ordering
        """
        ext_version = extractor_version or self._extractor_version
        rule_version = ruleset_version or self._registry.version

        # Determinism Contract:
        # - Documents are sorted by (content_hash, doc_id)
        # - Findings are sorted by registry order (severity rank → rule_id → evidence tuple)
        # Step 1: Sort documents by content_hash, then doc_id for determinism
        sorted_docs = sorted(docs, key=lambda d: (d.content_hash, str(d.doc_id)))

        # Step 2: Compute batch_id from content hashes (order independent, doc_id agnostic)
        batch_hashes = content_hashes or [d.content_hash for d in docs]
        batch_id = derive_batch_id(
            program_id=program_id,
            ruleset_version=rule_version,
            extractor_version=ext_version,
            content_hashes=batch_hashes,
        )

        # Step 3: Review each document (emits findings_created per doc)
        doc_results: List[BatchDocumentResult] = []
        for doc in sorted_docs:
            # Run review (which may emit findings_created event)
            validation = self._validator.validate(doc)
            findings = self._registry.evaluate_all(
                doc=doc,
                validation_result=validation,
                extractor_version=ext_version,
            )

            # Emit findings_created event if event_store configured
            if self._event_store is not None:
                self._emit_findings_event(doc, findings)

            # Compute deterministic findings digest
            findings_digest = _compute_findings_digest(findings)

            doc_results.append(BatchDocumentResult(
                doc_id=str(doc.doc_id),
                content_hash=doc.content_hash,
                findings=tuple(findings),
                findings_digest=findings_digest,
            ))

        # Step 4: Emit batch_completed event
        if self._event_store is not None:
            self._emit_batch_completed_event(
                batch_id=batch_id,
                program_id=program_id,
                doc_results=doc_results,
                ext_version=ext_version,
                rule_version=rule_version,
            )

        # Step 5: Return deterministic result
        return BatchReviewResult(
            batch_id=str(batch_id),
            program_id=str(program_id),
            extractor_version=ext_version,
            ruleset_version=rule_version,
            documents=tuple(doc_results),
        )

    def _emit_batch_completed_event(
        self,
        batch_id: UUID,
        program_id: UUID,
        doc_results: List[BatchDocumentResult],
        ext_version: str,
        rule_version: str,
    ) -> None:
        """
        Emit review.batch_completed summary event.

        Creates a compact, deterministic event with:
        - Per-doc: doc_id, content_hash, findings_count, findings_digest
        - Totals: total_documents, total_findings, by_severity
        """
        # Build document summaries
        doc_summaries = [
            BatchDocumentSummary(
                doc_id=d.doc_id,
                content_hash=d.content_hash,
                findings_count=d.findings_count,
                findings_digest=d.findings_digest,
            )
            for d in doc_results
        ]

        # Aggregate severity counts
        severity_counts: Dict[str, int] = {"Critical": 0, "Major": 0, "Minor": 0, "Informational": 0}
        for d in doc_results:
            for f in d.findings:
                severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1

        payload = BatchCompletedPayload(
            batch_id=str(batch_id),
            documents=doc_summaries,
            total_documents=len(doc_results),
            total_findings=sum(d.findings_count for d in doc_results),
            findings_by_severity=severity_counts,
            ruleset_version=rule_version,
            extractor_version=ext_version,
        )

        # Derive deterministic event_id
        payload_dict = payload.to_dict()
        payload_hash = compute_content_hash(payload_dict)
        event_id = derive_batch_event_id(
            program_id=program_id,
            batch_id=batch_id,
            payload_hash=payload_hash,
        )

        # Use batch_id as submission_uuid for batch events
        event = RPSEvent(
            event_id=event_id,
            program_id=program_id,
            submission_uuid=batch_id,  # batch_id serves as submission context
            event_type=EventType.REVIEW_BATCH_COMPLETED,
            event_timestamp=self._timestamp_factory(),
            actor_id="shadow-reviewer-batch",
            content_hash=payload_hash,
            payload=payload_dict,
            ordinal=0,
        )

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
