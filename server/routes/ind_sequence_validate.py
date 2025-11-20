"""
Enhanced IND Sequence Validation

This module provides FastAPI routes for comprehensive IND sequence validation, including:
1. DTD validation against XML specifications
2. Full Lorenz eValidator checks
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from server.db import SessionLocal
from server.models.sequence import INDSequence
from server.utils.xml_validator import validate_sequence_xml
from server.utils.evalidator import validate_package
import os

router = APIRouter(prefix="/api/ind", tags=["ind"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/sequence/{seq_id}/validate")
def validate_sequence(seq_id: str, db: Session = Depends(get_db)):
    """
    Comprehensive validation of an IND sequence with both DTD and eValidator checks
    
    Parameters:
    - seq_id: Four-digit sequence identifier (e.g., '0001')
    
    Returns:
    - JSON with combined validation results from DTD and eValidator
    """
    seq = db.query(INDSequence).filter_by(sequence=seq_id).first()
    if not seq:
        raise HTTPException(404, "Sequence not found")

    # Run DTD validation
    dtd_errors = validate_sequence_xml(seq_id)

    # Run eValidator
    seq_dir = os.path.join("/mnt/data/ectd", seq_id)
    try:
        ev = validate_package(seq_dir)
    except Exception as e:
        ev = {"error": str(e), "errors": [], "warnings": []}

    # Determine overall validation status
    status = (
        "passed"
        if not dtd_errors["index"]
        and not dtd_errors["regional"]
        and ev.get("error_count", 0) == 0
        else "failed"
    )

    # Return combined results
    return {
        "sequence": seq_id,
        "status": status,
        "dtd_errors": dtd_errors,
        "evalidator": ev,
    }