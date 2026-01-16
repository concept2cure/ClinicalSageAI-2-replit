"""Rule Assistant API for intelligent document guidance

This module provides API endpoints for evaluating document placement
and providing real-time guidance in the submission builder.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session

from server.db import get_db
from server.utils.rule_engine import evaluate_document_placement

router = APIRouter()

class DocumentPlacementRequest(BaseModel):
    """
    Request model for document placement evaluation
    """
    document_id: int
    module_id: str
    document_type: str
    document_title: str
    existing_modules: Optional[List[str]] = None
    region: str = "FDA"

class GuidanceItem(BaseModel):
    """
    Guidance item with rule information and suggestions
    """
    rule: str
    severity: str  # "error", "warning", "info"
    message: str
    suggestion: str

class DocumentPlacementResponse(BaseModel):
    """
    Response model for document placement evaluation
    """
    document_id: int
    module_id: str
    status: str  # "error", "warning", "ok"
    guidance: List[GuidanceItem]

@router.post("/api/guidance/evaluate-placement", response_model=DocumentPlacementResponse)
async def evaluate_placement(
    request: DocumentPlacementRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Evaluate document placement in a submission module
    
    Uses both rule-based checks and AI guidance to provide comprehensive feedback
    """
    try:
        # Basic validation
        if not request.module_id or not request.document_type:
            raise HTTPException(
                status_code=400,
                detail="Module ID and document type are required"
            )
        
        # Get existing modules if not provided
        existing_modules = request.existing_modules or []
        
        # Perform the evaluation
        result = await evaluate_document_placement(
            doc_id=request.document_id,
            module_id=request.module_id,
            doc_type=request.document_type,
            doc_title=request.document_title,
            existing_modules=existing_modules,
            region=request.region
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/guidance/document-drop", response_model=DocumentPlacementResponse)
async def handle_document_drop(
    request: DocumentPlacementRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Handle a document drop event in the submission builder
    
    This endpoint is called when a document is dropped into a module folder
    and provides immediate guidance
    """
    try:
        # Perform the evaluation
        result = await evaluate_document_placement(
            doc_id=request.document_id,
            module_id=request.module_id,
            doc_type=request.document_type,
            doc_title=request.document_title,
            existing_modules=request.existing_modules or [],
            region=request.region
        )
        
        # Save the guidance to the database for later reference
        # This would be implemented in a real application
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))