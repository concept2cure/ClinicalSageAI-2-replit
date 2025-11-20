"""
FastAPI middleware for request logging and performance monitoring.
Integrates with logging_utils.py to provide consistent logging across the application.
"""

import time
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.routing import APIRoute
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from logging_utils import generate_request_id, log_request, log_response, logger

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for logging FastAPI requests and responses.
    Attaches a unique request ID to each request for tracing.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process a request, log it, and its response
        
        Args:
            request: The incoming request
            call_next: The next middleware or route handler
            
        Returns:
            Response: The response from the next handler
        """
        # Generate a unique ID for request tracing
        request_id = generate_request_id()
        
        # Attach the request_id to the request state for use in route handlers
        request.state.request_id = request_id
        
        # Log the start of the request
        start_time = log_request(
            request_id=request_id,
            method=request.method, 
            path=request.url.path,
            ip=request.client.host if request.client else None
        )
        
        try:
            # Process the request
            response = await call_next(request)
            
            # Modify response to include request ID in headers for client-side tracing
            response.headers["X-Request-ID"] = request_id
            
            # Log the response
            log_response(
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                start_time=start_time
            )
            
            return response
        except Exception as e:
            # Log any unhandled exceptions
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"Request {request_id} - ERROR: {request.method} {request.url.path} - "
                f"Exception: {str(e)} - {duration_ms:.2f}ms"
            )
            raise

def setup_middleware(app: FastAPI) -> None:
    """
    Set up all middleware for the FastAPI application
    
    Args:
        app: The FastAPI application instance
    """
    # Add the request logging middleware
    app.add_middleware(RequestLoggingMiddleware)
    
    # Could add other middleware here as needed
    
    logger.info("FastAPI middleware setup complete")