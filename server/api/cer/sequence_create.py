"""
CER Sequence Creation API

This module provides FastAPI endpoints for creating CER (Clinical Evaluation Report) 
sequences for different regulatory regions.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, conlist
from datetime import datetime
import os
import shutil
from sqlalchemy.orm import Session

from server.db import SessionLocal
from server.models.cer_sequence import CERSequence, CERSequenceDoc
from server.models.document import Document
from utils.write_eu_regional_xml import write_eu_regional_xml
from utils.write_ectd_xml import write_ectd_xml  # reuse common builder

router = APIRouter(prefix="/api/cer", tags=["cer"])

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class DocSlot(BaseModel):
    """Document slot in a sequence"""
    id: int
    module: str

class SequenceBody(BaseModel):
    """Request body for sequence creation"""
    region: str
    plan: conlist(DocSlot, min_items=1)

@router.post("/sequence/create")
def create_cer_sequence(body: SequenceBody, db: Session = Depends(get_db)):
    """
    Create a new CER sequence with the provided documents
    
    Args:
        body: Request body containing region and document plan
        db: Database session
    
    Returns:
        dict: Sequence information (id and region)
    """
    # Create sequence record
    seq = CERSequence(region=body.region, created=datetime.utcnow())
    db.add(seq)
    db.flush()  # Get ID without committing

    # Create output directory structure
    seq_path = f"./output/cer/{seq.id:04d}"
    os.makedirs(seq_path, exist_ok=True)
    
    # Process documents
    doc_models = []
    for slot in body.plan:
        # Get document and validate
        doc = db.query(Document).filter_by(id=slot.id).first()
        if not doc or doc.status != "approved":
            raise HTTPException(400, f"Document {slot.id} not approved")
        
        # Create destination path and copy file
        doc_path_parts = slot.module.split(".")
        dst_dir = os.path.join(seq_path, *doc_path_parts[:-1])
        os.makedirs(dst_dir, exist_ok=True)
        
        filename = f"{doc.slug or f'doc_{doc.id}'}.pdf"
        dst = os.path.join(dst_dir, filename)
        
        try:
            # Copy the file if path exists
            if doc.path and os.path.exists(doc.path):
                shutil.copyfile(doc.path, dst)
        except Exception as e:
            raise HTTPException(500, f"Failed to copy document file: {str(e)}")

        # Create sequence document record
        rec = CERSequenceDoc(
            sequence_id=seq.id,
            doc_id=doc.id,
            module=slot.module,
            file_path=dst
        )
        db.add(rec)
        doc_models.append(rec)

    # Generate XML files based on region
    try:
        # Common index.xml (shared across regions)
        write_ectd_xml(f"{seq.id:04d}", doc_models)
        
        # Region-specific XMLs
        if body.region == "EU":
            write_eu_regional_xml(
                f"{seq.id:04d}", 
                doc_models,
                meta={"applicant": "Acme-Med", "procedure_type": "NB"}
            )
        # TODO: Add FDA and UK XML generation
    except Exception as e:
        # Log error but don't fail the request
        print(f"Error generating sequence XMLs: {str(e)}")

    # Commit all changes
    db.commit()
    
    return {"sequence": f"{seq.id:04d}", "region": body.region}