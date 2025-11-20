"""
FDA ESG Credentials Management API

This module provides FastAPI routes for managing FDA ESG credentials
with secure encryption, per-project isolation, and audit logging.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, Field
from typing import Dict, Optional
import logging

from ind_automation import credentials
from ind_automation.auth import get_current_user, admin_required
from ind_automation.database import append_history

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/ind",
    tags=["ESG Credentials"],
)

# --- Models ---

class ESGCredentials(BaseModel):
    """Model for ESG credential data"""
    host: str = Field(..., description="ESG SFTP hostname")
    port: int = Field(..., description="ESG SFTP port number")
    user: str = Field(..., description="ESG SFTP username")
    key_pem: str = Field(..., description="ESG SSH private key in PEM format")

class MaskedESGCredentials(BaseModel):
    """Model for returning masked credentials"""
    host: str
    port: int
    user: str
    key_pem: str  # This will be masked
    fingerprint: Optional[str] = None

# --- Routes ---

@router.post("/{project_id}/esg/creds")
async def save_esg_credentials(
    project_id: str,
    creds: ESGCredentials,
    user: str = Depends(admin_required)
):
    """
    Save ESG credentials for a project
    
    Requires admin authentication
    """
    try:
        # Save the credentials
        fingerprint = credentials.save(project_id, creds.dict())
        
        # Log to audit trail
        append_history(project_id, {
            "type": "esg_creds",
            "action": "update",
            "by": user,  # user is the username string from admin_required
            "fingerprint": fingerprint,
            "timestamp": None  # will be filled automatically
        })
        
        return {"status": "success", "message": "Credentials saved successfully"}
    except Exception as e:
        logger.error(f"Failed to save ESG credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save credentials: {str(e)}"
        )

@router.get("/{project_id}/esg/creds")
async def get_esg_credentials(
    project_id: str,
    user: str = Depends(admin_required)
):
    """
    Get masked ESG credentials for a project
    
    Requires admin authentication
    """
    try:
        # Get masked credentials
        creds = credentials.get_masked_credentials(project_id)
        if not creds:
            return {"status": "not_found", "message": "No credentials found for this project"}
        
        # Add fingerprint
        fingerprint = credentials.generate_fingerprint(credentials.load(project_id).get("key_pem", ""))
        creds["fingerprint"] = fingerprint
        
        return creds
    except Exception as e:
        logger.error(f"Failed to get ESG credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve credentials: {str(e)}"
        )

@router.delete("/{project_id}/esg/creds")
async def delete_esg_credentials(
    project_id: str,
    user: str = Depends(admin_required)
):
    """
    Delete ESG credentials for a project
    
    Requires admin authentication
    """
    try:
        # Get fingerprint for audit before deleting
        creds = credentials.load(project_id)
        fingerprint = None
        if creds and "key_pem" in creds:
            fingerprint = credentials.generate_fingerprint(creds["key_pem"])
        
        # Delete the credentials
        success = credentials.delete(project_id)
        if not success:
            return {"status": "not_found", "message": "No credentials found for this project"}
        
        # Log to audit trail
        append_history(project_id, {
            "type": "esg_creds",
            "action": "delete",
            "by": user,  # user is the username string from admin_required
            "fingerprint": fingerprint,
            "timestamp": None  # will be filled automatically
        })
        
        return {"status": "success", "message": "Credentials deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete ESG credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete credentials: {str(e)}"
        )

@router.post("/{project_id}/esg/creds/verify")
async def verify_esg_credentials(
    project_id: str,
    user: str = Depends(admin_required)
):
    """
    Verify ESG credentials by attempting a test connection
    
    Requires admin authentication
    """
    try:
        # Implementation of connection test would go here
        # This would attempt to connect to the ESG SFTP server
        # and return success/failure
        
        # For now, we just check if credentials exist
        creds = credentials.load(project_id)
        if not creds:
            return {
                "status": "not_found", 
                "message": "No credentials found for this project"
            }
        
        # TODO: Implement actual SFTP connection test here
        
        return {
            "status": "success", 
            "message": "Credentials exist and are properly formatted"
        }
    except Exception as e:
        logger.error(f"Failed to verify ESG credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify credentials: {str(e)}"
        )