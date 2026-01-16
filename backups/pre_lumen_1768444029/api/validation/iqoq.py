"""
IQ/OQ/PQ Validation Document API

This module provides endpoints for generating and downloading IQ/OQ/PQ validation documents.
"""
from fastapi import APIRouter, Response, Depends, HTTPException
from pathlib import Path
import os
import sys
import logging

# Add path for absolute imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import validation document generator
from utils.iqoq_generator import build_doc

# Create router
router = APIRouter(prefix="/api/validation", tags=["validation"])

# Configure logging
logger = logging.getLogger(__name__)

@router.get("/iqoq", response_class=Response)
async def generate_iqoq():
    """
    Generate and download IQ/OQ/PQ validation document
    
    Returns:
        Response: DOCX file download
    """
    try:
        # Generate the validation document
        path = build_doc()
        
        # Check if file exists
        if not Path(path).exists():
            logger.error(f"Failed to generate IQ/OQ/PQ doc at path: {path}")
            raise HTTPException(status_code=500, detail="Failed to generate IQ/OQ/PQ document")
        
        # Read file data
        data = Path(path).read_bytes()
        
        # Set download headers
        headers = {
            "Content-Disposition": f"attachment; filename=IQOQ_PQ_{Path(path).name}"
        }
        
        # Return file for download
        return Response(
            content=data, 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
            headers=headers
        )
    except Exception as e:
        logger.error(f"Error generating IQ/OQ/PQ document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating document: {str(e)}")