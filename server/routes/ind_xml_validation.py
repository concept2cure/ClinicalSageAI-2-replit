"""
IND XML Validation and Acknowledgment Endpoints

This module provides FastAPI routes for:
1. Validating eCTD XML files against DTD specifications
2. Retrieving FDA ESG acknowledgment statuses
3. Performing full Lorenz eValidator validation
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
import os
import sys
from datetime import datetime

# Add the server directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.xml_validator import validate_sequence_xml
from utils.evalidator import validate_package
from server.db import SessionLocal
from server.models.sequence import INDSequence

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/api/ind/sequence/{seq_id}/validate")
def validate_sequence(seq_id: str, region: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Validate a sequence XML files against region-specific DTD specifications
    
    Parameters:
    - seq_id: Sequence identifier
    - region: Optional regulatory authority (FDA, EMA, PMDA, Health Canada)
    
    Returns:
    - JSON with validation results
    """
    seq = db.query(INDSequence).filter_by(sequence=seq_id).first()
    if not seq:
        raise HTTPException(404, "Sequence not found")
    
    # If region is not provided in query param, use sequence region or default to FDA
    target_region = region or seq.region or "FDA"
    
    # Validate XML against DTDs
    dtd_errors = validate_sequence_xml(seq_id)

    # Run eValidator with region-specific profile
    seq_dir = os.path.join("/mnt/data/ectd", seq_id)
    try:
        ev = validate_package(seq_dir, region=target_region)
    except Exception as e:
        ev = {"error": str(e), "errors": [], "warnings": []}

    status = (
        "passed"
        if not dtd_errors["index"]
        and not dtd_errors["regional"]
        and ev.get("error_count", 0) == 0
        else "failed"
    )

    return {
        "sequence": seq_id,
        "region": target_region,
        "status": status,
        "dtd_errors": dtd_errors,
        "evalidator": ev,
        "validation": {
            "valid": status == "passed",
            "index": dtd_errors["index"],
            "regional": dtd_errors["regional"],
            "evalidator_errors": len(ev.get("errors", [])),
            "evalidator_warnings": len(ev.get("warnings", []))
        }
    }
        
@router.get("/api/ind/sequence/{sequence_id}/acks")
async def get_sequence_acks(sequence_id: str):
    """
    Retrieve FDA ESG acknowledgment statuses for a specific sequence.
    
    Parameters:
    - sequence_id: Four-digit sequence identifier (e.g., '0001')
    
    Returns:
    - JSON with ACK file statuses and paths
    """
    try:
        db = SessionLocal()
        sequence = db.query(INDSequence).filter(INDSequence.sequence == sequence_id).first()
        
        if not sequence:
            db.close()
            return JSONResponse(
                status_code=404,
                content={"status": "error", "message": f"Sequence {sequence_id} not found"}
            )
            
        # Format the response with acknowledgment information
        response = {
            "status": "success",
            "sequence_id": sequence_id,
            "submission_status": sequence.status,
            "acknowledgments": {
                "ack1": {
                    "received": sequence.ack1_path is not None,
                    "path": sequence.ack1_path,
                    "timestamp": None
                },
                "ack2": {
                    "received": sequence.ack2_path is not None,
                    "path": sequence.ack2_path,
                    "timestamp": None,
                    "success": sequence.status == "ESG ACK2 Success" if sequence.ack2_path else None
                },
                "ack3": {
                    "received": sequence.ack3_path is not None,
                    "path": sequence.ack3_path,
                    "timestamp": None
                }
            },
            "last_updated": sequence.updated_at.isoformat() if hasattr(sequence, 'updated_at') and sequence.updated_at else None
        }
        
        db.close()
        return response
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Error retrieving acknowledgments: {str(e)}"}
        )