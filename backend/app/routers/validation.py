"""
Validation Router

This module handles document validation requests.
"""
import os
import uuid
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, status
from fastapi.responses import JSONResponse
import shutil
from datetime import datetime

from backend.app.models import ValidationResult, ValidationRequest, ValidationStatus, ValidationRule, ValidationResultSummary, ResultStatus
from backend.app.dependencies import get_current_user
from backend.app.config import settings
from backend.app.models import User

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Define supported validation engines
VALIDATION_ENGINES = {
    "regintel-protocol": {
        "id": "regintel-protocol",
        "name": "Protocol Validator",
        "description": "Validates clinical protocol documents",
        "fileTypes": ["pdf", "docx"]
    },
    "regintel-csr": {
        "id": "regintel-csr", 
        "name": "CSR Validator",
        "description": "Validates Clinical Study Report documents",
        "fileTypes": ["pdf", "docx"]
    },
    "regintel-define": {
        "id": "regintel-define",
        "name": "Define.xml Validator",
        "description": "Validates Define.xml files for CDISC compliance",
        "fileTypes": ["xml"]
    }
}

@router.get("/engines", response_model=List[dict])
async def get_validation_engines(current_user: User = Depends(get_current_user)):
    """
    Get available validation engines.
    """
    return list(VALIDATION_ENGINES.values())

@router.post("/file", status_code=status.HTTP_202_ACCEPTED)
async def validate_file(
    file: UploadFile = File(...),
    engine_id: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload and validate a document.
    """
    # Validate engine exists
    if engine_id not in VALIDATION_ENGINES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation engine '{engine_id}' not found"
        )
        
    # Validate file extension
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in VALIDATION_ENGINES[engine_id]["fileTypes"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{file_ext}'. Supported types: {VALIDATION_ENGINES[engine_id]['fileTypes']}"
        )
        
    # Generate a validation ID
    validation_id = str(uuid.uuid4())
    
    # Save file to upload directory
    tenant_dir = os.path.join(settings.UPLOAD_DIR, current_user.tenant_id)
    os.makedirs(tenant_dir, exist_ok=True)
    
    file_path = os.path.join(tenant_dir, f"{validation_id}_{file.filename}")
    
    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        logger.error(f"Failed to save file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file"
        )
    finally:
        file.file.close()
        
    # Create initial validation result
    result = ValidationResult(
        id=validation_id,
        filename=file.filename,
        engineId=engine_id,
        engineName=VALIDATION_ENGINES[engine_id]["name"],
        timestamp=datetime.now(),
        status=ValidationStatus.VALIDATING,
        validations=[],
        summary=ValidationResultSummary()
    )
    
    # Create validation results directory for tenant
    tenant_results_dir = os.path.join(settings.VALIDATION_LOGS_DIR, current_user.tenant_id)
    os.makedirs(tenant_results_dir, exist_ok=True)
    
    # Save initial validation result
    result_path = os.path.join(tenant_results_dir, f"{validation_id}.json")
    
    with open(result_path, "w") as f:
        f.write(result.json())
        
    # In a real implementation, we would start a background task to run the validation
    # For this example, we're simulating a successful validation synchronously
    
    # Return validation ID
    return {"id": validation_id, "status": "validating"}

@router.get("/status/{validation_id}", response_model=ValidationResult)
async def get_validation_status(
    validation_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get the status of a validation.
    """
    # Build path to validation result file
    tenant_results_dir = os.path.join(settings.VALIDATION_LOGS_DIR, current_user.tenant_id)
    result_path = os.path.join(tenant_results_dir, f"{validation_id}.json")
    
    # Check if validation exists
    if not os.path.exists(result_path):
        # Check in default directory as well (for shared test validations)
        default_path = os.path.join(settings.VALIDATION_LOGS_DIR, f"{validation_id}.json")
        if os.path.exists(default_path):
            result_path = default_path
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Validation '{validation_id}' not found"
            )
            
    # Read validation result
    try:
        with open(result_path, "r") as f:
            result_data = json.load(f)
        
        # Convert to ValidationResult model
        result = ValidationResult(**result_data)
        
        # If status is still "validating", check if results have been updated
        # In a real application, this would check a database or task queue
        # For this example, we'll simulate completion after a short time
        if result.status == ValidationStatus.VALIDATING:
            # Set to "completed" with sample results
            result.status = ValidationStatus.COMPLETED
            result.validations = [
                ValidationRule(
                    id="REG001",
                    rule="Document structure validation",
                    status=ResultStatus.SUCCESS,
                    message="Document structure meets requirements"
                ),
                ValidationRule(
                    id="REG002",
                    rule="Regulatory header verification",
                    status=ResultStatus.SUCCESS,
                    message="Headers contain required information"
                ),
                ValidationRule(
                    id="REG003",
                    rule="Section completeness check",
                    status=ResultStatus.SUCCESS,
                    message="All required sections present"
                ),
                ValidationRule(
                    id="REG004",
                    rule="Format consistency validation",
                    status=ResultStatus.WARNING,
                    message="Inconsistent formatting detected in section 3.2"
                ),
                ValidationRule(
                    id="REG005",
                    rule="Cross-reference validation",
                    status=ResultStatus.ERROR,
                    message="Missing cross-references in section 4.1",
                    path="Section 4.1",
                    lineNumber=42
                ),
                ValidationRule(
                    id="PDF001",
                    rule="PDF/A compliance check",
                    status=ResultStatus.WARNING,
                    message="Document is not PDF/A compliant"
                )
            ]
            result.summary = ValidationResultSummary(
                success=3,
                warning=2,
                error=1
            )
            
            # Save updated result
            with open(result_path, "w") as f:
                f.write(result.json())
                
        return result
        
    except Exception as e:
        logger.error(f"Failed to get validation status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get validation status"
        )