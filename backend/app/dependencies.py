"""
API Dependencies Module

This module provides dependency injection for the RegIntel API,
including JWT token authentication.
"""
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from datetime import datetime, timedelta
from backend.app.config import settings
from backend.app.models import TokenData, User

# Configure security scheme for Swagger UI
security = HTTPBearer(
    scheme_name="JWT Authentication",
    description="Enter JWT token",
    auto_error=True
)

async def get_token_data(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    """
    Extract and validate JWT token from Authorization header.
    
    Args:
        credentials: HTTP Authorization credentials
        
    Returns:
        TokenData: Decoded token data
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        
        # Create token data from payload
        token_data = TokenData(
            sub=payload.get("sub"),
            user_id=payload.get("user_id"),
            username=payload.get("username"),
            tenant_id=payload.get("tenant_id", "default"),
            exp=payload.get("exp")
        )
        
        # Check if token has expired
        if token_data.exp and datetime.fromtimestamp(token_data.exp) < datetime.now():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return token_data
    
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(token_data: TokenData = Depends(get_token_data)) -> User:
    """
    Get the current authenticated user from token data.
    
    In a real application, this would query the database for the user.
    For this example, we're creating a User object directly from token data.
    
    Args:
        token_data: Decoded token data
        
    Returns:
        User: Current authenticated user
    """
    # In a real app, lookup user in database
    # This is a simplified example that creates a user from token data
    return User(
        id=token_data.user_id,
        username=token_data.username,
        tenant_id=token_data.tenant_id
    )

def create_access_token(
    user_id: int,
    username: str,
    tenant_id: str = "default",
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a new JWT access token.
    
    Args:
        user_id: User ID
        username: Username
        tenant_id: Tenant ID for multi-tenancy
        expires_delta: Token expiration time
        
    Returns:
        str: Signed JWT token
    """
    to_encode = {
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "tenant_id": tenant_id
    }
    
    # Set expiration
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire.timestamp()})
    
    # Create and sign token
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return encoded_jwt