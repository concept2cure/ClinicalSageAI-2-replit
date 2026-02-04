"""
Graph Validation Module - Phase 2

Deterministic validation of document graph (anchors + cross-references).
"""

from .validator import GraphValidator, ValidationResult

__all__ = ["GraphValidator", "ValidationResult"]
