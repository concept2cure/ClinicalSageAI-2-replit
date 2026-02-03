"""
Review Runner - Phase 3

Orchestrates Shadow FDA Reviewer evaluation pipeline.

Workflow:
1. Validate document graph (anchors + xrefs)
2. Run all registered rules
3. Return deterministic, sorted findings
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional
import subprocess

from lumen_cortex.core.canonical import CanonicalDocument, Finding
from lumen_cortex.core.canonical.finding import sort_findings
from lumen_cortex.graph import GraphValidator, ValidationResult

from .rules import RULE_REGISTRY, RuleRegistry


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


# Cache git SHA at module load time for determinism
_EXTRACTOR_VERSION: str = _get_git_sha()


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
        runner = ReviewRunner()
        result = runner.review(canonical_doc)
        print(result.to_markdown())
    """

    def __init__(
        self,
        registry: Optional[RuleRegistry] = None,
        extractor_version: Optional[str] = None,
    ):
        """
        Initialize reviewer.

        Args:
            registry: Rule registry (default: RULE_REGISTRY)
            extractor_version: Override version (default: git SHA)
        """
        self._registry = registry or RULE_REGISTRY
        self._extractor_version = extractor_version or _EXTRACTOR_VERSION
        self._validator = GraphValidator()

    def review(self, doc: CanonicalDocument) -> ReviewResult:
        """
        Run full Shadow FDA Reviewer evaluation.

        Returns deterministic ReviewResult with sorted findings.
        """
        # Step 1: Validate document graph
        validation = self._validator.validate(doc)

        # Step 2: Run all rules
        findings = self._registry.evaluate_all(
            doc=doc,
            validation_result=validation,
            extractor_version=self._extractor_version,
        )

        # Step 3: Build result (findings already sorted by registry)
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

    @property
    def extractor_version(self) -> str:
        return self._extractor_version

    @property
    def ruleset_version(self) -> str:
        return self._registry.version


def review_document(doc: CanonicalDocument) -> ReviewResult:
    """
    Convenience function for document review.

    Usage:
        result = review_document(canonical_doc)
        print(result.to_markdown())
    """
    runner = ReviewRunner()
    return runner.review(doc)
