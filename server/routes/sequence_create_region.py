# sequence_create_region.py – Variant of sequence/create supporting region profiles
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime
import os, shutil
from sqlalchemy.orm import Session
from server.db import SessionLocal
from server.models.sequence import INDSequence, INDSequenceDoc, Document, SubmissionProfile
from utils.write_ectd_xml import write_ectd_xml
from utils.write_eu_regional_xml import write_eu_regional_xml

router = APIRouter(prefix="/api/ind", tags=["ind"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class DocSlot(BaseModel):
    id: int
    title: str
    version: str
    module: str
    operation: str

class SequenceInput(BaseModel):
    base: str
    region: str = Field('FDA', pattern='^(FDA|EMA|PMDA)$')
    plan: List[DocSlot]

@router.post("/sequence/create-region")
async def create_sequence_region(body: SequenceInput, db: Session = Depends(get_db)):
    next_seq = int(body.base) + 1
    folder = f"{next_seq:04d}"
    seq_path = os.path.join('/mnt/data/ectd', folder)
    os.makedirs(seq_path, exist_ok=True)

    # Insert sequence record
    seq = INDSequence(sequence=folder, region=body.region, created=datetime.utcnow(), doc_count=len(body.plan))
    db.add(seq); db.flush()

    docs_models = []
    for slot in body.plan:
        doc = db.query(Document).filter_by(id=slot.id).first()
        if not doc:
            raise HTTPException(404, f'Document {slot.id} missing')
        mpath = os.path.join(seq_path, *slot.module.split('.'))
        os.makedirs(mpath, exist_ok=True)
        fname = f"{doc.slug or doc.title}.pdf"
        fpath = os.path.join(mpath, fname)
        shutil.copyfile(doc.path, fpath)
        rec = INDSequenceDoc(sequence=folder, doc_id=doc.id, module=slot.module, op=slot.operation, file_path=fpath)
        db.add(rec)
        docs_models.append(rec)

    # --- Region‑specific mandatory docs ---
    from server.utils.region_rules import check_required
    missing = check_required([doc for doc in docs_models], body.region)
    if missing:
        raise HTTPException(
            status_code=400,
            detail={"missing_docs": missing}
        )
    # --------------------------------------

    # write index.xml and regional depending on profile
    write_ectd_xml(folder, docs_models)
    if body.region == 'EMA':
        write_eu_regional_xml(folder, docs_models, meta={'procedure_type': 'National', 'applicant': 'Acme Bio'})
    # PMDA builder TBD

    db.commit()
    return {'sequence': folder, 'region': body.region}