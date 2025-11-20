#!/usr/bin/env python3
"""
Protocol Correction API
-----------------------
FastAPI endpoint to serve protocol correction suggestions
based on CSR alignment discrepancies.
"""

import os
import json
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from correction_engine import engine as correction_engine

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SuggestionResponse(BaseModel):
    session_id: str
    suggestions: List[Dict[str, Any]]
    suggestion_count: int
    source_alignment_score: Optional[float] = None
    error: Optional[str] = None

@app.get("/api/insights/suggested-corrections/{session_id}", response_model=SuggestionResponse)
def suggest_corrections(session_id: str):
    """
    Generate correction suggestions based on alignment score report.
    
    Args:
        session_id: Session ID for retrieving the alignment report
        
    Returns:
        JSON object containing suggestions
    """
    try:
        # Check if alignment report exists
        archive_dir = f"/mnt/data/lumen_reports_backend/sessions/{session_id}"
        alignment_path = os.path.join(archive_dir, "alignment_score_report.json")
        
        if not os.path.exists(alignment_path):
            return SuggestionResponse(
                session_id=session_id,
                suggestions=[],
                suggestion_count=0,
                error="No alignment report found."
            )
            
        # Use the correction engine to generate suggestions
        suggestions_data = correction_engine.generate_suggestions(session_id)
        
        # Format the response
        return SuggestionResponse(
            session_id=session_id,
            suggestions=suggestions_data.get("suggestions", []),
            suggestion_count=len(suggestions_data.get("suggestions", [])),
            source_alignment_score=suggestions_data.get("source_alignment_score", 0),
            error=suggestions_data.get("error")
        )
        
    except Exception as e:
        return SuggestionResponse(
            session_id=session_id,
            suggestions=[],
            suggestion_count=0,
            error=str(e)
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)