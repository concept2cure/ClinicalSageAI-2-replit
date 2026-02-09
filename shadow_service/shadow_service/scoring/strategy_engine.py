"""Predicate Strategy Engine — Phase 6.6.B.

The "secret sauce": regulatory strategy, not just text similarity.
Composite scoring combines semantic distance, toxicity penalty, lineage
safety, and recency to produce ranked predicate suggestions with
human-readable explanations.

Usage (from router):
    engine = StrategyEngine(pool)
    response = await engine.suggest_predicates(request)
"""
from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timezone
from typing import Any, Optional

from shadow_service import sql_fda_universe as sql
from shadow_service.models_fda_universe import (
    LineageSafety,
    PredicateSuggestion,
    PredicateSuggestRequest,
    PredicateSuggestResponse,
    StrategyRecommendation,
    StrategyScore,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Toxicity Weights (the moat)
# ─────────────────────────────────────────────────────────────────────────────
TOXICITY_WEIGHTS: dict[str, float] = {
    "Class1Recall": 0.95,
    "SafetyCommunication": 0.70,
    "Class2Recall": 0.50,
    "483Warning": 0.40,
    "WarningLetter": 0.35,
    "MDRReport": 0.25,
    "Seizure": 0.90,
    "Class3Recall": 0.15,
}

# Strategy thresholds
TOXICITY_AVOID_THRESHOLD = 0.6
TOXICITY_RISKY_THRESHOLD = 0.3
CONSERVATIVE_AGE_YEARS = 5
AGGRESSIVE_AGE_YEARS = 1
FAMILY_RECALL_RISKY_THRESHOLD = 2
MAX_CANDIDATES_INTERNAL = 20


class StrategyEngine:
    """Regulatory predicate strategy engine."""

    def __init__(self, pool: Any, embed_fn: Any = None) -> None:
        self.pool = pool
        self._embed_fn = embed_fn  # async fn(text) -> list[float]

    async def suggest_predicates(
        self, request: PredicateSuggestRequest,
    ) -> PredicateSuggestResponse:
        """Full pipeline: embed → search → score → rank → return top N."""
        start = datetime.now(timezone.utc)

        # 1. Build subject device text
        subject_text = self._build_subject_text(request)
        subject_hash = hashlib.sha256(subject_text.encode()).hexdigest()

        # 2. Get candidates (semantic or text fallback)
        candidates = await self._get_candidates(request, subject_text)

        # 3. Score each candidate
        suggestions: list[PredicateSuggestion] = []
        for cand in candidates:
            score = await self._calculate_strategy_score(cand)
            suggestion = PredicateSuggestion(
                k_number=cand["k_number"],
                device_name=cand.get("device_name", "Unknown"),
                applicant=cand.get("applicant"),
                clearance_date=cand.get("decision_date"),
                product_code=cand.get("product_code"),
                similarity_score=1.0 - cand.get("semantic_distance", 0.5),
                toxicity_score=score.toxicity_score,
                lineage_safety=score.lineage_safety.value,
                strategy_recommendation=score.strategy.value,
                reasoning=score.explanation,
                composite_score=self._composite_score(
                    1.0 - cand.get("semantic_distance", 0.5),
                    score.toxicity_score,
                ),
                semantic_distance=cand.get("semantic_distance"),
            )
            suggestions.append(suggestion)

        # 4. Sort by composite score (similarity - toxicity_penalty)
        suggestions.sort(key=lambda s: s.composite_score, reverse=True)

        return PredicateSuggestResponse(
            suggestions=suggestions[: request.max_results],
            subject_device_hash=subject_hash,
            total_candidates_evaluated=len(candidates),
            generated_at=start.isoformat(),
        )

    # ─────────────────────────────────────────────────────────────────────
    # Subject text construction
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_subject_text(request: PredicateSuggestRequest) -> str:
        parts = [request.intended_use]
        if request.technology:
            parts.append(request.technology)
        if request.materials:
            parts.append(request.materials)
        if request.energy_source:
            parts.append(request.energy_source)
        if request.tissue_contact:
            parts.append(request.tissue_contact)
        if request.sterilization:
            parts.append(request.sterilization)
        return " ".join(parts)

    # ─────────────────────────────────────────────────────────────────────
    # Candidate retrieval (semantic search → text fallback)
    # ─────────────────────────────────────────────────────────────────────

    async def _get_candidates(
        self,
        request: PredicateSuggestRequest,
        subject_text: str,
    ) -> list[dict[str, Any]]:
        """Try semantic search; fall back to text ILIKE."""
        # Try embedding-based search first
        if self._embed_fn:
            try:
                embedding = await self._embed_fn(subject_text)
                return await self._semantic_search(
                    embedding, request.product_code, MAX_CANDIDATES_INTERNAL,
                )
            except Exception:  # noqa: BLE001
                logger.warning("Semantic search failed, falling back to text")

        # Text fallback
        return await self._text_search(
            request.product_code,
            subject_text,
            MAX_CANDIDATES_INTERNAL,
        )

    async def _semantic_search(
        self,
        embedding: list[float],
        product_code: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """pgvector cosine similarity search."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                sql.SEMANTIC_SEARCH_CLEARANCES,
                embedding,      # $1
                product_code,   # $2
                limit,          # $3
            )
            return [dict(r) for r in rows]

    async def _text_search(
        self,
        product_code: str,
        subject_text: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Text-based fallback: product_code match + simple keyword."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                sql.SELECT_CLEARANCES_BY_PRODUCT_CODE,
                product_code,
                limit,
            )
            results = [dict(r) for r in rows]
            # Add synthetic distance based on simple text overlap
            subject_words = set(subject_text.lower().split())
            for r in results:
                device_words = set((r.get("device_name") or "").lower().split())
                overlap = len(subject_words & device_words)
                max_words = max(len(subject_words), len(device_words), 1)
                r["semantic_distance"] = 1.0 - (overlap / max_words)
            return results

    # ─────────────────────────────────────────────────────────────────────
    # Strategy Scoring
    # ─────────────────────────────────────────────────────────────────────

    async def _calculate_strategy_score(
        self, candidate: dict[str, Any],
    ) -> StrategyScore:
        """The secret sauce: regulatory strategy, not just text similarity."""
        score = StrategyScore()
        k_number = candidate["k_number"]

        # 1. Toxicity from safety signals
        score.toxicity_score = await self._calculate_toxicity(k_number)

        if score.toxicity_score > TOXICITY_AVOID_THRESHOLD:
            score.strategy = StrategyRecommendation.AVOID
            score.lineage_safety = LineageSafety.COMPROMISED
            score.explanation = (
                f"AVOID: Predicate {k_number} has severe safety signal history "
                f"(toxicity={score.toxicity_score:.2f}). "
                "Class I recall or safety communication in lineage."
            )
            return score

        # 2. Lineage family safety
        family_recalls = await self._check_family_safety(k_number)
        score.family_recall_count = family_recalls

        if family_recalls > FAMILY_RECALL_RISKY_THRESHOLD:
            score.lineage_safety = LineageSafety.COMPROMISED
            score.strategy = StrategyRecommendation.RISKY
            score.explanation = (
                f"RISKY: Predicate family tree has {family_recalls} recalls. "
                "Consider alternative predicate with cleaner lineage."
            )
            return score

        score.lineage_safety = LineageSafety.CLEAN

        # 3. Recency vs. Conservatism trade-off
        decision_date = candidate.get("decision_date")
        if decision_date:
            age_days = (date.today() - decision_date).days
            score.age_years = age_days / 365.25

            if score.age_years < AGGRESSIVE_AGE_YEARS:
                score.strategy = StrategyRecommendation.AGGRESSIVE
                score.explanation = (
                    "Recent clearance with modern technological characteristics. "
                    "Strong similarity signal, but less post-market history."
                )
            elif score.age_years > CONSERVATIVE_AGE_YEARS:
                score.strategy = StrategyRecommendation.CONSERVATIVE
                score.explanation = (
                    "Well-established predicate with extensive post-market history. "
                    "FDA familiar with device lineage — lower review risk."
                )
            else:
                score.strategy = StrategyRecommendation.BALANCED
                score.explanation = (
                    "Balanced choice: sufficient post-market history with "
                    "reasonably current technology characteristics."
                )
        else:
            score.strategy = StrategyRecommendation.BALANCED
            score.explanation = "Decision date unknown — defaulting to balanced strategy."

        # Toxicity caution zone
        if score.toxicity_score > TOXICITY_RISKY_THRESHOLD:
            score.explanation += (
                f" Caution: moderate safety signals detected "
                f"(toxicity={score.toxicity_score:.2f})."
            )

        return score

    async def _calculate_toxicity(self, k_number: str) -> float:
        """Weighted toxicity from safety signals."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                sql.SELECT_SIGNALS_BY_K_NUMBER,
                k_number,
            )
            if not rows:
                return 0.0

            total = 0.0
            for row in rows:
                signal_type = row["signal_type"]  # type: ignore[index]
                severity = row["severity_score"]  # type: ignore[index]
                weight = TOXICITY_WEIGHTS.get(signal_type, 0.1)
                total += severity * weight

            return min(total, 1.0)

    async def _check_family_safety(self, k_number: str) -> int:
        """Count recalls in predicate family tree (recursive CTE)."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(sql.CHECK_FAMILY_SAFETY, k_number)
            if row:
                return row["family_recall_count"]  # type: ignore[index]
            return 0

    # ─────────────────────────────────────────────────────────────────────
    # Composite Score
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _composite_score(similarity: float, toxicity: float) -> float:
        """Higher = better.  Toxicity penalty is 2x weighted."""
        return similarity - (toxicity * 2.0)
