"""
Cross-Reference Detection Module - Phase 2

Deterministic detection of document cross-references.
"""

from .detector import CrossRefDetector
from .models import CrossRef

__all__ = ["CrossRefDetector", "CrossRef"]
