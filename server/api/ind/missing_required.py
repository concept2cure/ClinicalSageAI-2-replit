# missing_required.py – returns list of mandatory docs missing for region profile
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from server.db import SessionLocal
from server.models.sequence import INDSequence, INDSequenceDoc, Document
from server.utils.region_rules import check_required

router = APIRouter(prefix="/api/ind", tags=["ind"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/sequence/{seq_id}/missing-required")
async def missing_required(seq_id: str, db: Session = Depends(get_db)):
    seq = db.query(INDSequence).filter_by(sequence=seq_id).first()
    if not seq:
        raise HTTPException(404, 'Sequence not found')

    docs_join = (
        db.query(Document)
        .join(INDSequenceDoc, INDSequenceDoc.doc_id == Document.id)
        .filter(INDSequenceDoc.sequence == seq_id)
        .all()
    )
    missing = check_required(docs_join, seq.region or 'FDA')
    return {"region": seq.region, "missing": missing, "count": len(missing)}