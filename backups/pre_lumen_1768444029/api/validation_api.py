"""
Validation API for TrialSage™

This module provides the API endpoints for validating regulatory submissions
against FDA, EMA, and PMDA requirements.
"""

import os
import json
import logging
import asyncio
import tempfile
from typing import Dict, List, Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from server.models.document import Document
from utils.event_bus import publish
from validators.jp_validator import validate_pmda_submission

# Import validators for different regions
try:
    from validators.fda_validator import validate_fda_submission
    from validators.ema_validator import validate_ema_validator
except ImportError:
    # Fallback functions if specific validators not available
    def validate_fda_submission(*args, **kwargs):
        return {"status": "error", "message": "FDA validator not available"}
    
    def validate_ema_validator(*args, **kwargs):
        return {"status": "error", "message": "EMA validator not available"}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create API router
validation_router = APIRouter(prefix="/api/validation", tags=["validation"])

# Request models
class ValidationRequest(BaseModel):
    region: str
    documents: List[int]
    options: Optional[Dict[str, Any]] = {}

class BulkValidationRequest(BaseModel):
    ids: List[int]
    region: Optional[str] = "FDA"

# Get database session
def get_db():
    from server.db import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Background validation task
async def run_validation(region: str, doc_ids: List[int], db: Session, options: Dict[str, Any] = {}):
    """Run validation in background and publish results"""
    logger.info(f"Starting {region} validation for {len(doc_ids)} documents")
    
    try:
        # Get document metadata
        docs = []
        for doc_id in doc_ids:
            doc = db.query(Document).filter_by(id=doc_id).first()
            if doc:
                docs.append({
                    "id": doc.id,
                    "path": doc.path,
                    "module": doc.module,
                    "title": doc.title,
                    "metadata": doc.metadata,
                    "jp_specific": doc.jp_specific if hasattr(doc, 'jp_specific') else None,
                    "jp_ctd_compliant": doc.jp_ctd_compliant if hasattr(doc, 'jp_ctd_compliant') else None
                })
            else:
                logger.warning(f"Document with ID {doc_id} not found")
                # Publish failed validation for missing doc
                publish('qc', {'id': doc_id, 'status': 'qc_failed'})
        
        # Skip if no valid documents
        if not docs:
            logger.error("No valid documents found for validation")
            return
        
        # Create temporary directory for validation
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Select appropriate validator
            if region.upper() == "PMDA":
                results = validate_pmda_submission(docs, tmp_dir)
            elif region.upper() == "EMA":
                results = validate_ema_validator(docs, tmp_dir)
            else:
                # Default to FDA
                results = validate_fda_submission(docs, tmp_dir)
            
            # Process results
            logger.info(f"Validation completed with status: {results.get('overall_status')}")
            
            # Update documents in database with validation results
            for doc_id, result in results.get('document_results', {}).items():
                doc = db.query(Document).filter_by(id=int(doc_id)).first()
                if doc:
                    doc.qc_json = result
                    doc.status = result.get('status')
                    doc.validated_at = datetime.now()
                    db.add(doc)
            
            db.commit()
            
            # Store validation report
            report_path = os.path.join('validation_reports', f"{region.lower()}_{datetime.now().strftime('%Y%m%d%H%M%S')}.json")
            os.makedirs(os.path.dirname(report_path), exist_ok=True)
            with open(report_path, 'w') as f:
                json.dump(results, f, indent=2)
            
            # Publish final status update
            publish('validation_complete', {
                'region': region,
                'status': results.get('overall_status'),
                'report_path': report_path
            })
    
    except Exception as e:
        logger.error(f"Error during {region} validation: {str(e)}")
        # Publish error status
        for doc_id in doc_ids:
            publish('qc', {'id': doc_id, 'status': 'error', 'message': str(e)})

