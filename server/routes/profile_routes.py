"""
Submission Profile Routes

This module provides API endpoints for managing regulatory submission profiles
(FDA, EMA, PMDA, Health Canada) for eCTD submissions.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import os

from server.db import SessionLocal
from server.models.submission_profile import SubmissionProfile, RegionalDocumentType

router = APIRouter(prefix="/api/ind", tags=["profiles"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/profiles")
def get_profiles(db: Session = Depends(get_db)):
    """
    Get all available submission profiles.
    
    Returns:
        List of submission profiles with their settings
    """
    profiles = db.query(SubmissionProfile).filter(SubmissionProfile.active == True).all()
    
    return {
        "status": "success",
        "profiles": [
            {
                "id": profile.id,
                "code": profile.code,
                "name": profile.name,
                "dtd_version": profile.dtd_version,
                "settings": profile.settings or {},
            }
            for profile in profiles
        ]
    }

@router.get("/profiles/{profile_id}")
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    """
    Get a specific submission profile by ID.
    
    Args:
        profile_id: Database ID of the profile
        
    Returns:
        Profile details with document types
    """
    profile = db.query(SubmissionProfile).filter(SubmissionProfile.id == profile_id).first()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    # Get regional document types for this profile
    doc_types = db.query(RegionalDocumentType).filter(
        RegionalDocumentType.profile_id == profile_id
    ).all()
    
    return {
        "status": "success",
        "profile": {
            "id": profile.id,
            "code": profile.code,
            "name": profile.name,
            "dtd_version": profile.dtd_version,
            "settings": profile.settings or {},
            "validator_profile": profile.validator_profile,
            "document_types": [
                {
                    "id": dt.id,
                    "code": dt.code,
                    "name": dt.name,
                    "path_template": dt.path_template,
                    "required": dt.required,
                    "description": dt.description,
                }
                for dt in doc_types
            ]
        }
    }

@router.post("/sequence/create_with_profile")
def create_sequence_with_profile(
    request: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Create a new sequence with a specific regulatory profile.
    
    Args:
        request: Dictionary containing:
            - profile_id: ID of the profile to use
            - base: Base sequence number (e.g., "0000")
            - plan: List of document plan entries
            
    Returns:
        Created sequence information
    """
    profile_id = request.get("profile_id")
    base = request.get("base")
    plan = request.get("plan", [])
    
    if not profile_id:
        raise HTTPException(400, "Profile ID is required")
    
    # Get the profile
    profile = db.query(SubmissionProfile).filter(SubmissionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    # Generate next sequence number
    next_seq = str(int(base) + 1).zfill(4) if base and base.isdigit() else "0001"
    
    # Create sequence folder structure
    seq_path = os.path.join("/mnt/data/ectd", next_seq)
    os.makedirs(seq_path, exist_ok=True)
    
    # Create region-specific folder structure based on profile
    module1_path = os.path.join(seq_path, "m1")
    os.makedirs(module1_path, exist_ok=True)
    
    if profile.code == "fda":
        os.makedirs(os.path.join(module1_path, "us"), exist_ok=True)
    elif profile.code == "ema":
        os.makedirs(os.path.join(module1_path, "eu"), exist_ok=True)
    elif profile.code == "pmda":
        os.makedirs(os.path.join(module1_path, "jp"), exist_ok=True)
    elif profile.code == "hc":
        os.makedirs(os.path.join(module1_path, "ca"), exist_ok=True)
    
    # Create standard CTD structure
    for module in ["m2", "m3", "m4", "m5"]:
        os.makedirs(os.path.join(seq_path, module), exist_ok=True)
    
    # TODO: Move sequence creation logic from sequence_routes.py here
    # with profile-specific processing
    
    return {
        "status": "success",
        "sequence": next_seq,
        "profile": {
            "id": profile.id,
            "code": profile.code,
            "name": profile.name
        },
        "path": seq_path
    }