"""
Determinism Package

Provides testing harness for ensuring identical input → identical output.

@module lumen_cortex.core.determinism
"""

from .tests import (
    EPS,
    TEST_DOC_ID,
    TEST_FINDING_ID,
    TEST_CONTENT_HASH,
)

__all__ = [
    "EPS",
    "TEST_DOC_ID", 
    "TEST_FINDING_ID",
    "TEST_CONTENT_HASH",
]
