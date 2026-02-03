"""
Lumen Cortex Reviewer Package - Phase 3

Shadow FDA Reviewer: Rule-based deficiency detection
"""

from .run import ReviewRunner, ReviewResult, review_document
from .rules import RuleRegistry, RULE_REGISTRY

# Optional API router (requires FastAPI)
try:
    from .api import router as review_router
    __all__ = [
        "ReviewRunner",
        "ReviewResult",
        "review_document",
        "RuleRegistry",
        "RULE_REGISTRY",
        "review_router",
    ]
except ImportError:
    # FastAPI not installed - API not available
    review_router = None
    __all__ = [
        "ReviewRunner",
        "ReviewResult",
        "review_document",
        "RuleRegistry",
        "RULE_REGISTRY",
    ]