# Validation API endpoints
@validation_router.post("/validate")
async def validate_submission(
    request: ValidationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Validate a submission against regional requirements
    
    Args:
        request: Validation request containing region and document IDs
        background_tasks: FastAPI background tasks
        db: Database session
    
    Returns:
        Validation job information
    """
    try:
        region = request.region.upper()
        if region not in ["FDA", "EMA", "PMDA"]:
            return JSONResponse(
                status_code=400,
                content={"error": f"Unsupported region: {region}"}
            )
        
        # Schedule validation in background
        background_tasks.add_task(
            run_validation,
            region,
            request.documents,
            db,
            request.options
        )
        
        # Return job information
        job_id = f"{region.lower()}_validation_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return {
            "job_id": job_id,
            "status": "scheduled",
            "document_count": len(request.documents),
            "region": region
        }
        
    except Exception as e:
        logger.error(f"Error scheduling validation: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to schedule validation: {str(e)}"}
        )

@validation_router.post("/bulk-validate")
async def bulk_validate(
    request: BulkValidationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Validate multiple documents in bulk
    
    Args:
        request: Bulk validation request containing document IDs
        background_tasks: FastAPI background tasks
        db: Database session
    
    Returns:
        Validation job information
    """
    try:
        region = request.region.upper()
        if region not in ["FDA", "EMA", "PMDA"]:
            return JSONResponse(
                status_code=400,
                content={"error": f"Unsupported region: {region}"}
            )
        
        # Schedule validation in background
        background_tasks.add_task(
            run_validation,
            region,
            request.ids,
            db,
            {}
        )
        
        # Return job information
        job_id = f"{region.lower()}_bulk_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return {
            "job_id": job_id,
            "status": "scheduled",
            "document_count": len(request.ids),
            "region": region
        }
        
    except Exception as e:
        logger.error(f"Error scheduling bulk validation: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to schedule bulk validation: {str(e)}"}
        )

@validation_router.post("/upload-and-validate")
async def upload_and_validate(
    file: UploadFile = File(...),
    region: str = Form(...),
    module: str = Form(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """
    Upload a document and validate it
    
    Args:
        file: The file to upload
        region: Regulatory region (FDA, EMA, PMDA)
        module: CTD module for the document
        background_tasks: FastAPI background tasks
        db: Database session
    
    Returns:
        Document and validation information
    """
    try:
        region = region.upper()
        if region not in ["FDA", "EMA", "PMDA"]:
            return JSONResponse(
                status_code=400,
                content={"error": f"Unsupported region: {region}"}
            )
        
        # Create uploads directory if it doesn't exist
        upload_dir = os.path.join("uploads", module.split('/')[0])
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save the file
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Create document record
        new_doc = Document(
            title=file.filename,
            path=file_path,
            module=module,
            status="pending",
            created_at=datetime.now()
        )
        db.add(new_doc)
        db.flush()
        
        # Get the new document ID
        doc_id = new_doc.id
        
        # Schedule validation in background
        if background_tasks:
            background_tasks.add_task(
                run_validation,
                region,
                [doc_id],
                db,
                {}
            )
        
        db.commit()
        
        # Return document information
        return {
            "document_id": doc_id,
            "filename": file.filename,
            "module": module,
            "validation": {
                "status": "scheduled",
                "region": region
            }
        }
        
    except Exception as e:
        logger.error(f"Error uploading and validating document: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to upload and validate document: {str(e)}"}
        )

@validation_router.get("/status/{job_id}")
async def get_validation_status(job_id: str):
    """
    Get the status of a validation job
    
    Args:
        job_id: The validation job ID
    
    Returns:
        Validation job status
    """
    try:
        # Extract region from job ID
        region = job_id.split('_')[0].upper()
        
        # Check if validation report exists
        report_dir = 'validation_reports'
        report_files = [f for f in os.listdir(report_dir) if f.startswith(f"{region.lower()}_")]
        
        if not report_files:
            return {
                "job_id": job_id,
                "status": "pending",
                "message": "Validation in progress"
            }
        
        # Find most recent report
        report_files.sort(reverse=True)
        report_path = os.path.join(report_dir, report_files[0])
        
        # Load report
        with open(report_path, 'r') as f:
            report = json.load(f)
        
        # Return status information
        return {
            "job_id": job_id,
            "status": "completed",
            "result": report.get("overall_status"),
            "report_path": report_path,
            "validation_time": report.get("validation_time")
        }
        
    except Exception as e:
        logger.error(f"Error getting validation status: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get validation status: {str(e)}"}
        )