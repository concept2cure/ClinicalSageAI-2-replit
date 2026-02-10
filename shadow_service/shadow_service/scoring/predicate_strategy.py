"""Predicate Strategy Scoring Engine — Phase 6.6.B (Spec-Compliant).

Deterministic "regulatory logic", no LLM required.
Implements:
  - Canonical subject feature extraction
  - Similarity score (0..1) with spec weights
  - Defense Readiness Score (0..100) with penalty system
  - Strategy recommendation with spec thresholds
  - Anticipated objections (templated)
  - Risk flags (typed code/severity/message)
  - Defense Packet Seed (evidence needs from objections)

Spec weights:
  intended_use token overlap: 0.40
  technology overlap:         0.35
  material overlap:           0.15
  recency boost:              0.10

DRS: starts at 100, subtracts penalties per spec.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any, Optional

from ..models_predicate import (
    DefensePacketSeed,
    EvidenceType,
    MatchSnippet,
    Objection,
    ObjectionSeverity,
    ObjectionTrigger,
    PredicateFlagCode,
    RiskFlag,
    RiskFlagSeverity,
    ScoreBreakdown,
    StrategyRecommendation,
)

# ─────────────────────────────────────────────────────────────────────────────
# Constants (spec-defined)
# ─────────────────────────────────────────────────────────────────────────────

# Similarity weights per spec
SIM_WEIGHT_INTENDED_USE = 0.40
SIM_WEIGHT_TECHNOLOGY = 0.35
SIM_WEIGHT_MATERIAL = 0.15
SIM_WEIGHT_RECENCY = 0.10

# Recency boost per spec
RECENCY_BOOST_2YR = 0.10
RECENCY_BOOST_5YR = 0.06
RECENCY_BOOST_10YR = 0.02

# DRS penalties per spec
DRS_PENALTY_MISSING_SUMMARY = 20
DRS_PENALTY_LOW_OVERLAP = 15
DRS_PENALTY_TISSUE_CONTACT_MISMATCH = 20
DRS_PENALTY_SOFTWARE_MISMATCH = 15
DRS_PENALTY_MATERIAL_MISMATCH = 10
DRS_PENALTY_ENERGY_SOURCE_MISMATCH = 20

# Strategy thresholds per spec
STRATEGY_AVOID_DRS_THRESHOLD = 60
STRATEGY_AGGRESSIVE_DRS_THRESHOLD = 85
STRATEGY_AGGRESSIVE_RECENCY_YEARS = 2
STRATEGY_CONSERVATIVE_RECENCY_YEARS = 5

# Low overlap threshold for DRS penalty
LOW_OVERLAP_THRESHOLD = 0.25

# Cyber/SW keywords
CYBER_KEYWORDS = frozenset({
    "cybersecurity", "sbom", "iec 62304", "iec62304", "software",
    "firmware", "samd", "ai/ml", "machine learning", "neural",
    "algorithm", "cloud", "wireless", "bluetooth", "wifi", "connected",
})

# Stop words for tokenization
_STOP_WORDS = frozenset(
    "a an the and or in of for to is on at by with from as it its "
    "this that are was were be been has have had not no".split()
)
_TOKEN_RE = re.compile(r"[a-z0-9]+")


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def compute_similarity(
    req_intended_use: str,
    req_technology: str,
    req_materials: list[str],
    candidate_text: str,
    candidate_name: str,
    recency_years: Optional[float],
) -> tuple[float, ScoreBreakdown]:
    """Compute weighted similarity score per spec.

    Returns (similarity_score, score_breakdown).
    """
    # Intended use overlap (0.40 weight)
    iu_score = _token_overlap(req_intended_use, candidate_text + " " + candidate_name)

    # Technology overlap (0.35 weight)
    tech_score = _token_overlap(req_technology, candidate_text + " " + candidate_name)

    # Material overlap (0.15 weight)
    if req_materials:
        mat_text = " ".join(req_materials)
        mat_score = _token_overlap(mat_text, candidate_text)
    else:
        mat_score = 0.0

    # Recency boost (0.10 weight)
    recency_score = _recency_boost(recency_years)

    similarity = _clamp01(
        SIM_WEIGHT_INTENDED_USE * iu_score
        + SIM_WEIGHT_TECHNOLOGY * tech_score
        + SIM_WEIGHT_MATERIAL * mat_score
        + SIM_WEIGHT_RECENCY * recency_score
    )

    breakdown = ScoreBreakdown(
        fts_score=round(iu_score, 4),
        name_match=round(tech_score, 4),
        recency_boost=round(recency_score, 4),
        completeness_bonus=round(mat_score, 4),
    )

    return round(similarity, 4), breakdown


def compute_drs(
    row: dict[str, Any],
    req_intended_use: str,
    req_materials: list[str] | None,
    req_tissue_contact: str | None,
    req_energy_source: str | None,
    req_software_present: bool | None,
    iu_overlap: float,
) -> tuple[int, list[RiskFlag], list[Objection]]:
    """Compute Defense Readiness Score per spec.

    Starts at 100, subtracts penalties. Also produces risk_flags + objections.
    Returns (drs, risk_flags, objections).
    """
    drs = 100
    flags: list[RiskFlag] = []
    objections: list[Objection] = []
    pred_text = _get_pred_text(row)
    has_text = bool(row.get("txt_content"))
    has_url = bool(row.get("summary_url"))

    # Penalty: missing txt_content/summary
    if not has_text and not has_url:
        drs -= DRS_PENALTY_MISSING_SUMMARY
        flags.append(RiskFlag(
            code=PredicateFlagCode.MISSING_SUMMARY_TEXT.value,
            severity=RiskFlagSeverity.MEDIUM,
            message="Predicate has no summary text or URL available for deep matching",
        ))

    # Penalty: low overlap
    if iu_overlap < LOW_OVERLAP_THRESHOLD:
        drs -= DRS_PENALTY_LOW_OVERLAP
        flags.append(RiskFlag(
            code=PredicateFlagCode.LOW_TEXT_MATCH.value,
            severity=RiskFlagSeverity.MEDIUM,
            message=f"Intended use overlap is low ({iu_overlap:.0%})",
        ))

    # Penalty: tissue contact mismatch (if provided)
    if req_tissue_contact and req_tissue_contact.lower() not in ("none", "n/a", ""):
        if req_tissue_contact.lower() not in pred_text:
            drs -= DRS_PENALTY_TISSUE_CONTACT_MISMATCH
            flags.append(RiskFlag(
                code=PredicateFlagCode.CONTACT_MISMATCH.value,
                severity=RiskFlagSeverity.HIGH,
                message=f"Tissue contact '{req_tissue_contact}' not found in predicate text",
            ))
            objections.append(Objection(
                trigger=ObjectionTrigger.TISSUE_CONTACT_DRIFT.value,
                severity=ObjectionSeverity.HIGH,
                question="Tissue contact characteristics differ from predicate. "
                         "Additional biocompatibility endpoints may be needed.",
                recommended_fix="Update ISO 10993-1 evaluation matrix for changed tissue contact and duration.",
                evidence_types=[EvidenceType.BIOCOMP.value, EvidenceType.RISK_ANALYSIS.value],
            ))

    # Penalty: software present mismatch
    if req_software_present:
        has_cyber = any(kw in pred_text for kw in CYBER_KEYWORDS)
        if not has_cyber:
            drs -= DRS_PENALTY_SOFTWARE_MISMATCH
            flags.append(RiskFlag(
                code=PredicateFlagCode.SOFTWARE_MISMATCH.value,
                severity=RiskFlagSeverity.MEDIUM,
                message="Subject has software but predicate lacks software/cyber documentation",
            ))
            objections.append(Objection(
                trigger=ObjectionTrigger.SOFTWARE_CYBER_GAP.value,
                severity=ObjectionSeverity.HIGH,
                question="Subject device has software but predicate lacks software/cybersecurity documentation. "
                         "IEC 62304 + PCCP required.",
                recommended_fix="Prepare IEC 62304 software lifecycle documentation and cybersecurity risk assessment.",
                evidence_types=[EvidenceType.SW_LIFECYCLE.value, EvidenceType.CYBERSECURITY.value],
            ))

    # Penalty: material mismatch
    if req_materials:
        if not any(m.lower() in pred_text for m in req_materials):
            drs -= DRS_PENALTY_MATERIAL_MISMATCH
            flags.append(RiskFlag(
                code=PredicateFlagCode.MATERIAL_MISMATCH.value,
                severity=RiskFlagSeverity.MEDIUM,
                message="Materials differ from predicate",
            ))
            objections.append(Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="Materials differ from predicate. Biocompatibility assessment required.",
                recommended_fix="Submit biocompatibility evaluation per ISO 10993-1 addressing changed materials.",
                evidence_types=[EvidenceType.BIOCOMP.value, EvidenceType.BENCH.value],
            ))

    # Penalty: energy source mismatch
    if req_energy_source and req_energy_source.lower() not in ("none", "n/a", ""):
        if req_energy_source.lower() not in pred_text:
            drs -= DRS_PENALTY_ENERGY_SOURCE_MISMATCH
            flags.append(RiskFlag(
                code=PredicateFlagCode.ENERGY_MISMATCH.value,
                severity=RiskFlagSeverity.HIGH,
                message=f"Energy source '{req_energy_source}' not found in predicate text",
            ))
            objections.append(Objection(
                trigger=ObjectionTrigger.ENERGY_SOURCE_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="Energy source differs. Electrical safety and EMC testing required.",
                recommended_fix="Provide IEC 60601-1 electrical safety and IEC 60601-1-2 EMC test reports.",
                evidence_types=[EvidenceType.BENCH.value],
            ))

    return max(0, min(100, drs)), flags, objections


def classify_strategy(
    drs: int,
    recency_years: Optional[float],
    has_high_mismatch: bool,
) -> StrategyRecommendation:
    """Strategy recommendation per spec thresholds.

    - readiness < 60 or any HIGH mismatch → AVOID
    - readiness >= 85 and decision_date <= 2 years → AGGRESSIVE
    - readiness >= 85 and decision_date > 5 years → CONSERVATIVE
    - Else → BALANCED
    """
    if drs < STRATEGY_AVOID_DRS_THRESHOLD or has_high_mismatch:
        return StrategyRecommendation.AVOID
    if drs >= STRATEGY_AGGRESSIVE_DRS_THRESHOLD:
        if recency_years is not None and recency_years <= STRATEGY_AGGRESSIVE_RECENCY_YEARS:
            return StrategyRecommendation.AGGRESSIVE
        if recency_years is not None and recency_years > STRATEGY_CONSERVATIVE_RECENCY_YEARS:
            return StrategyRecommendation.CONSERVATIVE
    return StrategyRecommendation.BALANCED


def generate_additional_objections(
    req_intended_use: str,
    req_sterilization: str | None,
    req_duration: str | None,
    recency_years: Optional[float],
    row: dict[str, Any],
    iu_overlap: float,
) -> list[Objection]:
    """Generate additional objections beyond DRS mismatch-driven ones."""
    objections: list[Objection] = []
    pred_text = _get_pred_text(row)
    has_text = bool(row.get("txt_content"))

    # INTENDED_USE_DRIFT
    if iu_overlap < 0.4:
        objections.append(Objection(
            trigger=ObjectionTrigger.INTENDED_USE_DRIFT.value,
            severity=ObjectionSeverity.HIGH,
            question="Intended use differs significantly from predicate. "
                     "Justify why SE pathway is appropriate.",
            recommended_fix="Provide side-by-side intended use comparison with regulatory "
                            "justification per 21 CFR 807.87(f).",
            evidence_types=[EvidenceType.CLINICAL.value, EvidenceType.PERFORMANCE_DATA.value],
        ))

    # STERILIZATION_CHANGE
    if req_sterilization and req_sterilization.lower() not in ("none", "n/a", ""):
        if req_sterilization.lower() not in pred_text:
            objections.append(Objection(
                trigger=ObjectionTrigger.STERILIZATION_CHANGE.value,
                severity=ObjectionSeverity.MEDIUM,
                question="Sterilization method differs from predicate. Validation data required.",
                recommended_fix="Provide sterilization validation per ISO 11135/11137/17665 as applicable.",
                evidence_types=[EvidenceType.STERILIZATION_VALIDATION.value],
            ))

    # DURATION_MISMATCH
    if req_duration and req_duration.lower() not in ("none", "n/a", ""):
        if req_duration.lower() not in pred_text:
            objections.append(Objection(
                trigger=ObjectionTrigger.DURATION_MISMATCH.value,
                severity=ObjectionSeverity.MEDIUM,
                question="Duration of contact differs from predicate. May require chronic toxicity data.",
                recommended_fix="Provide chronic toxicity and extended biocompatibility data per ISO 10993-1 Table A.1.",
                evidence_types=[EvidenceType.BIOCOMP.value, EvidenceType.CLINICAL.value],
            ))

    # OLD_PREDICATE_GAP
    if recency_years is not None and recency_years > 8.0:
        if not has_text:
            objections.append(Objection(
                trigger=ObjectionTrigger.OLD_PREDICATE_GAP.value,
                severity=ObjectionSeverity.MEDIUM,
                question=f"Predicate is {recency_years:.0f} years old with no summary text. "
                         "Reviewer will question relevance.",
                recommended_fix="Consider a more recent predicate, or provide detailed "
                                "literature review justifying relevance.",
                evidence_types=[EvidenceType.CLINICAL.value, EvidenceType.PERFORMANCE_DATA.value],
            ))

    return objections


def build_defense_packet_seed(objections: list[Objection]) -> list[DefensePacketSeed]:
    """Derive structured evidence needs from anticipated objections.

    The "jaw-drop" stub: prescribes the fix list, not just scoring.
    """
    seeds: list[DefensePacketSeed] = []
    seen: set[str] = set()

    for obj in objections:
        for ev_type in obj.evidence_types:
            key = f"{ev_type}:{obj.trigger}"
            if key in seen:
                continue
            seen.add(key)

            priority = "HIGH" if obj.severity == ObjectionSeverity.HIGH else "MEDIUM"
            seeds.append(DefensePacketSeed(
                evidence_type=ev_type,
                description=obj.recommended_fix,
                source_objection=obj.trigger,
                priority=priority,
            ))

    return seeds


def extract_match_snippets(
    subject_text: str,
    row: dict[str, Any],
    max_snippets: int = 3,
    snippet_len: int = 150,
) -> list[MatchSnippet]:
    """Extract top short excerpts from predicate text that match subject terms."""
    txt_content = row.get("txt_content") or ""
    if not txt_content or not subject_text:
        return []

    subject_tokens = set(_tokenize(subject_text))
    if not subject_tokens:
        return []

    sentences = _split_sentences(txt_content)
    scored: list[tuple[float, str]] = []
    for sent in sentences:
        sent_tokens = set(_tokenize(sent))
        if not sent_tokens:
            continue
        overlap = len(subject_tokens & sent_tokens)
        if overlap >= 2:
            score = overlap / max(len(sent_tokens), 1)
            truncated = sent[:snippet_len].strip()
            if len(sent) > snippet_len:
                truncated += "…"
            scored.append((score, truncated))

    scored.sort(key=lambda x: -x[0])
    seen: set[str] = set()
    snippets: list[MatchSnippet] = []
    for _, text in scored:
        if text not in seen:
            snippets.append(MatchSnippet(text=text, source="txt_content"))
            seen.add(text)
        if len(snippets) >= max_snippets:
            break

    return snippets


def build_reasoning(
    similarity: float,
    drs: int,
    strategy: StrategyRecommendation,
    matched_terms: list[str],
    recency_years: Optional[float],
    has_text: bool,
) -> str:
    """Deterministic human-readable reasoning string."""
    parts: list[str] = []

    if similarity >= 0.5:
        parts.append("Strong text match on intended use/technology terms")
    elif similarity >= 0.2:
        parts.append("Moderate text match on device description")
    elif similarity > 0:
        parts.append("Weak text match")
    else:
        parts.append("No text match (recency only)")

    if matched_terms:
        parts.append(f"matched: {', '.join(matched_terms[:3])}")

    parts.append("same product code")

    if recency_years is not None:
        parts.append(f"cleared {recency_years:.1f}y ago ({strategy.value.lower()})")

    parts.append(f"DRS {drs}/100")

    if strategy == StrategyRecommendation.AVOID:
        parts.append("⚠ AVOID — significant gaps identified")

    if not has_text:
        parts.append("no summary text for deep matching")

    return "; ".join(parts) + "."


# ─────────────────────────────────────────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────────────────────────────────────────

def _token_overlap(text_a: str, text_b: str) -> float:
    """Jaccard-style token overlap score."""
    tokens_a = set(_tokenize(text_a))
    tokens_b = set(_tokenize(text_b))
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    return len(intersection) / max(len(tokens_a), 1)


def _recency_boost(years: Optional[float]) -> float:
    """Per spec: <=2yr → +0.10, 2-5 → +0.06, 5-10 → +0.02, >10 → 0."""
    if years is None:
        return 0.0
    if years <= 2.0:
        return RECENCY_BOOST_2YR
    if years <= 5.0:
        return RECENCY_BOOST_5YR
    if years <= 10.0:
        return RECENCY_BOOST_10YR
    return 0.0


def _get_pred_text(row: dict[str, Any]) -> str:
    """Combine candidate text fields for matching."""
    return (
        (row.get("txt_content", "") or "")
        + " "
        + (row.get("device_name", "") or "")
    ).lower()


def _tokenize(text: str) -> list[str]:
    """Lowercase alpha-numeric tokens, stop words removed."""
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP_WORDS]


def _split_sentences(text: str) -> list[str]:
    """Rough sentence splitter for snippet extraction."""
    raw = re.split(r'(?<=[.!?])\s+|\n+', text)
    return [s.strip() for s in raw if len(s.strip()) > 20]


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def find_matched_terms(subject: str, row: dict[str, Any]) -> list[str]:
    """Top tokens from subject text that appear in predicate text/name."""
    subject_tokens = _tokenize(subject)
    predicate_text = _get_pred_text(row)
    matched: list[str] = []
    seen: set[str] = set()
    for tok in subject_tokens:
        if tok in predicate_text and tok not in seen and len(tok) > 2:
            matched.append(tok)
            seen.add(tok)
    return matched


def years_since(d: Optional[date]) -> Optional[float]:
    """Calculate years since a given date."""
    if d is None:
        return None
    delta = date.today() - d
    return delta.days / 365.25
