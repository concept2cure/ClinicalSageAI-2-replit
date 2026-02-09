"""Phase 6.6 — Predicate Analyzer: Toxic Predicate Detection + Golden Bridge Strategy.

The core intelligence engine that finds predicate matches, scores toxicity,
and recommends conservative vs. aggressive submission routes.

Toxicity Scoring:
  - Class I recall in same product line:   +0.40
  - FDA Safety Communications:             +0.30
  - High MDR rate in MAUDE database:       +0.20
  - Class II recall:                       +0.15
  - Warning letters / 483 observations:    +0.10

Golden Bridge Strategy:
  - Conservative route: older, well-established predicates with clean records
  - Aggressive route: recent, closely-similar predicates (newer tech)
  - Both filtered to toxicity_score < 0.3 ("safe candidates")

Usage:
    analyzer = PredicateAnalyzer(program_id, conn)
    result = await analyzer.find_predicates(device_embedding)
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from . import sql_predicate as sql

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Toxicity weights
# ═══════════════════════════════════════════════════════════════════════════════

TOXICITY_WEIGHTS = {
    "class_i_recall": 0.40,
    "safety_communication": 0.30,
    "high_mdr_rate": 0.20,
    "class_ii_recall": 0.15,
    "warning_letter": 0.10,
    "483_observation": 0.10,
    "field_correction": 0.05,
    "class_iii_recall": 0.05,
}

# MDR threshold: devices with > this many MDR reports per year are "high MDR"
MDR_HIGH_THRESHOLD = 50

# Toxicity cutoff: candidates above this are "poisoned"
TOXICITY_SAFE_THRESHOLD = 0.30

# Conservative route: clearance date older than N years
CONSERVATIVE_AGE_YEARS = 5


class PredicateAnalyzer:
    """Finds predicate matches, calculates toxicity, recommends routes."""

    def __init__(self, program_id: UUID, conn: Any):
        self.program_id = program_id
        self.conn = conn

    # ─── Public API ────────────────────────────────────────────────────────

    async def find_predicates(
        self,
        device_description: str,
        *,
        similarity_threshold: float = 0.85,
        max_candidates: int = 20,
    ) -> dict[str, Any]:
        """Full predicate intelligence pipeline.

        1. Similarity search (pgvector or text matching)
        2. Toxicity scan (FDA enforcement database)
        3. Route classification (conservative vs. aggressive)
        4. Persist results to predicate.candidates

        Returns:
            {
                "conservative_route": [...safe, old, established predicates],
                "aggressive_route":   [...safe, recent, similar tech],
                "all_candidates":     [...all with toxicity scores],
                "toxic_count":        int,
                "safe_count":         int,
                "risk_analysis":      str,
            }
        """
        # Set RLS context
        await self.conn.execute(sql.SET_PROGRAM_CONTEXT, str(self.program_id))

        # Step 1: Get raw candidates (from existing DB or similarity search)
        raw_candidates = await self._get_similarity_candidates(
            device_description, similarity_threshold, max_candidates
        )

        if not raw_candidates:
            return {
                "conservative_route": [],
                "aggressive_route": [],
                "all_candidates": [],
                "toxic_count": 0,
                "safe_count": 0,
                "risk_analysis": "No predicate candidates found matching the device description.",
            }

        # Step 2: Toxicity scan for each candidate
        scored_candidates = []
        for cand in raw_candidates:
            toxicity = await self.calculate_toxicity(cand["k_number"])
            cand.update(toxicity)
            scored_candidates.append(cand)

        # Step 3: Filter safe vs. toxic
        safe_candidates = [
            c for c in scored_candidates
            if c["toxicity_score"] < TOXICITY_SAFE_THRESHOLD
        ]
        toxic_candidates = [
            c for c in scored_candidates
            if c["toxicity_score"] >= TOXICITY_SAFE_THRESHOLD
        ]

        # Step 4: Route classification
        conservative = self._get_conservative_predicates(safe_candidates)
        aggressive = self._get_aggressive_predicates(safe_candidates)

        # Step 5: Mark recommended
        if conservative:
            conservative[0]["recommended"] = True
            conservative[0]["route_type"] = "conservative"
        if aggressive:
            aggressive[0]["route_type"] = "aggressive"

        # Step 6: Persist all candidates to DB
        persisted = []
        for cand in scored_candidates:
            row = await self._persist_candidate(cand)
            if row:
                persisted.append(row)

        # Step 7: Generate risk analysis narrative
        risk_analysis = self._generate_risk_analysis(
            safe_count=len(safe_candidates),
            toxic_count=len(toxic_candidates),
            conservative=conservative,
            aggressive=aggressive,
        )

        return {
            "conservative_route": conservative[:3],
            "aggressive_route": aggressive[:3],
            "all_candidates": scored_candidates,
            "toxic_count": len(toxic_candidates),
            "safe_count": len(safe_candidates),
            "risk_analysis": risk_analysis,
        }

    async def calculate_toxicity(self, k_number: str) -> dict[str, Any]:
        """Calculate toxicity score for a single predicate K-number.

        Queries the fda_enforcement table for recalls, safety comms, MDR reports.

        Returns dict with:
            toxicity_score, has_class_i_recall, has_class_ii_recall,
            has_safety_comm, mdr_event_count
        """
        score = 0.0
        has_class_i = False
        has_class_ii = False
        has_safety_comm = False
        mdr_count = 0

        # Query enforcement actions
        events = await self.conn.fetch(
            sql.SELECT_ENFORCEMENT_BY_K_NUMBER, k_number
        )

        for event in events:
            event_type = event["event_type"]

            if event_type == "class_i_recall":
                score += TOXICITY_WEIGHTS["class_i_recall"]
                has_class_i = True
            elif event_type == "class_ii_recall":
                score += TOXICITY_WEIGHTS["class_ii_recall"]
                has_class_ii = True
            elif event_type == "class_iii_recall":
                score += TOXICITY_WEIGHTS["class_iii_recall"]
            elif event_type == "safety_communication":
                score += TOXICITY_WEIGHTS["safety_communication"]
                has_safety_comm = True
            elif event_type == "warning_letter":
                score += TOXICITY_WEIGHTS["warning_letter"]
            elif event_type == "483_observation":
                score += TOXICITY_WEIGHTS["483_observation"]
            elif event_type == "field_correction":
                score += TOXICITY_WEIGHTS["field_correction"]
            elif event_type == "mdr_report":
                mdr_count += 1

        # High MDR rate penalty
        if mdr_count > MDR_HIGH_THRESHOLD:
            score += TOXICITY_WEIGHTS["high_mdr_rate"]

        # Cap at 1.0
        score = min(score, 1.0)

        return {
            "toxicity_score": round(score, 3),
            "has_class_i_recall": has_class_i,
            "has_class_ii_recall": has_class_ii,
            "has_safety_comm": has_safety_comm,
            "mdr_event_count": mdr_count,
        }

    # ─── Internal helpers ──────────────────────────────────────────────────

    async def _get_similarity_candidates(
        self, device_description: str, threshold: float, max_count: int
    ) -> list[dict[str, Any]]:
        """Retrieve candidate predicates via similarity search.

        Uses pgvector cosine similarity when embeddings are available,
        falls back to text-based matching against fda_510k_submissions.
        """
        # Try vector search first
        try:
            rows = await self.conn.fetch(
                """
                SELECT k_number, device_name, manufacturer, clearance_date,
                       product_code, regulation_number,
                       1 - (embedding <=> $1::vector) AS similarity_score
                  FROM predicate.fda_clearances
                 WHERE 1 - (embedding <=> $1::vector) > $2
                 ORDER BY similarity_score DESC
                 LIMIT $3
                """,
                device_description, threshold, max_count,
            )
            if rows:
                return [dict(r) for r in rows]
        except Exception:
            logger.debug("pgvector search unavailable, using text fallback")

        # Fallback: check existing candidates in DB for this program
        rows = await self.conn.fetch(
            sql.SELECT_CANDIDATES_BY_PROGRAM, self.program_id
        )
        return [dict(r) for r in rows[:max_count]]

    def _get_conservative_predicates(
        self, safe_candidates: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Conservative route: older, well-established predicates.

        Prefer predicates cleared > CONSERVATIVE_AGE_YEARS ago with low toxicity.
        These are the "grandparent" predicates — proven safe with long track record.
        """
        today = date.today()
        conservative = []

        for c in safe_candidates:
            clearance_date = c.get("clearance_date")
            if clearance_date and isinstance(clearance_date, date):
                age_years = (today - clearance_date).days / 365.25
                if age_years >= CONSERVATIVE_AGE_YEARS:
                    c["route_type"] = "conservative"
                    conservative.append(c)

        # Sort by toxicity (lowest first), then similarity (highest)
        conservative.sort(
            key=lambda x: (x.get("toxicity_score", 0), -x.get("similarity_score", 0))
        )
        return conservative

    def _get_aggressive_predicates(
        self, safe_candidates: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Aggressive route: recent, closely similar predicates.

        Prefer predicates cleared in last CONSERVATIVE_AGE_YEARS with high similarity.
        These are newer-generation devices — may face more scrutiny but strong SE argument.
        """
        today = date.today()
        aggressive = []

        for c in safe_candidates:
            clearance_date = c.get("clearance_date")
            if clearance_date and isinstance(clearance_date, date):
                age_years = (today - clearance_date).days / 365.25
                if age_years < CONSERVATIVE_AGE_YEARS:
                    c["route_type"] = "aggressive"
                    aggressive.append(c)
            elif not clearance_date:
                # Unknown date — treat as aggressive
                c["route_type"] = "aggressive"
                aggressive.append(c)

        # Sort by similarity (highest first), then toxicity (lowest)
        aggressive.sort(
            key=lambda x: (-x.get("similarity_score", 0), x.get("toxicity_score", 0))
        )
        return aggressive

    async def _persist_candidate(self, cand: dict[str, Any]) -> Optional[dict]:
        """Insert or skip a candidate in predicate.candidates."""
        try:
            # Check if already exists
            existing = await self.conn.fetchrow(
                sql.SELECT_CANDIDATE_BY_K_NUMBER,
                cand["k_number"], self.program_id,
            )
            if existing:
                # Update toxicity data
                row = await self.conn.fetchrow(
                    sql.UPDATE_CANDIDATE_TOXICITY,
                    existing["id"],
                    self.program_id,
                    cand.get("toxicity_score", 0),
                    cand.get("has_class_i_recall", False),
                    cand.get("has_class_ii_recall", False),
                    cand.get("has_safety_comm", False),
                    cand.get("mdr_event_count", 0),
                )
                return dict(row) if row else None

            # Insert new
            row = await self.conn.fetchrow(
                sql.INSERT_CANDIDATE,
                self.program_id,
                cand["k_number"],
                cand["device_name"],
                cand.get("manufacturer"),
                cand.get("clearance_date"),
                cand.get("product_code"),
                cand.get("regulation_number"),
                cand.get("similarity_score", 0),
                cand.get("toxicity_score", 0),
                cand.get("has_class_i_recall", False),
                cand.get("has_class_ii_recall", False),
                cand.get("has_safety_comm", False),
                cand.get("mdr_event_count", 0),
                json.dumps(cand.get("golden_bridge_path", [])),
                cand.get("route_type"),
                cand.get("recommended", False),
                cand.get("evidence_links", []),
                cand.get("selection_rationale"),
                cand.get("status", "active"),
            )
            return dict(row) if row else None
        except Exception as e:
            logger.warning("Failed to persist candidate %s: %s", cand.get("k_number"), e)
            return None

    def _generate_risk_analysis(
        self,
        safe_count: int,
        toxic_count: int,
        conservative: list[dict[str, Any]],
        aggressive: list[dict[str, Any]],
    ) -> str:
        """Generate a human-readable risk analysis narrative."""
        total = safe_count + toxic_count
        parts = [
            f"Analyzed {total} predicate candidate(s): "
            f"{safe_count} safe (toxicity < {TOXICITY_SAFE_THRESHOLD}), "
            f"{toxic_count} flagged as potentially toxic."
        ]

        if toxic_count > 0:
            parts.append(
                f"⚠️ {toxic_count} predicate(s) have FDA enforcement history "
                "(recalls, safety communications, or elevated MDR rates). "
                "Citing these predicates introduces regulatory risk."
            )

        if conservative:
            top = conservative[0]
            parts.append(
                f"Conservative route recommended: {top['device_name']} "
                f"(K{top['k_number']}) — well-established predicate with "
                f"toxicity score {top.get('toxicity_score', 0):.2f}."
            )

        if aggressive:
            top = aggressive[0]
            parts.append(
                f"Aggressive route available: {top['device_name']} "
                f"(K{top['k_number']}) — recent predicate with similarity "
                f"{top.get('similarity_score', 0):.2f}, toxicity {top.get('toxicity_score', 0):.2f}."
            )

        if not conservative and not aggressive:
            parts.append(
                "No safe predicate routes identified. Consider broadening search "
                "criteria or consulting regulatory counsel."
            )

        return " ".join(parts)
