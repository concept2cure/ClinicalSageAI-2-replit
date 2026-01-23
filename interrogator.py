from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .config import Settings
from .db import AppContext, Database
from .embeddings import EmbeddingsProvider
from .sql import (
    GET_FRAGMENT_HEADER,
    GET_FRAGMENT_VERSION,
    GET_TRUTH_LINKS_WITH_TRUTH,
    INSERT_AUDIT_LOG,
    SEARCH_PRECEDENTS_BY_VECTOR,
)
from .utils import vector_literal


@dataclass
class InterrogationResult:
    audit_log_id: str
    fragment_id: str
    version_id: int
    risk_status: str
    drift_magnitude: float | None
    predicted_questions: list[str]
    precedent_hits: list[dict[str, Any]]
    truth_links: list[dict[str, Any]]
    notes: list[str]
    debug: dict[str, Any] | None = None


def _extract_numeric_claim(extracted_claim_value: dict[str, Any] | None) -> float | None:
    if not extracted_claim_value:
        return None
    # Accept a few common patterns:
    # {"value": 1.23}, {"value_float": 1.23}, {"numeric": 1.23}
    for k in ("value", "value_float", "numeric"):
        v = extracted_claim_value.get(k)
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                pass
    return None


def _extract_text_claim(extracted_claim_value: dict[str, Any] | None) -> str | None:
    if not extracted_claim_value:
        return None
    for k in ("text", "value_text", "string"):
        v = extracted_claim_value.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _per_link_drift(link: dict[str, Any]) -> float | None:
    truth_f = link.get("metric_value_float")
    truth_t = link.get("metric_value_text")
    claim = link.get("extracted_claim_value") or None

    claim_num = _extract_numeric_claim(claim)
    if claim_num is not None and isinstance(truth_f, (int, float)):
        denom = max(abs(float(truth_f)), 1e-9)
        return min(abs(claim_num - float(truth_f)) / denom, 1.0)

    claim_text = _extract_text_claim(claim)
    if claim_text is not None and isinstance(truth_t, str) and truth_t.strip():
        return 0.0 if claim_text.strip() == truth_t.strip() else 1.0

    # Unverifiable drift (linked but not machine-comparable)
    return None


def _aggregate_drift(per_link: list[float | None], default_when_unverifiable: float = 0.15) -> float:
    # Conservative: if any verifiable drift is high, bubble it up.
    verifiable = [x for x in per_link if x is not None]
    if verifiable:
        return max(verifiable)

    # No comparable claims; still assign mild risk to reflect unverifiability.
    return default_when_unverifiable


