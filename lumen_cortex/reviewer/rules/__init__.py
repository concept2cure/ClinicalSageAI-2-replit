"""
Rule Registry - Phase 3

Deterministic rule implementations for Shadow FDA Reviewer.

Rules:
- R001: Broken Cross-Reference
- R002: Duplicate Anchor
- R003: Required CTD Section Missing
"""

from .base import Rule, RuleRegistry
from .r001_broken_xref import R001BrokenXref
from .r002_duplicate_anchor import R002DuplicateAnchor
from .r003_required_sections import R003RequiredSections

# Register all rules
RULE_REGISTRY = RuleRegistry()
RULE_REGISTRY.register(R001BrokenXref())
RULE_REGISTRY.register(R002DuplicateAnchor())
RULE_REGISTRY.register(R003RequiredSections())

__all__ = [
    "Rule",
    "RuleRegistry",
    "RULE_REGISTRY",
    "R001BrokenXref",
    "R002DuplicateAnchor",
    "R003RequiredSections",
]
