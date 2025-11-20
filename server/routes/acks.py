# acks.py – returns ESG ACK statuses & paths for a sequence
from fastapi import APIRouter, Depends, HTTPException
from server.db import SessionLocal
from server.models.sequence import INDSequence
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/ind", tags=["ind"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/sequence/{seq_id}/acks")
def get_acks(seq_id: str, db: Session = Depends(get_db)):
    seq = db.query(INDSequence).filter_by(sequence=seq_id).first()
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return {
        "ack1": seq.ack1_path,
        "ack2": seq.ack2_path,
        "ack3": seq.ack3_path,
        "status": seq.status,
    }