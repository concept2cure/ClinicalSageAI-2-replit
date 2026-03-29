"""
backend/dependencies.py

Common dependencies for authentication and authorization in the TrialSage API.
This module provides the common dependency functions to secure API endpoints.
"""

from fastapi import Depends, HTTPException, status, Header
from typing import Optional
from pydantic import BaseModel
import jwt
import os
from datetime import datetime

# JWT secret key from environment variable
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"



def _allow_dev_auth_bypass() -> bool:
    """Allow bypass only in explicitly opted-in local development."""
    env = (os.environ.get("ENVIRONMENT") or "").lower()
    bypass = (os.environ.get("ALLOW_DEV_AUTH_BYPASS") or "").lower()
    return env == "development" and bypass in {"1", "true", "yes", "on"}

class User(BaseModel):
    """User model derived from JWT claims."""
    id: int
    username: str
    email: str
    tenant_id: str
    role: str
    exp: Optional[datetime] = None

async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    """
    Extract and validate the JWT token from the Authorization header.
    This is used as a dependency for protected endpoints.
    
    Args:
        authorization: The Authorization header containing the JWT token
        
    Returns:
        User: The authenticated user extracted from the token
        
    Raises:
        HTTPException: If the token is invalid or missing
    """
    if not authorization:
        # During development, allow a default test token for easier testing
        if _allow_dev_auth_bypass():
            return User(
                id=1,
                username="trialsage_test",
                email="test@trialsage.ai",
                tenant_id="test_tenant",
                role="admin",
                exp=datetime.now().timestamp() + 3600
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract token from "Bearer {token}" format
    if not authorization.startswith("Bearer "):
        # Reject non-Bearer authorization schemes
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = authorization.replace("Bearer ", "")

    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret is not configured",
        )

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = User(**payload)
        
        # Ensure token is not expired
        if user.exp and datetime.now().timestamp() > user.exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return user
    except jwt.PyJWTError:
        # During development, allow some pre-defined tokens
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )