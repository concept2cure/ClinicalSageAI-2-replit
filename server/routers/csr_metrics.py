from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from server.db import get_db
from server.models.csr import Benchmark, InsightModel, TrendPoint

router = APIRouter(prefix="/api", tags=["csr-metrics"])

@router.get("/benchmarks")
def list_benchmarks(
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    rows = (
        db.query(Benchmark)
        .order_by(Benchmark.metric)
        .limit(limit)
        .all()
    )
    return [
        {
            "metric": r.metric,
            "value": f"{r.value:g} {r.unit}".strip(),
            "trend": r.trend or []
        }
        for r in rows
    ]


@router.get("/insight-models")
def list_insight_models(
    limit: int = Query(14, le=50),
    db: Session = Depends(get_db)
):
    rows = (
        db.query(InsightModel)
        .order_by(InsightModel.name)
        .limit(limit)
        .all()
    )
    return [
        {
            "name": r.name, 
            "description": r.description,
            "version": r.version,
            "tags": r.tags or [],
            "docUrl": r.doc_url
        }
        for r in rows
    ]