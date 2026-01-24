from __future__ import annotations

import json
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .config import Settings
from .db import AppContext, Database
from .embeddings import build_provider
from .interrogator import interrogate_fragment
from .models import (
    FragmentCreate,
    FragmentCreated,
    FragmentUpdate,
    InterrogateRequest,
    InterrogateResponse,
    PrecedentCreate,
    PrecedentCreated,
    TruthCreate,
    TruthCreated,
    TruthLinkCreate,
    TruthLinkResult,
)
from .sql import (
    INSERT_FRAGMENT,
    INSERT_PRECEDENT,
    INSERT_TRUTH,
    INSERT_TRUTH_LINK,
    LIST_FRAGMENT_VERSIONS,
)
from .utils import ensure_request_id, vector_literal

load_dotenv()

settings = Settings.load()
db = Database(settings.database_url)
embedder = build_provider(settings.embedding_provider, settings.embedding_dim)

app = FastAPI(title=settings.service_name)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": settings.service_name,
        "embedding_provider": settings.embedding_provider,
        "embedding_dim": settings.embedding_dim,
    }


def _ctx(
    x_user: str | None,
    x_reason: str | None,
    x_request_id: str | None,
) -> AppContext:
    return AppContext(
        user=x_user or "unknown",
        reason=x_reason,
        request_id=ensure_request_id(x_request_id),
    )


@app.post("/truth", response_model=TruthCreated)
def create_truth(
    payload: TruthCreate,
    x_user: str | None = Header(default=None, alias="X-User"),
    x_reason: str | None = Header(default=None, alias="X-Reason"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> TruthCreated:
    ctx = _ctx(x_user, x_reason, x_request_id)
    with db.transaction(ctx) as conn:
        with conn.cursor() as cur:
            cur.execute(
                INSERT_TRUTH,
                {
                    **payload.model_dump(),
                },
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to insert truth row")
            return TruthCreated(id=str(row["id"]))


@app.post("/fragments", response_model=FragmentCreated)
def create_fragment(
    payload: FragmentCreate,
    x_user: str | None = Header(default=None, alias="X-User"),
    x_reason: str | None = Header(default=None, alias="X-Reason"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> FragmentCreated:
    ctx = _ctx(x_user, x_reason, x_request_id)

    embedding = None
    if payload.content_prose and payload.content_prose.strip():
        vec = embedder.embed_text(payload.content_prose)
        if vec is not None:
            embedding = vector_literal(vec)

    with db.transaction(ctx) as conn:
        with conn.cursor() as cur:
            cur.execute(
                INSERT_FRAGMENT,
                {**payload.model_dump(), "embedding": embedding},
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to insert fragment")
            return FragmentCreated(id=str(row["id"]), version_id=int(row["version_id"]))


@app.patch("/fragments/{fragment_id}", response_model=FragmentCreated)
def update_fragment(
    fragment_id: str,
    payload: FragmentUpdate,
    x_user: str | None = Header(default=None, alias="X-User"),
    x_reason: str | None = Header(default=None, alias="X-Reason"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> FragmentCreated:
    ctx = _ctx(x_user, x_reason, x_request_id)

    # If content updates, compute embedding for this update version
    embedding = None
    if payload.content_prose and payload.content_prose.strip():
        vec = embedder.embed_text(payload.content_prose)
        if vec is not None:
            embedding = vector_literal(vec)

    from .sql import UPDATE_FRAGMENT

    with db.transaction(ctx) as conn:
        with conn.cursor() as cur:
            cur.execute(
                UPDATE_FRAGMENT,
                {
                    "fragment_id": fragment_id,
                    **payload.model_dump(),
                    "embedding": embedding,
                },
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Fragment not found")
            return FragmentCreated(id=str(row["id"]), version_id=int(row["version_id"]))


@app.get("/fragments/{fragment_id}/versions")
def list_versions(
    fragment_id: str,
) -> JSONResponse:
    with db.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(LIST_FRAGMENT_VERSIONS, {"fragment_id": fragment_id})
            rows = list(cur.fetchall() or [])
            return JSONResponse(content={"fragment_id": fragment_id, "versions": rows})


@app.post("/fragments/{fragment_id}/link-truth", response_model=TruthLinkResult)
def link_truth(
    fragment_id: str,
    payload: TruthLinkCreate,
    x_user: str | None = Header(default=None, alias="X-User"),
    x_reason: str | None = Header(default=None, alias="X-Reason"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> TruthLinkResult:
    ctx = _ctx(x_user, x_reason, x_request_id)

    inserted: list[str] = []
    skipped = 0

    with db.transaction(ctx) as conn:
        with conn.cursor() as cur:
            for tid in payload.truth_ids:
                cur.execute(
                    INSERT_TRUTH_LINK,
                    {
                        "fragment_id": fragment_id,
                        "truth_id": tid,
                        "claim_kind": payload.claim_kind,
                        "claim_span": json.dumps(payload.claim_span) if payload.claim_span else None,
                        "extracted_claim_value": json.dumps(payload.extracted_claim_value)
                        if payload.extracted_claim_value
                        else None,
                    },
                )
                row = cur.fetchone()
                if row and row.get("id"):
                    inserted.append(str(row["id"]))
                else:
                    skipped += 1

    return TruthLinkResult(inserted_link_ids=inserted, skipped_existing=skipped)


@app.post("/adversarial/precedents", response_model=PrecedentCreated)
def create_precedent(
    payload: PrecedentCreate,
    x_user: str | None = Header(default=None, alias="X-User"),
    x_reason: str | None = Header(default=None, alias="X-Reason"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> PrecedentCreated:
    ctx = _ctx(x_user, x_reason, x_request_id)

    # Embed question text
    vec = embedder.embed_text(payload.historical_question)
    precedent_vector = vector_literal(vec) if vec is not None else None

    with db.transaction(ctx) as conn:
        with conn.cursor() as cur:
            cur.execute(
                INSERT_PRECEDENT,
                {
                    **payload.model_dump(),
                    "precedent_vector": precedent_vector,
                },
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to insert precedent")
            return PrecedentCreated(id=str(row["id"]))


@app.post("/shadow/interrogate/{fragment_id}", response_model=InterrogateResponse)
def interrogate(
    fragment_id: str,
    req: InterrogateRequest,
    x_user: str | None = Header(default=None, alias="X-User"),
    x_reason: str | None = Header(default=None, alias="X-Reason"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> InterrogateResponse:
    ctx = _ctx(x_user, x_reason, x_request_id)

    try:
        res = interrogate_fragment(
            db=db,
            settings=settings,
            embedder=embedder,
            fragment_id=fragment_id,
            version_id=req.version_id,
            agency_code=req.agency_code,
            top_k=req.top_k,
            ctx=ctx,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interrogation failed: {e}") from e

    return InterrogateResponse(
        audit_log_id=res.audit_log_id,
        fragment_id=res.fragment_id,
        version_id=res.version_id,
        risk_status=res.risk_status,  # type: ignore
        drift_magnitude=res.drift_magnitude,
        predicted_questions=res.predicted_questions,
        precedent_hits=res.precedent_hits,
        truth_links=res.truth_links,
        notes=res.notes,
        debug=res.debug if req.include_debug else None,
    )
