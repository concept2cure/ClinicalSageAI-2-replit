"""Risk Vocabulary Hash Helper — Phase 6.6.D+.

Deterministic hash of risk_vocab.yml for staleness detection.

Usage:
    from shadow_service.predicate_intel.risk_vocab import load_risk_vocab_hash

    h = load_risk_vocab_hash()  # sha256 of raw bytes
"""

from __future__ import annotations

import hashlib
from pathlib import Path


_VOCAB_PATH = Path(__file__).parent / "risk_vocab.yml"


def load_risk_vocab_hash(path: str | Path | None = None) -> str:
    """Return sha256 hex digest of risk_vocab.yml bytes."""
    target = Path(path) if path else _VOCAB_PATH
    return hashlib.sha256(target.read_bytes()).hexdigest()
