"""
RegIntel API Data Models

This module contains Pydantic models for the RegIntel API.
"""
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class ValidationStatus(str, Enum):
    """
    Status values for validation jobs
    """
    IDLE = "idle"
    VALIDATING = "validating"
    COMPLETED = "completed"
    FAILED = "failed"

class ResultStatus(str, Enum):
    """
    Status values for validation rule checks
    """
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"

class ValidationResultSummary(BaseModel):
    """
    Summary of validation results
    """
    success: int = 0
    warning: int = 0
    error: int = 0

class ValidationRule(BaseModel):
    """
    Individual validation rule result
    """
    id: str
    rule: str
    status: ResultStatus
    message: str
    path: Optional[str] = None
    lineNumber: Optional[int] = None

class ValidationResult(BaseModel):
    """
    Complete validation result
    """
    id: str
    filename: str
    engineId: str
    engineName: str
    timestamp: datetime
    status: ValidationStatus
    validations: List[ValidationRule]
    summary: ValidationResultSummary

class ValidationRequest(BaseModel):
    """
    Request to validate a document
    """
    filename: str
    engineId: str
    tenant_id: Optional[str] = "default"

class ExplanationRequest(BaseModel):
    """
    Request to explain a validation rule
    """
    ruleId: str
    engineId: str

class FixSuggestionRequest(BaseModel):
    """
    Request to get a suggested fix for a failed validation
    """
    validationId: str
    ruleId: str
    documentText: Optional[str] = None

class User(BaseModel):
    """
    User information
    """
    id: int
    username: str
    email: Optional[str] = None
    is_active: bool = True
    tenant_id: str = "default"
    
class TokenData(BaseModel):
    """
    Data contained in a JWT token
    """
    sub: str
    user_id: int
    username: str
    tenant_id: str = "default"
    exp: Optional[int] = None