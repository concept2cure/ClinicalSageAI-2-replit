"""Deterministic SE Row Risk Code Scorer — Phase 6.6.C.

Pure function: assign_se_row_risks(row_type, subject, predicate, vocab)

Rules:
  - No network calls
  - No DB calls
  - No time-based logic
  - Same input → same output, always

Handles all 9 default SE rows:
  1. intended_use   → IU_MISMATCH / INDICATIONS_EXPANDED
  2. technology     → TECH_DIFFERENCE / DESIGN_ARCH_CHANGE
  3. materials      → MATERIAL_CHANGE
  4. energy_source  → ENERGY_SOURCE_CHANGE
  5. biocompatibility (tissue_contact) → TISSUE_CONTACT_CHANGE / CONTACT_DURATION_CHANGE
  6. sterilization  → STERILIZATION_METHOD_CHANGE
  7. software       → SOFTWARE_PRESENT_NEW / SOFTWARE_SAFETY_CLASS_DIFF
  8. performance    → PERFORMANCE_CLAIM_CHANGE
  9. general        → LABELING_IFU_GAP

Usage:
    from shadow_service.predicate_intel.se_risk_codes import assign_se_row_risks, load_vocab

    vocab = load_vocab()
    result = assign_se_row_risks("materials", "Titanium", "Stainless steel", vocab)
"""

from __future__ import annotations

import pathlib
import re
from typing import Any, Optional

import yaml

from ..scoring.risk_code_map import (
    RISK_CODE_DISCUSSION_TEMPLATE,
    SIGNIFICANT_RISK_CODES,
)


# ─────────────────────────────────────────────────────────────────────────────
# Config loading
# ─────────────────────────────────────────────────────────────────────────────

_VOCAB_PATH = pathlib.Path(__file__).parent / "risk_vocab.yml"
_CACHED_VOCAB: dict[str, Any] | None = None


def load_vocab(path: pathlib.Path | None = None) -> dict[str, Any]:
    """Load risk vocabulary from YAML config. Cached after first load."""
    global _CACHED_VOCAB
    if _CACHED_VOCAB is not None and path is None:
        return _CACHED_VOCAB
    target = path or _VOCAB_PATH
    with open(target, "r") as f:
        vocab = yaml.safe_load(f)
    if path is None:
        _CACHED_VOCAB = vocab
    return vocab


def clear_vocab_cache() -> None:
    """Clear cached vocab (for testing)."""
    global _CACHED_VOCAB
    _CACHED_VOCAB = None


# ─────────────────────────────────────────────────────────────────────────────
# Normalization helpers
# ─────────────────────────────────────────────────────────────────────────────

def norm(s: str) -> str:
    """Lowercase, trim, collapse whitespace, remove punctuation except / and -."""
    s = s.strip().lower()
    # Remove punctuation except / and -
    s = re.sub(r"[^\w\s/\-]", "", s)
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s)
    return s


def tokens(s: str) -> set[str]:
    """Split norm(s) on whitespace, keep alphanumerics and / -."""
    return set(norm(s).split())


def is_empty(x: str) -> bool:
    """True if missing, blank, or 'n/a'."""
    n = norm(x)
    return n in ("", "n/a", "none", "na", "not applicable", "unknown")


def jaccard(set_a: set[str], set_b: set[str]) -> float:
    """Jaccard similarity: |intersection| / |union|."""
    if not set_a and not set_b:
        return 1.0
    union = set_a | set_b
    if not union:
        return 1.0
    return len(set_a & set_b) / len(union)


# ─────────────────────────────────────────────────────────────────────────────
# Enum coercers
# ─────────────────────────────────────────────────────────────────────────────

def _coerce_enum(value: str, enum_map: dict[str, str]) -> str:
    """Coerce a free-text value to a controlled enum using the map."""
    n = norm(value)
    if n in enum_map:
        return enum_map[n]
    # Try token-level matching (find first token that matches)
    for token in n.split():
        if token in enum_map:
            return enum_map[token]
    return "unknown"


