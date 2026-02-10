"""Predicate Suggestion Engine — Phase 6.6.B v2 (Shadow FDA Reviewer MVP).

Pure-function scoring + ranking. No LLM dependency.
Explainable, deterministic, fast (<200ms on indexed tables).

v2 enhancements:
  - B0: Structured input with canonical normalization + subject_hash
  - B1: Two-stage retrieval (hard filter → FTS rank) + match_snippets[]
  - B2: Shadow Reviewer Scorecard with Defense Readiness Score (DRS)
  - B3: Anticipated Objections with typed triggers + recommended fixes
  - B4: Clean Predicate AVOID gating
  - B5: In-memory TTL cache (15 min) + audit event emission

Usage:
    from .predicate_suggest import suggest_predicates

    response = await suggest_predicates(pool, request)
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from collections import OrderedDict
from datetime import date, datetime, timezone
from typing import Any, Optional

from . import sql_fda_universe as sql
from .models_predicate import (
    AnticipatedObjection,
    EvidenceType,
    MatchSnippet,
    ObjectionTrigger,
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

MAX_RAW_CANDIDATES = 20   # fetch from DB, then score/rank in Python
MAX_SUGGESTIONS = 5       # return top N
WEIGHTS_VERSION = "v2.0"
WEIGHTS = {"fts": 0.55, "name": 0.20, "recency": 0.10, "completeness": 0.05, "drs": 0.10}

# Strategy recommendation thresholds (years since clearance)
AGGRESSIVE_THRESHOLD = 2.0
BALANCED_THRESHOLD = 7.0
AVOID_OLD_YEARS = 12.0

# Flags
OLD_PREDICATE_YEARS = 8.0
VERY_NEW_MONTHS = 6
LOW_TEXT_MATCH_THRESHOLD = 0.10

# DRS constants
DRS_SUMMARY_EXISTS_RECENT = 25   # pts if txt_content exists and < 5 years old
DRS_SUMMARY_EXISTS_OLD = 15      # pts if txt_content exists but > 5 years
DRS_INTENDED_USE_OVERLAP = 25    # pts if intended use strongly overlaps
DRS_MATERIAL_ALIGN = 15          # pts if materials/tissue/duration align
DRS_PENALTY_MISSING_SUMMARY = -15
DRS_PENALTY_AMBIGUOUS_TECH = -10
DRS_PENALTY_SW_NO_CYBER = -15

# Cyber / SW keywords for B4 AVOID gating
CYBER_KEYWORDS = frozenset({
    "cybersecurity", "sbom", "iec 62304", "iec62304", "software",
    "firmware", "samd", "ai/ml", "machine learning", "neural",
    "algorithm", "cloud", "wireless", "bluetooth", "wifi", "connected",
})

# Cache configuration
CACHE_TTL_SECONDS = 15 * 60  # 15 minutes

# ─────────────────────────────────────────────────────────────────────────────
# In-memory TTL cache (B5)
# ─────────────────────────────────────────────────────────────────────────────

class _SuggestionCache:
    """Simple LRU+TTL cache keyed by (program_id, subject_hash, product_code)."""

    def __init__(self, maxsize: int = 128, ttl: int = CACHE_TTL_SECONDS):
        self._store: OrderedDict[str, tuple[float, PredicateSuggestResponse]] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl

    def _make_key(self, program_id: str, subject_hash: str, product_code: str) -> str:
        return f"{program_id}:{subject_hash}:{product_code}"

    def get(self, program_id: str, subject_hash: str, product_code: str) -> Optional[PredicateSuggestResponse]:
        key = self._make_key(program_id, subject_hash, product_code)
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, resp = entry
        if time.monotonic() - ts > self._ttl:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return resp

    def put(self, program_id: str, subject_hash: str, product_code: str, resp: PredicateSuggestResponse) -> None:
        key = self._make_key(program_id, subject_hash, product_code)
        self._store[key] = (time.monotonic(), resp)
        self._store.move_to_end(key)
        while len(self._store) > self._maxsize:
            self._store.popitem(last=False)


_cache = _SuggestionCache()


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def suggest_predicates(
    pool: Any,
    req: PredicateSuggestRequest,
) -> PredicateSuggestResponse:
    """Find and score top predicates for a subject device (v2).

    Steps:
      B0. Normalize inputs, compute subject_hash
      B1. Hard-filter + FTS rank → raw candidates
      B2. Score each: composite similarity + DRS + strategy
      B3. Generate anticipated objections per candidate
      B4. Apply AVOID gating
      B5. Check cache, emit audit stub
    """
    subject_text = build_subject_text(req)
    subject_hash = _compute_subject_hash(req)

    # B5 — Check cache
    cached = _cache.get(req.program_id, subject_hash, req.product_code)
    if cached is not None:
        logger.info("Cache hit for %s/%s", req.product_code, subject_hash[:12])
        return cached.model_copy(update={"cached": True})

    # B1 — Fetch raw candidates from DB
    rows = await _fetch_candidates(pool, req.product_code, subject_text)
    total_scanned = await _count_se_clearances(pool, req.product_code)

    # B2 + B3 + B4 — Score, generate objections, apply AVOID
    scored = [_score_candidate_v2(row, subject_text, req) for row in rows]

    # Deterministic ordering: similarity DESC, then DRS DESC, then k_number ASC (stable)
    scored.sort(key=lambda s: (-s.similarity_score, -s.defense_readiness_score, s.k_number))
    top = scored[:MAX_SUGGESTIONS]

    response = PredicateSuggestResponse(
        suggestions=top,
        generated_at=datetime.now(timezone.utc),
        subject_hash=subject_hash,
        product_code=req.product_code,
        total_candidates_scanned=total_scanned,
        weights_version=WEIGHTS_VERSION,
        cached=False,
    )

    # B5 — Store in cache
    _cache.put(req.program_id, subject_hash, req.product_code, response)

    return response


# ─────────────────────────────────────────────────────────────────────────────
# B0 — Structured input + canonical normalization
# ─────────────────────────────────────────────────────────────────────────────

def build_subject_text(req: PredicateSuggestRequest) -> str:
    """Concatenate all device-descriptive fields into a single search string."""
    tech = req.technology_description or req.device_description or ""
    parts = [req.device_name, tech]
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
    return " ".join(p for p in parts if p).strip()


def _compute_subject_hash(req: PredicateSuggestRequest) -> str:
    """SHA-256 of canonical fields for dedup/caching."""
    sw = req.software_present if req.software_present is not None else req.software_flag
    canonical = "|".join([
        req.product_code,
        req.device_name,
        req.intended_use or "",
        req.technology_description or req.device_description or "",
        ",".join(sorted(req.materials or [])),
        req.energy_source or "",
        req.tissue_contact or "",
        req.duration or "",
        str(bool(sw)),
    ])
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# B1 — DB queries (two-stage retrieval)
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_candidates(
    pool: Any,
    product_code: str,
    subject_text: str,
) -> list[dict[str, Any]]:
    """Hard filter (product_code + SE + last N years) → FTS rank."""
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
# B2 — Shadow Reviewer Scorecard (the v2 core)
# ─────────────────────────────────────────────────────────────────────────────

def _score_candidate_v2(
    row: dict[str, Any],
    subject_text: str,
    req: PredicateSuggestRequest,
) -> PredicateSuggestion:
    """Compute composite score + DRS + objections + AVOID gating."""
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

    # ── B2: Defense Readiness Score ──
    drs = _compute_drs(row, req, fts_score, recency_years)
    drs_norm = drs / 100.0  # normalize to 0–1 for composite weighting

    # ── Composite similarity ──
    similarity = _clamp01(
        WEIGHTS["fts"] * fts_score
        + WEIGHTS["name"] * name_score
        + WEIGHTS["recency"] * recency_score
        + WEIGHTS["completeness"] * completeness
        + WEIGHTS["drs"] * drs_norm
    )

    # ── B1: Matched terms ──
    matched = _find_matched_terms(subject_text, row)

    # ── B1: Match snippets ──
    snippets = _extract_match_snippets(subject_text, row)

    # ── Flags (risk_flags) ──
    flags = _compute_flags(recency_years, fts_score, has_text, decision_date)

    # ── B3: Anticipated objections ──
    objections = _generate_objections(req, row, fts_score, recency_years)

    # ── B4: AVOID gating ──
    strategy = _classify_strategy_v2(recency_years, fts_score, has_text, req, row)

    # ── Reviewer heat ──
    heat = _compute_reviewer_heat(recency_years, fts_score, has_text, decision_date)

    # ── Next evidence hints (legacy) ──
    next_ev = _next_evidence_hints(req, row)

    # ── Reasoning ──
    reasoning = _build_reasoning(
        fts_score, name_score, recency_years, strategy, matched, has_text, row, drs,
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
        defense_readiness_score=round(drs, 1),
        strategy_recommendation=strategy,
        risk_flags=flags,
        reasoning=reasoning,
        score_breakdown=breakdown,
        matched_terms=matched[:5],
        match_snippets=snippets[:3],
        anticipated_objections=objections,
        recency_years=round(recency_years, 1) if recency_years is not None else None,
        flags=flags,
        reviewer_heat=heat,
        next_evidence=next_ev[:3],
    )


# ─────────────────────────────────────────────────────────────────────────────
# B2 — Defense Readiness Score (DRS)
# ─────────────────────────────────────────────────────────────────────────────

def _compute_drs(
    row: dict[str, Any],
    req: PredicateSuggestRequest,
    fts_score: float,
    recency_years: Optional[float],
) -> float:
    """Defense Readiness Score (0–100): evidence completeness, not vibes.

    + points if summary text exists and is recent
    + points if intended use overlap strong
    + points if materials/tissue contact/duration align
    − points if gaps exist
    """
    drs = 50.0  # baseline

    has_text = bool(row.get("txt_content"))

    # Summary text exists + recency
    if has_text:
        if recency_years is not None and recency_years <= 5.0:
            drs += DRS_SUMMARY_EXISTS_RECENT
        else:
            drs += DRS_SUMMARY_EXISTS_OLD
    else:
        drs += DRS_PENALTY_MISSING_SUMMARY

    # Intended use overlap
    pred_text = (row.get("txt_content", "") or "") + " " + (row.get("device_name", "") or "")
    if req.intended_use and pred_text.strip():
        iu_tokens = set(_tokenize(req.intended_use))
        pred_tokens = set(_tokenize(pred_text))
        if iu_tokens and pred_tokens:
            overlap = len(iu_tokens & pred_tokens) / max(len(iu_tokens), 1)
            drs += DRS_INTENDED_USE_OVERLAP * overlap

    # Materials / tissue contact / duration alignment
    alignment_bonus = 0.0
    if req.materials:
        mat_text = " ".join(req.materials).lower()
        pred_lower = pred_text.lower()
        if any(m.lower() in pred_lower for m in req.materials):
            alignment_bonus += 5.0
    if req.tissue_contact:
        # Can't directly compare without predicate metadata, but
        # presence of tissue_contact keywords in predicate text is a signal
        if req.tissue_contact.lower() in pred_text.lower():
            alignment_bonus += 5.0
    if req.duration:
        if req.duration.lower() in pred_text.lower():
            alignment_bonus += 5.0
    drs += min(alignment_bonus, DRS_MATERIAL_ALIGN)

    # Penalty: ambiguous tech match (low FTS score)
    if fts_score < LOW_TEXT_MATCH_THRESHOLD:
        drs += DRS_PENALTY_AMBIGUOUS_TECH

    # Penalty: software present but no cyber keywords in predicate
    sw = req.software_present if req.software_present is not None else req.software_flag
    if sw:
        pred_lower = pred_text.lower()
        has_cyber = any(kw in pred_lower for kw in CYBER_KEYWORDS)
        if not has_cyber:
            drs += DRS_PENALTY_SW_NO_CYBER

    return max(0.0, min(100.0, drs))


# ─────────────────────────────────────────────────────────────────────────────
# B1 — Match Snippets
# ─────────────────────────────────────────────────────────────────────────────

def _extract_match_snippets(
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

    # Slide a window over sentences / chunks and score by token overlap
    sentences = _split_sentences(txt_content)
    scored: list[tuple[float, str]] = []
    for sent in sentences:
        sent_tokens = set(_tokenize(sent))
        if not sent_tokens:
            continue
        overlap = len(subject_tokens & sent_tokens)
        if overlap >= 2:  # at least 2 matching terms
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


def _split_sentences(text: str) -> list[str]:
    """Rough sentence splitter for snippet extraction."""
    # Split on period/question/exclamation followed by space or newline
    raw = re.split(r'(?<=[.!?])\s+|\n+', text)
    return [s.strip() for s in raw if len(s.strip()) > 20]


# ─────────────────────────────────────────────────────────────────────────────
# B3 — Anticipated Objections
# ─────────────────────────────────────────────────────────────────────────────

def _generate_objections(
    req: PredicateSuggestRequest,
    row: dict[str, Any],
    fts_score: float,
    recency_years: Optional[float],
) -> list[AnticipatedObjection]:
    """Generate structured reviewer objections per predicate."""
    objections: list[AnticipatedObjection] = []
    pred_text = ((row.get("txt_content", "") or "") + " " + (row.get("device_name", "") or "")).lower()

    # INTENDED_USE_DRIFT
    if req.intended_use:
        iu_tokens = set(_tokenize(req.intended_use))
        pred_tokens = set(_tokenize(pred_text))
        if iu_tokens:
            overlap = len(iu_tokens & pred_tokens) / max(len(iu_tokens), 1)
            if overlap < 0.4:
                objections.append(AnticipatedObjection(
                    question="Intended use differs significantly from predicate. Justify why SE pathway is appropriate.",
                    severity="High",
                    trigger=ObjectionTrigger.INTENDED_USE_DRIFT,
                    recommended_fix="Provide side-by-side intended use comparison with regulatory justification per 21 CFR 807.87(f).",
                    suggested_evidence_types=[EvidenceType.CLINICAL.value, EvidenceType.PERFORMANCE_DATA.value],
                ))

    # MATERIAL_CHANGE
    if req.materials:
        mat_text = " ".join(req.materials).lower()
        if not any(m.lower() in pred_text for m in req.materials):
            objections.append(AnticipatedObjection(
                question="Materials differ from predicate. Biocompatibility assessment required.",
                severity="High",
                trigger=ObjectionTrigger.MATERIAL_CHANGE,
                recommended_fix="Submit biocompatibility evaluation per ISO 10993-1 addressing changed materials.",
                suggested_evidence_types=[EvidenceType.BIOCOMP.value, EvidenceType.BENCH.value],
            ))

    # ENERGY_SOURCE_CHANGE
    if req.energy_source and req.energy_source.lower() not in ("none", "n/a", ""):
        if req.energy_source.lower() not in pred_text:
            objections.append(AnticipatedObjection(
                question="Energy source differs. Electrical safety and EMC testing required.",
                severity="High",
                trigger=ObjectionTrigger.ENERGY_SOURCE_CHANGE,
                recommended_fix="Provide IEC 60601-1 electrical safety and IEC 60601-1-2 EMC test reports.",
                suggested_evidence_types=[EvidenceType.BENCH.value],
            ))

    # TISSUE_CONTACT_DRIFT
    if req.tissue_contact and req.tissue_contact.lower() not in ("none", "n/a", ""):
        if req.tissue_contact.lower() not in pred_text:
            objections.append(AnticipatedObjection(
                question="Tissue contact characteristics differ. Additional biocompatibility endpoints may be needed.",
                severity="Med",
                trigger=ObjectionTrigger.TISSUE_CONTACT_DRIFT,
                recommended_fix="Update ISO 10993-1 evaluation matrix for changed tissue contact and duration.",
                suggested_evidence_types=[EvidenceType.BIOCOMP.value, EvidenceType.RISK_ANALYSIS.value],
            ))

    # DURATION_MISMATCH
    if req.duration and req.duration.lower() not in ("none", "n/a", ""):
        if req.duration.lower() not in pred_text:
            objections.append(AnticipatedObjection(
                question="Duration of contact differs from predicate. May require chronic toxicity data.",
                severity="Med",
                trigger=ObjectionTrigger.DURATION_MISMATCH,
                recommended_fix="Provide chronic toxicity and extended biocompatibility data per ISO 10993-1 Table A.1.",
                suggested_evidence_types=[EvidenceType.BIOCOMP.value, EvidenceType.CLINICAL.value],
            ))

    # SOFTWARE_CYBER_GAP
    sw = req.software_present if req.software_present is not None else req.software_flag
    if sw:
        has_cyber = any(kw in pred_text for kw in CYBER_KEYWORDS)
        if not has_cyber:
            objections.append(AnticipatedObjection(
                question="Subject device has software but predicate lacks software/cybersecurity documentation. IEC 62304 + PCCP required.",
                severity="High",
                trigger=ObjectionTrigger.SOFTWARE_CYBER_GAP,
                recommended_fix="Prepare IEC 62304 software lifecycle documentation and cybersecurity risk assessment.",
                suggested_evidence_types=[EvidenceType.SW_LIFECYCLE.value, EvidenceType.CYBERSECURITY.value],
            ))

    # OLD_PREDICATE_GAP
    if recency_years is not None and recency_years > OLD_PREDICATE_YEARS:
        has_text = bool(row.get("txt_content"))
        if not has_text:
            objections.append(AnticipatedObjection(
                question=f"Predicate is {recency_years:.0f} years old with no summary text. Reviewer will question relevance.",
                severity="Med",
                trigger=ObjectionTrigger.OLD_PREDICATE_GAP,
                recommended_fix="Consider a more recent predicate, or provide detailed literature review justifying relevance.",
                suggested_evidence_types=[EvidenceType.CLINICAL.value, EvidenceType.PERFORMANCE_DATA.value],
            ))

    return objections


# ─────────────────────────────────────────────────────────────────────────────
# B4 — AVOID Gating
# ─────────────────────────────────────────────────────────────────────────────

def _classify_strategy_v2(
    recency_years: Optional[float],
    fts_score: float,
    has_text: bool,
    req: PredicateSuggestRequest,
    row: dict[str, Any],
) -> StrategyRecommendation:
    """Classification with AVOID gating logic.

    Mark as AVOID if:
    1. Summary text missing AND weak overlap AND predicate > threshold years old
    2. Clear mismatch on tissue contact or duration bucket
    3. Software present + predicate has zero cyber/SBOM/IEC keywords and tech requires SW
    """
    pred_text = ((row.get("txt_content", "") or "") + " " + (row.get("device_name", "") or "")).lower()

    # AVOID gate 1: missing text + weak match + old
    if not has_text and fts_score < LOW_TEXT_MATCH_THRESHOLD:
        if recency_years is not None and recency_years > AVOID_OLD_YEARS:
            return StrategyRecommendation.AVOID

    # AVOID gate 2: tissue contact mismatch
    if req.tissue_contact and req.tissue_contact.lower() not in ("none", "n/a", ""):
        # Significant mismatch heuristic: if tissue_contact is "implant" or "blood"
        # and predicate text shows no sign of similar contact
        high_risk_contacts = {"implant", "blood", "breached"}
        if req.tissue_contact.lower() in high_risk_contacts:
            if req.tissue_contact.lower() not in pred_text:
                # Check if any high-risk contact indicator is in predicate
                if not any(hrc in pred_text for hrc in high_risk_contacts):
                    return StrategyRecommendation.AVOID

    # AVOID gate 3: software present + no cyber evidence
    sw = req.software_present if req.software_present is not None else req.software_flag
    if sw:
        has_cyber = any(kw in pred_text for kw in CYBER_KEYWORDS)
        tech = (req.technology_description or req.device_description or "").lower()
        tech_requires_sw = any(kw in tech for kw in ("software", "firmware", "algorithm", "ai", "app"))
        if not has_cyber and tech_requires_sw:
            return StrategyRecommendation.AVOID

    # Standard classification
    if recency_years is None:
        return StrategyRecommendation.BALANCED
    if recency_years < AGGRESSIVE_THRESHOLD:
        return StrategyRecommendation.AGGRESSIVE
    if recency_years <= BALANCED_THRESHOLD:
        return StrategyRecommendation.BALANCED
    return StrategyRecommendation.CONSERVATIVE


# ─────────────────────────────────────────────────────────────────────────────
# Scoring helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_fts(raw_rank: float) -> float:
    """Normalize Postgres ts_rank_cd to 0–1 using sigmoid-ish mapping."""
    if raw_rank <= 0:
        return 0.0
    return _clamp01(raw_rank / 0.3)


def _name_overlap(subject: str, device_name: str) -> float:
    """Token-level overlap between subject text and device name."""
    subject_tokens = set(_tokenize(subject))
    name_tokens = set(_tokenize(device_name))
    if not subject_tokens or not name_tokens:
        return 0.0
    intersection = subject_tokens & name_tokens
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


def _find_matched_terms(subject: str, row: dict) -> list[str]:
    """Top tokens from subject text that appear in predicate text/name."""
    subject_tokens = _tokenize(subject)
    predicate_text = (
        (row.get("device_name", "") or "") + " " + (row.get("txt_content", "") or "")
    ).lower()
    matched: list[str] = []
    seen: set[str] = set()
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
            heat += 10
        if recency > OLD_PREDICATE_YEARS:
            heat += 15
    if not has_text:
        heat += 25
    if fts_score < LOW_TEXT_MATCH_THRESHOLD:
        heat += 30
    if fts_score < 0.05:
        heat += 10
    return min(heat, 100)


def _next_evidence_hints(
    req: PredicateSuggestRequest, row: dict,
) -> list[str]:
    """Rule-based hints – v1 stubs, future-proof for 6.6.C enrichment."""
    hints: list[str] = []
    if req.energy_source and req.energy_source.lower() not in (
        row.get("device_name", "") or ""
    ).lower():
        hints.append("Bench testing rationale for energy source differences")
    if req.materials:
        hints.append("Biocompatibility assessment if material change")
    sw = req.software_present if req.software_present is not None else req.software_flag
    if sw:
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
    drs: float,
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

    # Same product code
    parts.append("same product code")

    # Recency
    if recency is not None:
        parts.append(f"cleared {recency:.1f} years ago ({strategy.value.lower()})")

    # DRS
    parts.append(f"DRS {drs:.0f}/100")

    # AVOID warning
    if strategy == StrategyRecommendation.AVOID:
        parts.append("⚠ AVOID — significant gaps identified")

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
