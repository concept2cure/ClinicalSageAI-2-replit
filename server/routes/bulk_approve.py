# bulk_approve.py – approve multiple docs & run QC in batch
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, conlist
from sqlalchemy.orm import Session
from datetime import datetime
from server.db import SessionLocal
from server.models.document import Document
from utils.pdf_qc import qc_pdf
from utils.event_bus import publish

router = APIRouter(prefix="/api/documents", tags=["documents"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class BulkBody(BaseModel):
    ids: conlist(int, min_items=1)
    comment: str | None = None

@router.post('/bulk-approve')
async def bulk_approve(body: BulkBody, db: Session = Depends(get_db)):
    results = {"passed": [], "failed": []}
    for doc_id in body.ids:
        doc = db.query(Document).filter_by(id=doc_id).first()
        if not doc:
            results['failed'].append({'id': doc_id, 'error': 'not found'}); continue
        try:
            report = qc_pdf(doc.path)
            doc.qc_json = report
            if report['status'] != 'passed':
                doc.status = 'qc_failed'
                results['failed'].append({'id': doc_id, 'error': 'qc_failed'})
                publish('qc', {'id': doc_id, 'status': 'failed'})
                continue
            doc.status = 'approved'
            doc.approved_at = datetime.utcnow()
            doc.approval_comment = body.comment
            results['passed'].append({'id': doc_id})
            publish('qc', {'id': doc_id, 'status': 'passed'})
        except Exception as e:
            results['failed'].append({'id': doc_id, 'error': str(e)})
    db.commit()
    return results