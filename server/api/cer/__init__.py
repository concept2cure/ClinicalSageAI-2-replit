"""
CER API Package

This package contains FastAPI endpoints for CER (Clinical Evaluation Report) 
functionality including sequence creation and document management.
"""

from fastapi import FastAPI

from server.api.cer.documents import router as documents_router
from server.api.cer.sequence_create import router as sequence_router

def register_routes(app: FastAPI):
    """
    Register all CER API routes with the FastAPI application
    
    Args:
        app: FastAPI application instance
    """
    app.include_router(documents_router)
    app.include_router(sequence_router)