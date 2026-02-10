"""Predicate Suggestion Engine — Phase 6.6.B.

Pure-function scoring + ranking. No LLM dependency.
Explainable, deterministic, fast (<200ms on indexed tables).

Usage:
    from .predicate_suggest import suggest_predicates

    response = await suggest_predicates(pool, request)
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Optional

from . import sql_fda_universe as sql
from .models_predicate import (
    PredicateFlag,
    PredicateSuggestRequest,
    PredicateSuggestResponse,
    PredicateSuggestion,
    ScoreBreakdown,
    StrategyRecommendation,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MAX_RAW_CANDIDATES = 20  # fetch from DB, then score/rank in Python
MAX_SUGGESTIONS = 5      # return top N
WEIGHTS = {"fts": 0.65, "name": 0.20, "recency": 0.10, "completeness": 0.05}

# Strategy recommendation thresholds (years since clearance)
AGGRESSIVE_THRESHOLD = 2.0
BALANCED_THRESHOLD = 7.0

# Flags
OLD_PREDICATE_YEARS = 8.0
VERY_NEW_MONTHS = 6
LOW_TEXT_MATCH_THRESHOLD = 0.10


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def suggest_predicates(
    pool: Any,
    req: PredicateSuggestRequest,
) -> PredicateSuggestResponse:
    """Find and score top predicates for a subject device.

    Steps:
      1. Build subject text from request fields
      2. FTS query against fda_510k_clearances
      3. Score each row (FTS + name match + recency + completeness)
      4. Rank, generate explanations, return top 5
    """
    subject_text = build_subject_text(req)
    subject_hash = hashlib.sha256(subject_text.encode("utf-8")).hexdigest()

    # Fetch raw candidates from DB
    rows = await _fetch_candidates(pool, req.product_code, subject_text)

    # Count total for metadata
    total_scanned = await _count_se_clearances(pool, req.product_code)

    # Score and rank
    scored = [_score_candidate(row, subject_text, req) for row in rows]
    scored.sort(key=lambda s: s.similarity_score, reverse=True)
    top = scored[:MAX_SUGGESTIONS]

    return PredicateSuggestResponse(
        suggestions=top,
        generated_at=datetime.now(timezone.utc),
        subject_hash=subject_hash,
        product_code=req.product_code,
        total_candidates_scanned=total_scanned,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Text builder
# ─────────────────────────────────────────────────────────────────────────────

def build_subject_text(req: PredicateSuggestRequest) -> str:
    """Concatenate all device-descriptive fields into a single search string."""
    parts = [req.device_description]
    if req.intended_use:
        parts.append(req.intended_use)
    if req.materials:
        parts.append(" ".join(req.materials))
    if req.energy_source:
        parts.append(req.energy_source)
    if req.tissue_contact:
        parts.append(req.tissue_contact)
    if req.duration:
        parts.append(req.duration)
    return " ".join(parts).strip()


# ─────────────────────────────────────────────────────────────────────────────
# DB queries
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_candidates(
    pool: Any,
    product_code: str,
    subject_text: str,
) -> list[dict[str, Any]]:
    """Run FTS query; fall back to recency sort if subject_text is empty."""
    async with pool.acquire() as conn:
        if subject_text.strip():
            rows = await conn.fetch(
                sql.SUGGEST_PREDICATES_FTS,
                product_code,
                subject_text,
                MAX_RAW_CANDIDATES,
            )
        else:
            rows = await conn.fetch(
                sql.SUGGEST_PREDICATES_FALLBACK,
                product_code,
                MAX_RAW_CANDIDATES,
            )
    return [dict(r) for r in rows]


async def _count_se_clearances(pool: Any, product_code: str) -> int:
    async with pool.acquire() as conn:
        row = await conn.fetchval(sql.COUNT_SE_CLEARANCES, product_code)
    return int(row) if row else 0


# ─────────────────────────────────────────────────────────────────────────────
# Scoring
# ─────────────────────────────────────────────────────────────────────────────

def _score_candidate(
    row: dict[str, Any],
    subject_text: str,
    req: PredicateSuggestRequest,
) -> PredicateSuggestion:
    """Compute composite score + generate human-readable reasoning."""
    # ── Component scores ──
    fts_raw = float(row.get("fts_rank", 0.0))
    fts_score = _normalize_fts(fts_raw)

    name_score = _name_overlap(subject_text, row.get("device_name", ""))

    decision_date = row.get("decision_date")
    recency_years = _years_since(decision_date)
    recency_score = _recency_boost(recency_years)

    has_text = bool(row.get("txt_content"))
    has_url = bool(row.get("summary_url"))
    completeness = (0.5 if has_text else 0.0) + (0.5 if has_url else 0.0)

    # ── Composite ──
    similarity = _clamp01(
        WEIGHTS["fts"] * fts_score
        + WEIGHTS["name"] * name_score
        + WEIGHTS["recency"] * recency_score
        + WEIGHTS["completeness"] * completeness
    )

    # ── Strategy ──
    strategy = _classify_strategy(recency_years)

    # ── Matched terms ──
    matched = _find_matched_terms(subject_text, row)

    # ── Flags ──
    flags = _compute_flags(recency_years, fts_score, has_text, decision_date)

    # ── Reviewer heat ──
    heat = _compute_reviewer_heat(recency_years, fts_score, has_text, decision_date)

    # ── Next evidence hints ──
    next_ev = _next_evidence_hints(req, row)

    # ── Reasoning ──
    reasoning = _build_reasoning(
        fts_score, name_score, recency_years, strategy, matched, has_text, row,
    )

    breakdown = ScoreBreakdown(
        fts_score=round(fts_score, 4),
        name_match=round(name_score, 4),
        recency_boost=round(recency_score, 4),
        completeness_bonus=round(completeness, 4),
    )

    return PredicateSuggestion(
        k_number=row["k_number"],
        device_name=row.get("device_name", ""),
        applicant=row.get("applicant"),
        product_code=row.get("product_code", req.product_code),
        decision_date=decision_date,
        summary_url=row.get("summary_url"),
        similarity_score=round(similarity, 4),
        recency_years=round(recency_years, 1) if recency_years is not None else None,
        strategy_recommendation=strategy,
        reasoning=reasoning,
        score_breakdown=breakdown,
        matched_terms=matched[:5],
        flags=flags,
        reviewer_heat=heat,
        next_evidence=next_ev[:3],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Scoring helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_fts(raw_rank: float) -> float:
    """Normalize Postgres ts_rank_cd to 0–1 using sigmoid-ish mapping."""
    if raw_rank <= 0:
        return 0.0
    # ts_rank_cd typical range 0–0.5 for good matches
    return _clamp01(raw_rank / 0.3)


def _name_overlap(subject: str, device_name: str) -> float:
    """Token-level overlap between subject text and device name."""
    subject_tokens = set(_tokenize(subject))
    name_tokens = set(_tokenize(device_name))
    if not subject_tokens or not name_tokens:
        return 0.0
    intersection = subject_tokens & name_tokens
    # Jaccard-ish but favor name coverage
    if not name_tokens:
        return 0.0
    return len(intersection) / max(len(name_tokens), 1)


def _recency_boost(years: Optional[float]) -> float:
    """Boost for newer predicates, capped."""
    if years is None:
        return 0.0
    if years <= 1.0:
        return 1.0
    if years >= 10.0:
        return 0.0
    return _clamp01(1.0 - (years - 1.0) / 9.0)


def _years_since(d: Optional[date]) -> Optional[float]:
    if d is None:
        return None
    delta = date.today() - d
    return delta.days / 365.25


def _classify_strategy(recency_years: Optional[float]) -> StrategyRecommendation:
    if recency_years is None:
        return StrategyRecommendation.BALANCED
    if recency_years < AGGRESSIVE_THRESHOLD:
        return StrategyRecommendation.AGGRESSIVE
    if recency_years <= BALANCED_THRESHOLD:
        return StrategyRecommendation.BALANCED
    return StrategyRecommendation.CONSERVATIVE


def _find_matched_terms(subject: str, row: dict) -> list[str]:
    """Top tokens from subject text that appear in predicate text/name."""
    subject_tokens = _tokenize(subject)
    predicate_text = (
        (row.get("device_name", "") or "") + " " + (row.get("txt_content", "") or "")
    ).lower()
    matched = []
    seen = set()
    for tok in subject_tokens:
        if tok in predicate_text and tok not in seen and len(tok) > 2:
            matched.append(tok)
            seen.add(tok)
    return matched


def _compute_flags(
    recency: Optional[float],
    fts_score: float,
    has_text: bool,
    decision_date: Optional[date],
) -> list[PredicateFlag]:
    flags: list[PredicateFlag] = []
    if recency is not None and recency > OLD_PREDICATE_YEARS:
        flags.append(PredicateFlag.OLD_PREDICATE)
    if fts_score < LOW_TEXT_MATCH_THRESHOLD:
        flags.append(PredicateFlag.LOW_TEXT_MATCH)
    if not has_text:
        flags.append(PredicateFlag.MISSING_SUMMARY_TEXT)
    if decision_date:
        months = (date.today() - decision_date).days / 30.44
        if months < VERY_NEW_MONTHS:
            flags.append(PredicateFlag.VERY_NEW)
    return flags


def _compute_reviewer_heat(
    recency: Optional[float],
    fts_score: float,
    has_text: bool,
    decision_date: Optional[date],
) -> int:
    """Cheap heuristic triage signal 0–100."""
    heat = 0
    if recency is not None:
        if recency < 0.5:
            heat += 10  # very new — might not have enough post-market data
        if recency > OLD_PREDICATE_YEARS:
            heat += 15
    if not has_text:
        heat += 25
    if fts_score < LOW_TEXT_MATCH_THRESHOLD:
        heat += 30
    if fts_score < 0.05:
        heat += 10  # nearly zero match
    return min(heat, 100)


def _next_evidence_hints(
    req: PredicateSuggestRequest, row: dict,
) -> list[str]:
    """Rule-based hints – v1 stubs, future-proof for 6.6.C enrichment."""
    hints: list[str] = []
    if req.energy_source and req.energy_source.lower() not in (
        row.get("device_name", "") or ""
    ).lower():
        hints.append(
            "Bench testing rationale for energy source differences"
        )
    if req.materials:
        hints.append("Biocompatibility assessment if material change")
    if req.software_flag:
        hints.append("Software documentation per IEC 62304 if SW-controlled")
    if not hints:
        hints.append("Performance data comparison with predicate specifications")
    return hints


def _build_reasoning(
    fts: float,
    name: float,
    recency: Optional[float],
    strategy: StrategyRecommendation,
    matched: list[str],
    has_text: bool,
    row: dict,
) -> str:
    """Deterministic human-readable explanation."""
    parts: list[str] = []

    # Text match quality
    if fts >= 0.5:
        parts.append("Strong text match on intended use/technology terms")
    elif fts >= 0.2:
        parts.append("Moderate text match on device description")
    elif fts > 0:
        parts.append("Weak text match")
    else:
        parts.append("No full-text match (name/recency only)")

    # Matched terms detail
    if matched:
        parts.append(f"matched on: {', '.join(matched[:3])}")

    # Same product code (always true for v1)
    parts.append("same product code")

    # Recency
    if recency is not None:
        parts.append(f"cleared {recency:.1f} years ago ({strategy.value.lower()})")

    # Missing data warning
    if not has_text:
        parts.append("no summary text available for deep matching")

    return "; ".join(parts) + "."


# ─────────────────────────────────────────────────────────────────────────────
# Utils
# ─────────────────────────────────────────────────────────────────────────────

_STOP_WORDS = frozenset(
    "a an the and or in of for to is on at by with from as it its "
    "this that are was were be been has have had not no".split()
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    """Lowercase alpha-numeric tokens, stop words removed."""
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP_WORDS]


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))
