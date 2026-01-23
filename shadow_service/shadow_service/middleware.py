"""FastAPI middleware for enterprise-grade request handling.

Implements Part 11 compliant request context extraction and attribution.
"""

import logging
import time
from typing import Callable, Optional
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .db_enterprise import RequestContext

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware that extracts Part 11 attribution context from headers.
    
    Headers:
    - X-Actor (required for writes): User identity (email/service principal)
    - X-Request-ID (optional): Correlation ID; generated if missing
    - X-Change-Reason (optional): Reason for change (Part 11 documentation)
    - X-Program-ID (optional): Program scope for RLS filtering
    
    The context is stored in request.state.ctx for downstream handlers.
    """
    
    def __init__(
        self,
        app: FastAPI,
        require_actor_in_prod: bool = True,
        exclude_paths: Optional[set[str]] = None,
    ):
        super().__init__(app)
        self.require_actor_in_prod = require_actor_in_prod
        self.exclude_paths = exclude_paths or {
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
        }
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Response],
    ) -> Response:
        # Skip for excluded paths
        if request.url.path in self.exclude_paths:
            return await call_next(request)
        
        # Extract headers (case-insensitive)
        actor = request.headers.get("X-Actor") or request.headers.get("x-actor")
        request_id = (
            request.headers.get("X-Request-ID") or 
            request.headers.get("x-request-id") or
            f"REQ-{uuid4().hex[:12].upper()}"
        )
        reason = request.headers.get("X-Change-Reason") or request.headers.get("x-change-reason")
        program_id = request.headers.get("X-Program-ID") or request.headers.get("x-program-id")
        
        # Store raw values for downstream use
        request.state.actor = actor
        request.state.request_id = request_id
        request.state.reason = reason
        request.state.program_id = program_id
        
        # Create context if actor is available
        if actor:
            request.state.ctx = RequestContext(
                user=actor,
                request_id=request_id,
                reason=reason,
                program_id=program_id,
            )
        else:
            request.state.ctx = None
        
        # Log request with correlation ID
        start_time = time.monotonic()
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"actor={actor or 'anonymous'} program={program_id or 'none'}"
        )
        
        # Call the actual endpoint
        response = await call_next(request)
        
        # Log response with timing
        duration_ms = (time.monotonic() - start_time) * 1000
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"status={response.status_code} duration={duration_ms:.2f}ms"
        )
        
        # Add correlation headers to response
        response.headers["X-Request-ID"] = request_id
        if actor:
            response.headers["X-Actor"] = actor
        
        return response


def get_request_context(request: Request) -> Optional[RequestContext]:
    """Get the RequestContext from the request state.
    
    Returns None if no context is available (e.g., anonymous request).
    
    Usage in endpoints:
        @app.post("/fragments")
        async def create_fragment(request: Request, ...):
            ctx = get_request_context(request)
            if ctx is None:
                raise HTTPException(401, "X-Actor header required")
            ...
    """
    return getattr(request.state, "ctx", None)


def require_request_context(request: Request) -> RequestContext:
    """Get RequestContext or raise an error if not available.
    
    Use this for endpoints that require attribution (writes).
    
    Usage:
        @app.post("/fragments")
        async def create_fragment(request: Request, ...):
            ctx = require_request_context(request)
            ...
    """
    ctx = get_request_context(request)
    if ctx is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=401,
            detail="X-Actor header required for this operation"
        )
    return ctx


def get_actor(request: Request) -> Optional[str]:
    """Get the actor (user identity) from the request."""
    return getattr(request.state, "actor", None)


def get_request_id(request: Request) -> str:
    """Get the request ID (always available, generated if not provided)."""
    return getattr(request.state, "request_id", f"REQ-{uuid4().hex[:12].upper()}")


def get_program_id(request: Request) -> Optional[str]:
    """Get the program ID for RLS filtering."""
    return getattr(request.state, "program_id", None)


def get_change_reason(request: Request) -> Optional[str]:
    """Get the change reason (Part 11 documentation)."""
    return getattr(request.state, "reason", None)
