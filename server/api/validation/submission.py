"""
Submission Validation API

This module provides endpoints for validating eCTD submissions against
region-specific requirements (FDA, EMA, PMDA).
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path, Body

# Import validator manager
from server.utils.validator_manager import validate_submission, validate_document

# Set up logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/validation", tags=["validation"])

@router.post("/submission")
async def validate_ectd_submission(
    request: Dict[str, Any] = Body(..., description="Validation request")
) -> Dict[str, Any]:
    """
    Validate an eCTD submission against region-specific requirements.
    
    Request body:
    {
        "sequence_path": "/path/to/sequence",
        "region": "FDA|EMA|PMDA",
        "options": { ... optional validation options ... }
    }
    
    Returns:
        Dictionary containing validation results
    """
    try:
        # Extract parameters from request
        sequence_path = request.get("sequence_path")
        region = request.get("region", "FDA")
        
        # Validate parameters
        if not sequence_path:
            raise HTTPException(
                status_code=400,
                detail="sequence_path is required"
            )
            
        # Ensure sequence folder exists
        if not os.path.isdir(sequence_path):
            raise HTTPException(
                status_code=404,
                detail=f"Sequence folder not found: {sequence_path}"
            )
            
        # Run validation
        results = validate_submission(sequence_path, region)
        
        # Return results
        return {
            "status": "success",
            "results": results
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error validating submission: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate submission: {str(e)}"
        )

@router.post("/document")
async def validate_document_request(
    request: Dict[str, Any] = Body(..., description="Document validation request")
) -> Dict[str, Any]:
    """
    Validate a single document against region-specific requirements.
    
    Request body:
    {
        "document_path": "/path/to/document.pdf",
        "region": "FDA|EMA|PMDA",
        "doc_type": "optional document type for context-specific validation"
    }
    
    Returns:
        Dictionary containing validation results
    """
    try:
        # Extract parameters from request
        document_path = request.get("document_path")
        region = request.get("region", "FDA")
        doc_type = request.get("doc_type")
        
        # Validate parameters
        if not document_path:
            raise HTTPException(
                status_code=400,
                detail="document_path is required"
            )
            
        # Run validation
        results = validate_document(document_path, region, doc_type)
        
        # Return results
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        logger.error(f"Error validating document: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate document: {str(e)}"
        )