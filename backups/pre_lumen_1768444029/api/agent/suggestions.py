"""
Agent Suggestions API

This module provides FastAPI endpoints for generating and retrieving
proactive suggestions from the IND Copilot agent.
"""

import json
import logging
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from agent.core import generate_suggestions
from server.db import SessionLocal

# Configure logger
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class SuggestionAction(BaseModel):
    """
    Action that can be taken on a suggestion
    """
    name: str
    arguments: Dict[str, Any]

class Suggestion(BaseModel):
    """
    A proactive suggestion from the agent
    """
    id: Optional[int] = None
    project_id: int
    text: str
    action: Optional[SuggestionAction] = None
    status: str = "pending"  # pending, accepted, rejected
    created_at: Optional[str] = None

@router.get("/suggestions", response_model=List[Suggestion])
async def get_suggestions(
    project_id: int = Query(..., description="Project ID to get suggestions for"),
    status: Optional[str] = Query(None, description="Filter by status (e.g., 'pending', 'accepted', 'rejected')"),
    limit: int = Query(10, description="Maximum number of suggestions to return")
):
    """
    Get proactive suggestions for a project
    
    Args:
        project_id: Project ID to get suggestions for
        status: Optional status filter
        limit: Maximum number of suggestions to return
        
    Returns:
        List of suggestions
    """
    try:
        # TODO: Implement database storage for suggestions
        # For now, generate suggestions on-demand
        suggestions = await generate_suggestions(project_id)
        
        # Apply status filter if provided
        if status:
            suggestions = [s for s in suggestions if s.get("status", "pending") == status]
        
        # Limit results
        suggestions = suggestions[:limit]
        
        # Format response
        return [
            Suggestion(
                project_id=s.get("project_id", project_id),
                text=s.get("text", ""),
                action=SuggestionAction(
                    name=s.get("action", {}).get("name", ""),
                    arguments=s.get("action", {}).get("arguments", {})
                ) if s.get("action") else None,
                status=s.get("status", "pending"),
                created_at=s.get("created_at")
            )
            for s in suggestions
        ]
    except Exception as e:
        logger.error(f"Error generating suggestions for project {project_id}: {str(e)}")
        raise HTTPException(500, f"Error generating suggestions: {str(e)}")

class UpdateSuggestionRequest(BaseModel):
    """
    Request to update a suggestion's status
    """
    status: str  # accepted, rejected

@router.post("/suggestions/{suggestion_id}/status")
async def update_suggestion_status(
    suggestion_id: int,
    request: UpdateSuggestionRequest,
    project_id: int = Query(..., description="Project ID the suggestion belongs to")
):
    """
    Update a suggestion's status (accept or reject)
    
    Args:
        suggestion_id: Suggestion ID to update
        request: Update request with new status
        project_id: Project ID the suggestion belongs to
        
    Returns:
        Status update confirmation
    """
    # TODO: Implement database storage for suggestions
    # For now, return a mock response
    return {
        "success": True,
        "message": f"Suggestion {suggestion_id} for project {project_id} marked as {request.status}",
    }

@router.post("/suggestions/execute/{suggestion_id}")
async def execute_suggestion(
    suggestion_id: int,
    project_id: int = Query(..., description="Project ID the suggestion belongs to")
):
    """
    Execute a suggested action
    
    Args:
        suggestion_id: Suggestion ID to execute
        project_id: Project ID the suggestion belongs to
        
    Returns:
        Execution results
    """
    # TODO: Implement database storage for suggestions
    # TODO: Implement suggestion execution
    # For now, return a mock response
    return {
        "success": True,
        "message": f"Suggestion {suggestion_id} for project {project_id} executed successfully",
    }

@router.post("/suggestions/generate")
async def trigger_suggestion_generation(
    project_id: int = Query(..., description="Project ID to generate suggestions for")
):
    """
    Manually trigger suggestion generation for a project
    
    Args:
        project_id: Project ID to generate suggestions for
        
    Returns:
        Generation status
    """
    try:
        suggestions = await generate_suggestions(project_id)
        return {
            "success": True,
            "message": f"Generated {len(suggestions)} suggestions for project {project_id}",
            "count": len(suggestions)
        }
    except Exception as e:
        logger.error(f"Error generating suggestions for project {project_id}: {str(e)}")
        raise HTTPException(500, f"Error generating suggestions: {str(e)}")