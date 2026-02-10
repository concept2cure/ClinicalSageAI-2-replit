"""Predicate Suggestion Engine — Phase 6.6.B (Enterprise-grade, Spec-Compliant).

Pure-function scoring + ranking. No LLM dependency.
Explainable, deterministic, fast (<500ms on local db per spec).

Uses:
  - scoring/predicate_strategy.py  for all scoring logic
  - sql_predicates.py              for all SQL (not stuffed in router)

v2 enhancements:
  - B0: Structured input with canonical normalization + subject_hash
  - B1: Two-stage retrieval (hard filter → FTS rank) + match_snippets[]
  - B2: Shadow Reviewer Scorecard with Defense Readiness Score (DRS)
  - B3: Anticipated Objections with typed triggers + recommended fixes
  - B4: Clean Predicate AVOID gating
  - B5: In-memory TTL cache (15 min) + audit event emission
  - Defense Packet Seed: evidence needs derived from objections

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
from datetime import datetime, timezone
from typing import Any, Optional

from . import sql_predicates as sql_pred
from .models_predicate import (
    PredicateFlagCode,
    PredicateSuggestRequest,
    PredicateSuggestResponse,
    PredicateSuggestion,
    RiskFlag,
    RiskFlagSeverity,
    StrategyRecommendation,
)
from .scoring.predicate_strategy import (
    build_defense_packet_seed,
    build_reasoning,
    build_response_defense_packet_seed,
    classify_strategy,
    compute_drs,
    compute_similarity,
    extract_match_snippets,
    find_matched_terms,
    generate_additional_objections,
    years_since,
    _token_overlap,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MAX_RAW_CANDIDATES = 20   # fetch from DB, then score/rank in Python
MAX_SUGGESTIONS = 5       # return top N
WEIGHTS_VERSION = "v2.0"

# Cache configuration
CACHE_TTL_SECONDS = 15 * 60  # 15 minutes

# Normalization
_WS_RE = re.compile(r"\s+")

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
    """Find and score top predicates for a subject device.

    Steps:
      B0. Normalize inputs, compute subject_hash
      B5. Check cache (early return)
      B1. Hard-filter + FTS rank → raw candidates
      B2. Score each: similarity (spec weights) + DRS (100 - penalties)
      B3. Generate anticipated objections per candidate
      B4. Apply AVOID gating (via strategy classification)
      B5. Store in cache
    """
    t0 = time.monotonic()

    # B0 — Normalize + hash
    req = _normalize_request(req)
    subject_text = build_subject_text(req)
    subject_hash = compute_subject_hash(req)

    # B5 — Check cache
    cached = _cache.get(req.program_id, subject_hash, req.product_code)
    if cached is not None:
        logger.info("Cache hit for %s/%s", req.product_code, subject_hash[:12])
        latency_ms = int((time.monotonic() - t0) * 1000)
        return cached.model_copy(update={"cached": True, "latency_ms": latency_ms})

    # B1 — Fetch raw candidates from DB
    rows = await _fetch_candidates(pool, req.product_code, subject_text)
    total_scanned = await _count_se_clearances(pool, req.product_code)

    # B2 + B3 + B4 — Score each candidate
    scored = [_score_candidate(row, subject_text, req) for row in rows]

    # Deterministic ordering: similarity DESC, DRS DESC, k_number ASC (stable)
    scored.sort(key=lambda s: (-s.similarity_score, -s.defense_readiness_score, s.k_number))
    top = scored[:MAX_SUGGESTIONS]

    # Build response-level Defense Packet Seed (aggregated across all top suggestions)
    defense_seed = build_response_defense_packet_seed(
        suggestions=top,
        subject_hash=subject_hash,
        program_id=req.program_id,
        product_code=req.product_code,
    )

    latency_ms = int((time.monotonic() - t0) * 1000)

    response = PredicateSuggestResponse(
        suggestions=top,
        generated_at=datetime.now(timezone.utc),
        subject_hash=subject_hash,
        product_code=req.product_code,
        total_candidates_scanned=total_scanned,
        latency_ms=latency_ms,
        weights_version=WEIGHTS_VERSION,
        cached=False,
        defense_packet_seed=defense_seed,
    )

    # B5 — Store in cache
    _cache.put(req.program_id, subject_hash, req.product_code, response)

    return response


# ─────────────────────────────────────────────────────────────────────────────
# B0 — Structured input + canonical normalization
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_request(req: PredicateSuggestRequest) -> PredicateSuggestRequest:
    """Normalize per spec: trim, collapse whitespace, canonical lowercase for comparisons."""
    return req.model_copy(update={
        "product_code": _norm(req.product_code),
        "device_name": _norm(req.device_name),
        "intended_use": _norm(req.intended_use),
        "technology_description": _norm(req.technology_description),
        "materials": [_norm(m) for m in (req.materials or [])],
        "energy_source": _norm(req.energy_source) if req.energy_source else req.energy_source,
        "tissue_contact": _norm(req.tissue_contact) if req.tissue_contact else req.tissue_contact,
        "duration": _norm(req.duration) if req.duration else req.duration,
        "sterilization": _norm(req.sterilization) if req.sterilization else req.sterilization,
        "patient_population": _norm(req.patient_population) if req.patient_population else req.patient_population,
    })


def _norm(s: Optional[str]) -> str:
    """Trim + collapse whitespace."""
    if not s:
        return ""
    return _WS_RE.sub(" ", s.strip())


def build_subject_text(req: PredicateSuggestRequest) -> str:
    """Concatenate all device-descriptive fields into a single search string."""
    tech = req.technology_description or req.device_description or ""
    parts = [req.device_name, tech, req.intended_use]
    if req.materials:
        parts.append(" ".join(req.materials))
    if req.energy_source:
        parts.append(req.energy_source)
    if req.tissue_contact:
        parts.append(req.tissue_contact)
    if req.duration:
        parts.append(req.duration)
    if req.sterilization:
        parts.append(req.sterilization)
    return " ".join(p for p in parts if p).strip()


def compute_subject_hash(req: PredicateSuggestRequest) -> str:
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
        req.sterilization or "",
        req.patient_population or "",
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
    """Hard filter (product_code + SE + last 10 years) → FTS rank."""
    async with pool.acquire() as conn:
        if subject_text.strip():
            rows = await conn.fetch(
                sql_pred.SUGGEST_CANDIDATES_FTS,
                product_code,
                subject_text,
                MAX_RAW_CANDIDATES,
            )
        else:
            rows = await conn.fetch(
                sql_pred.SUGGEST_CANDIDATES_FALLBACK,
                product_code,
                MAX_RAW_CANDIDATES,
            )
    return [dict(r) for r in rows]


async def _count_se_clearances(pool: Any, product_code: str) -> int:
    async with pool.acquire() as conn:
        row = await conn.fetchval(sql_pred.COUNT_SE_CLEARANCES, product_code)
    return int(row) if row else 0


# ─────────────────────────────────────────────────────────────────────────────
# B2 + B3 + B4 — Scoring pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _score_candidate(
    row: dict[str, Any],
    subject_text: str,
    req: PredicateSuggestRequest,
) -> PredicateSuggestion:
    """Full scoring pipeline: similarity -> DRS -> objections -> strategy -> defense seed."""

    decision_date = row.get("decision_date")
    recency = years_since(decision_date)
    has_text = bool(row.get("txt_content"))
    pred_text = ((row.get("txt_content", "") or "") + " " + (row.get("device_name", "") or ""))

    # ── B2: Similarity score (spec weights: IU=0.40, tech=0.35, mat=0.15, recency=0.10) ──
    similarity, breakdown = compute_similarity(
        req_intended_use=req.intended_use,
        req_technology=req.technology_description or req.device_description or "",
        req_materials=req.materials or [],
        candidate_text=row.get("txt_content", "") or "",
        candidate_name=row.get("device_name", "") or "",
        recency_years=recency,
    )

    # ── IU overlap for DRS ──
    iu_overlap = _token_overlap(req.intended_use, pred_text)

    # ── B2: Defense Readiness Score (starts at 100, subtract penalties) ──
    sw = req.software_present if req.software_present is not None else req.software_flag
    drs, risk_flags, drs_objections = compute_drs(
        row=row,
        req_intended_use=req.intended_use,
        req_materials=req.materials,
        req_tissue_contact=req.tissue_contact,
        req_energy_source=req.energy_source,
        req_software_present=sw,
        iu_overlap=iu_overlap,
    )

    # ── B3: Additional objections (beyond DRS-driven ones) ──
    extra_objections = generate_additional_objections(
        req_intended_use=req.intended_use,
        req_sterilization=req.sterilization,
        req_duration=req.duration,
        recency_years=recency,
        row=row,
        iu_overlap=iu_overlap,
    )
    all_objections = drs_objections + extra_objections

    # ── B4: Strategy recommendation (spec thresholds) ──
    has_high_mismatch = any(f.severity.value == "HIGH" for f in risk_flags)
    strategy = classify_strategy(drs, recency, has_high_mismatch)

    # ── Old-predicate flag ──
    if recency is not None and recency > 8.0:
        risk_flags.append(RiskFlag(
            code=PredicateFlagCode.OLD_PREDICATE.value,
            severity=RiskFlagSeverity.MEDIUM,
            message=f"Predicate is {recency:.0f} years old",
        ))

    # ── B1: Matched terms + snippets ──
    matched = find_matched_terms(subject_text, row)
    snippets = extract_match_snippets(subject_text, row)

    # ── Defense Packet Seed ──
    defense_seed = build_defense_packet_seed(all_objections)

    # ── Reasoning ──
    reasoning = build_reasoning(
        similarity=similarity,
        drs=drs,
        strategy=strategy,
        matched_terms=matched,
        recency_years=recency,
        has_text=has_text,
    )

    # ── Legacy flags (list of str codes) ──
    legacy_flags = [f.code for f in risk_flags]

    return PredicateSuggestion(
        k_number=row["k_number"],
        device_name=row.get("device_name", ""),
        applicant=row.get("applicant"),
        product_code=row.get("product_code", req.product_code),
        decision_date=decision_date,
        summary_url=row.get("summary_url"),
        similarity_score=similarity,
        defense_readiness_score=float(drs),
        toxicity_score=None,  # placeholder until 6.6.A safety signals live
        strategy_recommendation=strategy,
        reasoning=reasoning,
        score_breakdown=breakdown,
        risk_flags=risk_flags,
        match_snippets=snippets[:3],
        anticipated_objections=all_objections,
        defense_packet_seed=defense_seed,
        matched_terms=matched[:5],
        recency_years=round(recency, 1) if recency is not None else None,
        flags=legacy_flags,
        reviewer_heat=_compute_reviewer_heat(recency, similarity, has_text, decision_date),
        next_evidence=[s.evidence_type for s in defense_seed[:3]] if defense_seed else ["Performance data comparison"],
    )


def _compute_reviewer_heat(
    recency: Optional[float],
    similarity: float,
    has_text: bool,
    decision_date: Any,
) -> int:
    """Cheap heuristic triage signal 0-100."""
    heat = 0
    if recency is not None:
        if recency < 0.5:
            heat += 10
        if recency > 8.0:
            heat += 15
    if not has_text:
        heat += 25
    if similarity < 0.10:
        heat += 30
    if similarity < 0.05:
        heat += 10
    return min(heat, 100)