def interrogate_fragment(
    *,
    db: Database,
    settings: Settings,
    embedder: EmbeddingsProvider,
    fragment_id: str,
    version_id: int | None,
    agency_code: str | None,
    top_k: int | None,
    ctx: AppContext,
) -> InterrogationResult:
    notes: list[str] = []
    debug: dict[str, Any] = {}

    with db.transaction(ctx) as conn:
        with conn.cursor() as cur:
            # Resolve fragment header
            cur.execute(GET_FRAGMENT_HEADER, {"fragment_id": fragment_id})
            header = cur.fetchone()
            if not header:
                raise ValueError(f"Fragment not found: {fragment_id}")

            current_version = int(header["version_id"])
            use_version = int(version_id) if version_id is not None else current_version

            # Load exact version row (immutable history)
            cur.execute(GET_FRAGMENT_VERSION, {"fragment_id": fragment_id, "version_id": use_version})
            version_row = cur.fetchone()
            if not version_row:
                raise ValueError(f"Fragment version not found: {fragment_id} v{use_version}")

            content = version_row.get("content_prose") or ""
            embedding = version_row.get("embedding")

            # Truth linkage + drift
            cur.execute(GET_TRUTH_LINKS_WITH_TRUTH, {"fragment_id": fragment_id})
            truth_links = list(cur.fetchall() or [])

            per_link_drifts: list[float | None] = []
            for lnk in truth_links:
                d = _per_link_drift(lnk)
                per_link_drifts.append(d)
                lnk["per_link_drift"] = d

            drift_magnitude: float | None
            if len(truth_links) == 0:
                drift_magnitude = 1.0
                notes.append("No truth links found for fragment; treating as high drift by default.")
            else:
                drift_magnitude = _aggregate_drift(per_link_drifts)

            # Embedding (ephemeral for interrogation if missing)
            query_vector_literal: str | None = None
            used_ephemeral_embedding = False

            if embedding is None and content.strip():
                vec = embedder.embed_text(content)
                if vec is not None:
                    query_vector_literal = vector_literal(vec)
                    used_ephemeral_embedding = True
                    notes.append("Fragment has no stored embedding; using ephemeral embedding for this interrogation.")
                else:
                    notes.append("Embedding provider disabled; skipping precedent retrieval.")
            elif embedding is not None:
                # psycopg returns pgvector as str-like, but safe to cast via ::vector in SQL
                query_vector_literal = str(embedding)
            else:
                notes.append("No content_prose or embedding available; skipping precedent retrieval.")

            # Adversarial precedent retrieval
            precedent_hits: list[dict[str, Any]] = []
            predicted_questions: list[str] = []

            effective_top_k = int(top_k) if top_k is not None else settings.precedent_top_k

            if query_vector_literal:
                cur.execute(
                    SEARCH_PRECEDENTS_BY_VECTOR,
                    {"query_vector": query_vector_literal, "agency_code": agency_code, "top_k": effective_top_k},
                )
                precedent_hits = list(cur.fetchall() or [])
                predicted_questions = [p["historical_question"] for p in precedent_hits]
            else:
                precedent_hits = []
                predicted_questions = []

            # Risk status logic
            risk_status: str
            if drift_magnitude is not None and drift_magnitude >= settings.drift_red_threshold:
                risk_status = "DATA_DRIFT"
            else:
                # If any very close precedent exists, treat as IR risk
                close = False
                close_dist = None
                for p in precedent_hits:
                    dist = p.get("distance")
                    if isinstance(dist, (int, float)) and dist <= settings.ir_sim_distance_threshold:
                        close = True
                        close_dist = dist
                        break
                if close:
                    risk_status = "IR_PREDICTED"
                    notes.append(f"Close adversarial precedent detected (distance={close_dist}).")
                else:
                    # If drift exists but mild, flag amber
                    if drift_magnitude is not None and drift_magnitude >= settings.drift_amber_threshold:
                        risk_status = "IR_PREDICTED"
                        notes.append("Mild drift detected; flagging as IR_PREDICTED for conservative QA.")
                    else:
                        risk_status = "ALIGNED"

            # Build audit payload (structured, heatmap-friendly)
            payload = {
                "fragment_id": fragment_id,
                "version_id": use_version,
                "ectd_section_path": version_row.get("ectd_section_path"),
                "jurisdiction": version_row.get("jurisdiction"),
                "drift_magnitude": drift_magnitude,
                "risk_status": risk_status,
                "truth_link_count": len(truth_links),
                "precedent_top_k": effective_top_k,
                "agency_filter": agency_code,
                "precedent_hits": [
                    {
                        "id": str(p["id"]),
                        "agency_code": p["agency_code"],
                        "failure_mode": p["failure_mode"],
                        "historical_question": p["historical_question"],
                        "source_ref": p.get("source_ref"),
                        "distance": float(p["distance"]) if p.get("distance") is not None else None,
                    }
                    for p in precedent_hits
                ],
                "truth_links": [
                    {
                        "truth_id": str(t["truth_id"]),
                        "metric_name": t["metric_name"],
                        "metric_value_float": t.get("metric_value_float"),
                        "metric_value_text": t.get("metric_value_text"),
                        "is_primary_endpoint": bool(t.get("is_primary_endpoint")),
                        "claim_kind": t.get("claim_kind"),
                        "extracted_claim_value": t.get("extracted_claim_value"),
                        "per_link_drift": t.get("per_link_drift"),
                        "source_document_ref": t.get("source_document_ref"),
                    }
                    for t in truth_links
                ],
                "notes": notes,
                "run_metadata": {
                    "service": settings.service_name,
                    "embedding_provider": settings.embedding_provider,
                    "embedding_dim": settings.embedding_dim,
                    "used_ephemeral_embedding": used_ephemeral_embedding,
                },
                "request_context": {
                    "request_id": ctx.request_id,
                    "user": ctx.user,
                    "reason": ctx.reason,
                },
            }

            cur.execute(
                INSERT_AUDIT_LOG,
                {
                    "fragment_id": fragment_id,
                    "agent_identity": settings.default_agent_identity,
                    "risk_status": risk_status,
                    "feedback_payload": json.dumps(payload),
                    "drift_magnitude": drift_magnitude,
                },
            )
            audit_row = cur.fetchone()
            if not audit_row:
                raise RuntimeError("Failed to write audit log")

            audit_log_id = str(audit_row["id"])

    # Optionally include debug output
    if debug is not None:
        debug.update(
            {
                "used_version": use_version,
                "current_version": current_version,
                "ephemeral_embedding": used_ephemeral_embedding,
            }
        )

    return InterrogationResult(
        audit_log_id=audit_log_id,
        fragment_id=fragment_id,
        version_id=use_version,
        risk_status=risk_status,
        drift_magnitude=drift_magnitude,
        predicted_questions=predicted_questions,
        precedent_hits=precedent_hits,
        truth_links=truth_links,
        notes=notes,
        debug=debug,
    )
