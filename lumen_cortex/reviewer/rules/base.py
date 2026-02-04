"""
Rule Base Classes - Phase 3

Abstract base and registry for deterministic rule implementations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, TYPE_CHECKING

if TYPE_CHECKING:
    from lumen_cortex.core.canonical import CanonicalDocument, Finding
    from lumen_cortex.graph import ValidationResult


class Rule(ABC):
    """
    Abstract base class for Shadow FDA Reviewer rules.

    Each rule must:
    1. Have a unique rule_id (R001-R999)
    2. Produce deterministic findings
    3. Include regulatory citations
    """

    @property
    @abstractmethod
    def rule_id(self) -> str:
        """Rule identifier (e.g., 'R001')"""
        ...

    @property
    @abstractmethod
    def rule_name(self) -> str:
        """Human-readable rule name"""
        ...

    @property
    @abstractmethod
    def cfr_citation(self) -> str | None:
        """FDA CFR citation (e.g., '21 CFR 312.23(a)(7)')"""
        ...

    @property
    @abstractmethod
    def ich_reference(self) -> str | None:
        """ICH guidance reference (e.g., 'ICH CTD Module 2 (M4)')"""
        ...

    @property
    @abstractmethod
    def severity(self) -> str:
        """Default severity: Critical|Major|Minor|Informational"""
        ...

    @abstractmethod
    def evaluate(
        self,
        doc: "CanonicalDocument",
        validation_result: "ValidationResult",
        extractor_version: str,
        ruleset_version: str,
    ) -> List["Finding"]:
        """
        Evaluate rule against document.

        Args:
            doc: The canonical document to analyze
            validation_result: Pre-computed graph validation result
            extractor_version: Git SHA or version string
            ruleset_version: Rule registry version

        Returns:
            List of Finding objects (deterministically ordered)
        """
        ...


class RuleRegistry:
    """
    Registry of active rules for Shadow FDA Reviewer.

    Maintains deterministic ordering by rule_id.
    """

    # Ruleset version - bump when rules change
    VERSION: str = "1.0.0"

    def __init__(self):
        self._rules: Dict[str, Rule] = {}

    def register(self, rule: Rule) -> None:
        """Register a rule implementation."""
        if rule.rule_id in self._rules:
            raise ValueError(f"Rule {rule.rule_id} already registered")
        self._rules[rule.rule_id] = rule

    def get(self, rule_id: str) -> Rule | None:
        """Get rule by ID."""
        return self._rules.get(rule_id)

    def all_rules(self) -> List[Rule]:
        """Get all rules in deterministic order (by rule_id)."""
        return [self._rules[k] for k in sorted(self._rules.keys())]

    def evaluate_all(
        self,
        doc: "CanonicalDocument",
        validation_result: "ValidationResult",
        extractor_version: str,
    ) -> List["Finding"]:
        """
        Evaluate all rules against document.

        Returns findings sorted deterministically.
        """
        from lumen_cortex.core.canonical.finding import sort_findings

        all_findings: List["Finding"] = []

        # Evaluate in deterministic order
        for rule in self.all_rules():
            findings = rule.evaluate(
                doc=doc,
                validation_result=validation_result,
                extractor_version=extractor_version,
                ruleset_version=self.VERSION,
            )
            all_findings.extend(findings)

        return sort_findings(all_findings)

    @property
    def version(self) -> str:
        """Registry version for Finding traceability."""
        return self.VERSION

    def __len__(self) -> int:
        return len(self._rules)
