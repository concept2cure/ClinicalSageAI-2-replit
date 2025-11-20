"""
CER Documents API

This module provides FastAPI endpoints for retrieving and filtering documents
suitable for CER (Clinical Evaluation Report) sequences.
"""

from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from sqlalchemy.orm import Session

from server.db import SessionLocal
from server.models.document import Document

router = APIRouter(prefix="/api/cer", tags=["cer"])

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/documents")
def get_cer_documents(
    status: Optional[str] = Query(None, description="Filter by status (e.g., 'approved', 'qc_failed')"),
    module: Optional[str] = Query(None, description="Filter by module (e.g., 'm1', 'm2')"),
    db: Session = Depends(get_db)
):
    """
    Retrieve documents suitable for CER sequences, optionally filtered by status and module
    
    Args:
        status: Optional status filter
        module: Optional module filter
        db: Database session
    
    Returns:
        list: Matching documents
    """
    query = db.query(Document)
    
    # Apply status filter
    if status:
        if status == "approved_or_qc_failed":
            query = query.filter(Document.status.in_(["approved", "qc_failed"]))
        else:
            query = query.filter(Document.status == status)
    
    # Apply module filter
    if module:
        query = query.filter(Document.module.startswith(module))
    
    # Execute query and convert results to dictionaries
    documents = query.all()
    result = []
    
    for doc in documents:
        doc_dict = {
            "id": doc.id,
            "title": doc.title,
            "status": doc.status,
            "module": doc.module or "",
            "author_id": doc.author_id,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
            "approved_at": doc.approved_at.isoformat() if doc.approved_at else None,
        }
        
        # Include QC JSON if available
        if hasattr(doc, "qc_json") and doc.qc_json:
            doc_dict["qc_json"] = doc.qc_json
        
        result.append(doc_dict)
    
    return result