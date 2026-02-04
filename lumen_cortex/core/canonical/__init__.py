"""
Canonical Models Package - Frozen v1.0

SPEC FREEZE v1.0: These schemas are immutable. Changes require version bumps.

Exports:
- EvidencePointer: Deterministic location reference
- CanonicalDocument: Parser-agnostic document representation
- Finding: Structured deficiency report with fingerprint

@module lumen_cortex.core.canonical
"""

from .evidence_pointer import (
    EvidencePointer,
    evidence_sort_tuple,
)

from .document import (
    CanonicalDocument,
    CanonicalParagraph,
    CanonicalRun,
    CanonicalTable,
    CanonicalCell,
    AnchorLocation,
    CrossRef,
)

from .finding import (
    Finding,
    SEVERITY_RANK,
    finding_sort_key,
    sort_findings,
)


__all__ = [
    # Evidence Pointer
    "EvidencePointer",
    "evidence_sort_tuple",

    # Document Model
    "CanonicalDocument",
    "CanonicalParagraph",
    "CanonicalRun",
    "CanonicalTable",
    "CanonicalCell",
    "AnchorLocation",
    "CrossRef",

    # Finding Model
    "Finding",
    "SEVERITY_RANK",
    "finding_sort_key",
    "sort_findings",
]
