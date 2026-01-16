"""
Agent API Package

This package contains FastAPI endpoints for the IND Copilot agent,
including chat and suggestions endpoints.
"""

from fastapi import FastAPI

from server.api.agent.chat import router as chat_router
from server.api.agent.suggestions import router as suggestions_router

def register_routes(app: FastAPI):
    """
    Register all agent API routes with the FastAPI application
    
    Args:
        app: FastAPI application instance
    """
    app.include_router(chat_router)
    app.include_router(suggestions_router)