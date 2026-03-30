"""
backend/dependencies.py

Common dependencies for authentication and authorization in the TrialSage API.
This module provides the common dependency functions to secure API endpoints.
"""

from fastapi import Depends, HTTPException, status, Header
from typing import Optional, Union
from pydantic import BaseModel
import jwt
import os
from datetime import datetime

# JWT secret key from environment variable (required in all deployed environments)
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required and must be configured before startup")
JWT_ALGORITHM = "HS256"

class User(BaseModel):
    """User model derived from JWT claims."""
    id: int
    username: str
    email: str
    tenant_id: str
    role: str
    exp: Optional[Union[datetime, int, float]] = None

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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract token from "Bearer {token}" format
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication scheme",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = User(**payload)
        
        # Ensure token is not expired
        if user.exp:
            now_ts = datetime.now().timestamp()
            exp_ts = user.exp.timestamp() if isinstance(user.exp, datetime) else float(user.exp)
            if now_ts > exp_ts:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has expired",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
        return user
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
