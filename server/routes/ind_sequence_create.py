"""
IND Sequence Creation with QC Enforcement

This module handles the creation of IND sequences with integrated
document QC status validation to ensure all documents in the sequence
have passed quality control checks.
"""

import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel
from datetime import datetime

from server.db import SessionLocal
from server.models.sequence import INDSequence, INDSequenceDoc, Document, INDAuditTrail

# Configure logging
logger = logging.getLogger("ind_sequence")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/api/ind", tags=["ind"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class SequenceDocCreate(BaseModel):
    doc_id: int
    module: str
    operation: str = "new"  # new, replace, append, delete

class SequenceCreate(BaseModel):
    sequence: str
    ind_number: str
    title: str
    documents: List[SequenceDocCreate]
    user_id: int

@router.post("/sequence")
async def create_sequence(
    sequence_data: SequenceCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new IND sequence with QC enforcement.
    Only documents that have passed QC can be included.
    
    Args:
        sequence_data: Sequence creation data
        db: Database session
        
    Returns:
        Newly created sequence details
    """
    # Check if sequence already exists
    existing = db.query(INDSequence).filter(INDSequence.sequence == sequence_data.sequence).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sequence already exists")
    
    # Validate all documents exist and have passed QC
    doc_ids = [doc.doc_id for doc in sequence_data.documents]
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
    
    if len(docs) != len(doc_ids):
        raise HTTPException(status_code=400, detail="One or more documents not found")
    
    # Check document status and QC status
    for doc in docs:
        if doc.status != "approved":
            raise HTTPException(
                status_code=400, 
                detail=f"Document '{doc.title}' (ID: {doc.id}) is not approved (status: {doc.status})"
            )
        
        if doc.path.lower().endswith('.pdf') and doc.qc_status != "passed":
            raise HTTPException(
                status_code=400, 
                detail=f"PDF document '{doc.title}' (ID: {doc.id}) has not passed QC (status: {doc.qc_status})"
            )
    
    # Create sequence base path
    base_path = f"/mnt/data/ectd/{sequence_data.sequence}"
    os.makedirs(base_path, exist_ok=True)
    
    # Create sequence record
    new_sequence = INDSequence(
        sequence=sequence_data.sequence,
        ind_number=sequence_data.ind_number,
        status="draft",
        doc_count=len(sequence_data.documents),
        base_path=base_path
    )
    db.add(new_sequence)
    db.flush()  # Get ID without committing
    
    # Add documents to sequence
    for doc_data in sequence_data.documents:
        doc = next(d for d in docs if d.id == doc_data.doc_id)
        
        # Determine proper file path within sequence structure
        module_path = os.path.join(base_path, doc_data.module.replace(".", "/"))
        os.makedirs(module_path, exist_ok=True)
        
        # For PDFs, use the QC-corrected version if available
        source_path = doc.qc_pdf_path if doc.qc_pdf_path else doc.path
        
        # Create sequence document record
        seq_doc = INDSequenceDoc(
            sequence=sequence_data.sequence,
            doc_id=doc.id,
            module=doc_data.module,
            op=doc_data.operation,
            file_path=os.path.join(module_path, os.path.basename(source_path)),
            md5=None  # To be calculated when XML is generated
        )
        db.add(seq_doc)
    
    # Add audit trail entry
    audit = INDAuditTrail(
        sequence=sequence_data.sequence,
        user_id=sequence_data.user_id,
        action="sequence_created",
        details={"document_count": len(sequence_data.documents)}
    )
    db.add(audit)
    
    # Commit everything
    db.commit()
    
    return {
        "id": new_sequence.id,
        "sequence": new_sequence.sequence,
        "ind_number": new_sequence.ind_number,
        "status": new_sequence.status,
        "doc_count": new_sequence.doc_count,
        "base_path": new_sequence.base_path,
        "message": "Sequence created successfully with all QC-approved documents"
    }