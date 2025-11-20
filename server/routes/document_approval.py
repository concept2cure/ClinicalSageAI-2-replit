"""
Document Approval API with PDF QC Integration

This module provides the API endpoints for document approval workflow,
integrating automatic PDF QC checks to ensure regulatory compliance.
"""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from server.db import SessionLocal
from server.models.sequence import Document
from server.utils.pdf_qc import qc_pdf

# Configure logging
logger = logging.getLogger("doc_approval")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/api/documents", tags=["documents"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/{doc_id}/approve")
async def approve_document(
    doc_id: int, 
    background_tasks: BackgroundTasks,
    skip_qc: Optional[bool] = False,
    db: Session = Depends(get_db)
):
    """
    Approve a document, running PDF QC checks first.
    Only approved documents can be included in IND sequences.
    
    Args:
        doc_id: Document ID to approve
        skip_qc: Optional flag to bypass QC (for non-PDF documents)
        background_tasks: FastAPI background tasks
        db: Database session
        
    Returns:
        Document status information
    """
    # Get document
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Only process draft or rejected documents
    if document.status not in ["draft", "rejected"]:
        raise HTTPException(status_code=400, 
            detail=f"Document in '{document.status}' status cannot be approved")
    
    # If PDF file, perform QC checks
    if document.path.lower().endswith('.pdf') and not skip_qc:
        # Update status to processing
        document.status = "in_review"
        db.commit()
        
        # Run QC process in background
        background_tasks.add_task(run_pdf_qc_and_update, doc_id)
        
        return {
            "id": document.id,
            "title": document.title,
            "status": "in_review",
            "message": "PDF QC process started. Document will be automatically approved if QC passes."
        }
    else:
        # Non-PDF document or skip_qc=True
        document.status = "approved"
        document.qc_status = "skipped" if skip_qc else "n/a"
        document.qc_timestamp = datetime.utcnow()
        db.commit()
        
        return {
            "id": document.id,
            "title": document.title,
            "status": "approved",
            "message": "Document approved" + (" (QC skipped)" if skip_qc else "")
        }

@router.get("/{doc_id}/qc-status")
async def get_qc_status(doc_id: int, db: Session = Depends(get_db)):
    """
    Get the QC status for a document.
    
    Args:
        doc_id: Document ID
        db: Database session
        
    Returns:
        QC status information
    """
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "id": document.id,
        "title": document.title,
        "status": document.status,
        "qc_status": document.qc_status,
        "qc_timestamp": document.qc_timestamp,
        "qc_report_path": document.qc_report_path,
        "qc_pdf_path": document.qc_pdf_path
    }

def run_pdf_qc_and_update(doc_id: int):
    """
    Background task to run PDF QC process on a document.
    Updates document status based on QC results.
    
    Args:
        doc_id: Document ID to process
    """
    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.id == doc_id).first()
        if not document:
            logger.error(f"Document {doc_id} not found for QC processing")
            return
        
        logger.info(f"Starting PDF QC for document {doc_id}: {document.title}")
        
        # Run QC process
        try:
            qc_result = qc_pdf(document.path)
            
            # Update document with QC results
            document.qc_status = qc_result["status"]
            document.qc_report_path = qc_result["output"].replace(".pdf", ".qc.json")
            document.qc_pdf_path = qc_result["output"]
            document.qc_timestamp = datetime.utcnow()
            
            # Update document status based on QC result
            if qc_result["status"] == "passed":
                document.status = "approved"
                logger.info(f"Document {doc_id} QC passed and approved")
            else:
                document.status = "rejected"
                logger.warning(f"Document {doc_id} QC failed: {qc_result['errors']}")
            
            db.commit()
        except Exception as e:
            logger.error(f"QC process failed for document {doc_id}: {str(e)}")
            document.status = "rejected"
            document.qc_status = "error"
            document.qc_timestamp = datetime.utcnow()
            db.commit()
    finally:
        db.close()