def _normalize_materials(value: str, aliases: dict[str, str]) -> set[str]:
    """Normalize materials into a set using alias map.

    Splits on , ; / BEFORE normalizing each item (norm() strips commas).
    """
    raw_items = re.split(r"[,;/]+", value.strip())
    result: set[str] = set()
    for item in raw_items:
        item = norm(item)
        if not item or item in ("n/a", "none", ""):
            continue
        # Check alias map
        resolved = aliases.get(item, item)
        result.add(resolved)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Row scorers (6 core + 3 non-core)
# ─────────────────────────────────────────────────────────────────────────────

def _score_intended_use(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 1: Intended Use → IU_MISMATCH / INDICATIONS_EXPANDED.

    Rules:
      - overlap < 0.35 → IU_MISMATCH
      - overlap 0.35–0.60 with expansion tokens → INDICATIONS_EXPANDED
      - overlap 0.35–0.60 without expansion → IU_MISMATCH
      - overlap 0.60–0.80 with expansion tokens → INDICATIONS_EXPANDED
      - overlap >= 0.80 → EQUIVALENT
      - Priority: IU_MISMATCH > INDICATIONS_EXPANDED
    """
    if is_empty(subject) or is_empty(predicate):
        return _equivalent_result()

    subj_tokens = tokens(subject)
    pred_tokens = tokens(predicate)
    overlap = jaccard(subj_tokens, pred_tokens)

    # Very high overlap → EQUIVALENT
    if overlap >= 0.80:
        return _equivalent_result()

    expansion_tokens = set(vocab.get("indication_expansion_tokens", []))

    # Primary: IU_MISMATCH if overlap < 0.35
    if overlap < 0.35:
        return _risk_result(risk_code="IU_MISMATCH", triggered=["IU_MISMATCH"])

    # Moderate overlap (0.35–0.80)
    subj_has_expansion = bool((subj_tokens - pred_tokens) & expansion_tokens)

    if subj_has_expansion:
        return _risk_result(
            risk_code="INDICATIONS_EXPANDED",
            triggered=["INDICATIONS_EXPANDED"],
        )

    # Moderate overlap but no expansion tokens → IU_MISMATCH
    return _risk_result(risk_code="IU_MISMATCH", triggered=["IU_MISMATCH"])


def _score_technology(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 2: Technology → TECH_DIFFERENCE / DESIGN_ARCH_CHANGE.

    Rules:
      - Extract tech family tokens; symmetric difference → TECH_DIFFERENCE
      - Else check arch tokens; subject has new → DESIGN_ARCH_CHANGE
      - Priority: TECH_DIFFERENCE > DESIGN_ARCH_CHANGE
    """
    if is_empty(subject) or is_empty(predicate):
        return _equivalent_result()

    subj_norm = tokens(subject)
    pred_norm = tokens(predicate)

    if subj_norm == pred_norm:
        return _equivalent_result()

    # Check tech family tokens
    tech_families = vocab.get("tech_families", {})
    all_family_tokens: set[str] = set()
    for family_tokens in tech_families.values():
        all_family_tokens.update(family_tokens)

    subj_family = subj_norm & all_family_tokens
    pred_family = pred_norm & all_family_tokens

    if subj_family.symmetric_difference(pred_family):
        return _risk_result(
            risk_code="TECH_DIFFERENCE",
            triggered=["TECH_DIFFERENCE"],
        )

    # Check architecture tokens
    arch_tokens_set = set(vocab.get("arch_tokens", []))
    subj_arch = subj_norm & arch_tokens_set
    pred_arch = pred_norm & arch_tokens_set

    if subj_arch - pred_arch:
        return _risk_result(
            risk_code="DESIGN_ARCH_CHANGE",
            triggered=["DESIGN_ARCH_CHANGE"],
        )

    # Text differs but no family/arch token difference
    return _discussion_result()


def _score_materials(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 3: Materials → MATERIAL_CHANGE.

    Rules:
      - Normalize via alias map, compare sets
      - M_subj != M_pred → MATERIAL_CHANGE
    """
    if is_empty(subject) or is_empty(predicate):
        return _equivalent_result()

    aliases = vocab.get("material_aliases", {})
    m_subj = _normalize_materials(subject, aliases)
    m_pred = _normalize_materials(predicate, aliases)

    if not m_subj and not m_pred:
        return _equivalent_result()

    if not m_subj or not m_pred:
        return _equivalent_result()

    if m_subj != m_pred:
        return _risk_result(
            risk_code="MATERIAL_CHANGE",
            triggered=["MATERIAL_CHANGE"],
        )

    return _equivalent_result()


def _score_energy_source(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 4: Energy Source → ENERGY_SOURCE_CHANGE.

    Rules:
      - Normalize to controlled enum
      - If different → ENERGY_SOURCE_CHANGE
    """
    if is_empty(subject) or is_empty(predicate):
        return _equivalent_result()

    energy_map = vocab.get("energy_enum_map", {})
    subj_enum = _coerce_enum(subject, energy_map)
    pred_enum = _coerce_enum(predicate, energy_map)

    if subj_enum == "unknown" or pred_enum == "unknown":
        if norm(subject) == norm(predicate):
            return _equivalent_result()
        return _discussion_result()

    if subj_enum == pred_enum:
        return _equivalent_result()

    return _risk_result(
        risk_code="ENERGY_SOURCE_CHANGE",
        triggered=["ENERGY_SOURCE_CHANGE"],
    )


def _score_tissue_contact(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 5: Tissue Contact → TISSUE_CONTACT_CHANGE / CONTACT_DURATION_CHANGE.

    Two independent checks. Both can appear in triggered_risk_codes.
    Priority: TISSUE_CONTACT_CHANGE > CONTACT_DURATION_CHANGE for risk_code.
    """
    if is_empty(subject) or is_empty(predicate):
        return _equivalent_result()

    contact_map = vocab.get("tissue_contact_enum_map", {})
    duration_map = vocab.get("duration_enum_map", {})

    subj_contact = _coerce_enum(subject, contact_map)
    pred_contact = _coerce_enum(predicate, contact_map)
    subj_duration = _coerce_enum(subject, duration_map)
    pred_duration = _coerce_enum(predicate, duration_map)

    contact_changed = (
        subj_contact != "unknown"
        and pred_contact != "unknown"
        and subj_contact != pred_contact
    )
    duration_changed = (
        subj_duration != "unknown"
        and pred_duration != "unknown"
        and subj_duration != pred_duration
    )

    if not contact_changed and not duration_changed:
        if norm(subject) == norm(predicate):
            return _equivalent_result()
        return _discussion_result()

    triggered: list[str] = []
    primary: str | None = None

    if contact_changed:
        triggered.append("TISSUE_CONTACT_CHANGE")
        primary = "TISSUE_CONTACT_CHANGE"
    if duration_changed:
        triggered.append("CONTACT_DURATION_CHANGE")
        if primary is None:
            primary = "CONTACT_DURATION_CHANGE"

    return _risk_result(
        risk_code=primary,  # type: ignore[arg-type]
        triggered=triggered,
    )


def _score_sterilization(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 6: Sterilization → STERILIZATION_METHOD_CHANGE.

    Rules:
      - Normalize to enum
      - If different → STERILIZATION_METHOD_CHANGE
    """
    if is_empty(subject) or is_empty(predicate):
        return _equivalent_result()

    ster_map = vocab.get("sterilization_enum_map", {})
    subj_enum = _coerce_enum(subject, ster_map)
    pred_enum = _coerce_enum(predicate, ster_map)

    if subj_enum == "unknown" or pred_enum == "unknown":
        if norm(subject) == norm(predicate):
            return _equivalent_result()
        return _discussion_result()

    if subj_enum == pred_enum:
        return _equivalent_result()

    return _risk_result(
        risk_code="STERILIZATION_METHOD_CHANGE",
        triggered=["STERILIZATION_METHOD_CHANGE"],
    )


def _score_software(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 7: Software → SOFTWARE_PRESENT_NEW / SOFTWARE_SAFETY_CLASS_DIFF."""
    if is_empty(subject) and is_empty(predicate):
        return _equivalent_result()

    if norm(subject) == norm(predicate):
        return _equivalent_result()

    subj_has_sw = not is_empty(subject)
    pred_has_sw = not is_empty(predicate)

    if subj_has_sw and not pred_has_sw:
        return _risk_result(
            risk_code="SOFTWARE_PRESENT_NEW",
            triggered=["SOFTWARE_PRESENT_NEW"],
        )

    return _risk_result(
        risk_code="SOFTWARE_SAFETY_CLASS_DIFF",
        triggered=["SOFTWARE_SAFETY_CLASS_DIFF"],
    )


def _score_performance(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 8: Performance → PERFORMANCE_CLAIM_CHANGE."""
    if is_empty(subject) and is_empty(predicate):
        return _equivalent_result()

    if norm(subject) == norm(predicate):
        return _equivalent_result()

    return _risk_result(
        risk_code="PERFORMANCE_CLAIM_CHANGE",
        triggered=["PERFORMANCE_CLAIM_CHANGE"],
    )


def _score_general(
    subject: str, predicate: str, vocab: dict[str, Any],
) -> dict[str, Any]:
    """Row 9: General/Labeling → LABELING_IFU_GAP."""
    if is_empty(subject) and is_empty(predicate):
        return _equivalent_result()

    if norm(subject) == norm(predicate):
        return _equivalent_result()

    return _risk_result(
        risk_code="LABELING_IFU_GAP",
        triggered=["LABELING_IFU_GAP"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Result builders
# ─────────────────────────────────────────────────────────────────────────────

def _equivalent_result() -> dict[str, Any]:
    """Build EQUIVALENT result with no risk."""
    return {
        "risk_code": None,
        "triggered_risk_codes": [],
        "diff_flag": "EQUIVALENT",
        "discussion_text": "",
        "requires_citation": False,
    }


def _discussion_result() -> dict[str, Any]:
    """Build DISCUSSION_REQUIRED result with no specific risk_code."""
    return {
        "risk_code": None,
        "triggered_risk_codes": [],
        "diff_flag": "DISCUSSION_REQUIRED",
        "discussion_text": "Differences noted; discussion provided.",
        "requires_citation": True,
    }


def _risk_result(
    *,
    risk_code: str,
    triggered: list[str],
) -> dict[str, Any]:
    """Build result with risk_code and appropriate diff_flag.

    Diff flag rules (per spec):
      - Default → DISCUSSION_REQUIRED
      - Upgrade to SIGNIFICANT only for codes in SIGNIFICANT_RISK_CODES
    """
    if risk_code in SIGNIFICANT_RISK_CODES:
        diff_flag = "SIGNIFICANT"
    else:
        diff_flag = "DISCUSSION_REQUIRED"

    discussion = RISK_CODE_DISCUSSION_TEMPLATE.get(risk_code, "")

    return {
        "risk_code": risk_code,
        "triggered_risk_codes": triggered,
        "diff_flag": diff_flag,
        "discussion_text": discussion,
        "requires_citation": True,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Main scorer
# ─────────────────────────────────────────────────────────────────────────────

# Row type → scorer function
_ROW_SCORERS = {
    "intended_use": _score_intended_use,
    "technology": _score_technology,
    "materials": _score_materials,
    "energy_source": _score_energy_source,
    "biocompatibility": _score_tissue_contact,
    "sterilization": _score_sterilization,
    "software": _score_software,
    "performance": _score_performance,
    "general": _score_general,
}


def assign_se_row_risks(
    row_type: str,
    subject: str,
    predicate: str,
    vocab: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assign risk codes for a single SE comparison row.

    Pure function — no network, no DB, no time-based logic.
    Same input → same output, always.

    Args:
        row_type: One of the SE comparison category keys
                  (intended_use, technology, materials, energy_source,
                   biocompatibility, sterilization, software, performance,
                   general).
        subject: Subject device value for this characteristic.
        predicate: Predicate device value for this characteristic.
        vocab: Risk vocabulary dict (from load_vocab()). If None, loads default.

    Returns:
        {
            "risk_code": str | None,
            "triggered_risk_codes": list[str],
            "diff_flag": "EQUIVALENT" | "DISCUSSION_REQUIRED" | "SIGNIFICANT",
            "discussion_text": str,
            "requires_citation": bool,
        }
    """
    if vocab is None:
        vocab = load_vocab()

    scorer = _ROW_SCORERS.get(row_type)
    if scorer:
        return scorer(subject, predicate, vocab)

    # Fallback for truly unknown row types
    if norm(subject) == norm(predicate) or (is_empty(subject) and is_empty(predicate)):
        return _equivalent_result()

    return _discussion_result()
