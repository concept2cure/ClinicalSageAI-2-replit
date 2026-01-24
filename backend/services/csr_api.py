# 🧠 SagePlus | CSR API Server
# Exposes CSR search functionality via a REST API

import os
import json
from typing import Dict, List, Optional, Any, Union

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from pydantic import BaseModel

from csr_search import CSRSearchEngine
from csr_schema import validate_and_normalize_csr
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import protocol improvement API
from server.protocol_improvement_api import router as protocol_router

# Initialize the FastAPI app
app = FastAPI(
    title="SagePlus CSR API",
    description="API for searching and retrieving Clinical Study Report (CSR) data",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include protocol improvement router
app.include_router(protocol_router)

# Initialize the search engine
search_engine = CSRSearchEngine()

# Define API models
class QueryParams(BaseModel):
    query_text: Optional[str] = None
    indication: Optional[str] = None
    phase: Optional[str] = None
    outcome: Optional[str] = None
    min_sample_size: Optional[int] = None
    limit: int = 10

class CSRProtocol(BaseModel):
    title: str
    indication: str
    phase: str
    primary_endpoints: List[str]
    secondary_endpoints: Optional[List[str]] = None
    arms: Optional[List[str]] = None
    sample_size: Optional[int] = None

# API routes
@app.get("/")
async def root():
    """Root endpoint providing API information"""
    return {
        "name": "SagePlus CSR API",
        "version": "1.0.0",
        "description": "API for searching and retrieving Clinical Study Report (CSR) data",
        "endpoints": [
            {"path": "/api/csrs/query", "method": "GET", "description": "Search for CSRs"},
            {"path": "/api/csrs/fast-query", "method": "GET", "description": "Fast in-memory search for CSRs"},
            {"path": "/api/csrs/{csr_id}", "method": "GET", "description": "Get details for a specific CSR"},
            {"path": "/api/csrs/stats", "method": "GET", "description": "Get statistics about the CSR database"},
            {"path": "/api/match-protocol", "method": "POST", "description": "Find similar CSRs to a draft protocol"},
            {"path": "/api/protocol/improve", "method": "POST", "description": "Generate protocol improvement recommendations"},
            {"path": "/api/protocol/save-version", "method": "POST", "description": "Save a protocol version"},
            {"path": "/api/protocol/versions/{protocol_id}", "method": "GET", "description": "Get versions of a protocol"}
        ]
    }

@app.get("/api/csrs/query")
async def query_csrs(
    query_text: Optional[str] = None,
    indication: Optional[str] = None,
    phase: Optional[str] = None,
    outcome: Optional[str] = None,
    min_sample_size: Optional[int] = None,
    limit: int = 10
):
    """Search for CSRs using text query and/or field filters"""
    try:
        results = search_engine.combined_search(
            query_text=query_text,
            indication=indication,
            phase=phase,
            outcome=outcome,
            min_sample_size=min_sample_size,
            limit=limit
        )
        
        return {
            "query": {
                "text": query_text,
                "filters": {
                    "indication": indication,
                    "phase": phase,
                    "outcome": outcome,
                    "min_sample_size": min_sample_size
                }
            },
            "results_count": len(results),
            "csrs": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching CSRs: {str(e)}")
        
@app.get("/api/csrs/fast-query")
async def fast_query_csrs(
    query_text: Optional[str] = None,
    indication: Optional[str] = None,
    phase: Optional[str] = None,
    outcome: Optional[str] = None,
    min_sample_size: Optional[int] = None,
    limit: int = 10
):
    """Fast in-memory search for CSRs using text query and field filters"""
    if not query_text:
        # Fall back to regular search if no query text provided
        return await query_csrs(query_text, indication, phase, outcome, min_sample_size, limit)
        
    try:
        # Construct filter parameters
        filters = {}
        if indication:
            filters["indication"] = indication
        if phase:
            filters["phase"] = phase
        if outcome:
            filters["outcome"] = outcome
        if min_sample_size is not None:
            filters["min_sample_size"] = min_sample_size
            
        # Use fast in-memory search
        results = search_engine.fast_search(
            query_text=query_text,
            limit=limit,
            filters=filters
        )
        
        return {
            "query": {
                "text": query_text,
                "filters": {
                    "indication": indication,
                    "phase": phase,
                    "outcome": outcome,
                    "min_sample_size": min_sample_size
                }
            },
            "search_type": "fast_in_memory",
            "results_count": len(results),
            "csrs": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in fast search: {str(e)}")

@app.get("/api/csrs/stats")
async def get_stats():
    """Get statistics about the CSR database"""
    try:
        stats = search_engine.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving CSR stats: {str(e)}")

@app.get("/api/csrs/{csr_id}")
async def get_csr(csr_id: str):
    """Get details for a specific CSR by ID"""
    try:
        csr_data = search_engine.get_csr_details(csr_id)
        
        if not csr_data:
            raise HTTPException(status_code=404, detail=f"CSR with ID '{csr_id}' not found")
            
        return csr_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving CSR: {str(e)}")

@app.post("/api/match-protocol")
async def match_protocol(protocol: CSRProtocol):
    """Find CSRs similar to a draft protocol"""
    try:
        # Create a text summary of the protocol for similarity search
        protocol_summary = f"""
        {protocol.title}. A {protocol.phase} trial in {protocol.indication}.
        Primary endpoints: {', '.join(protocol.primary_endpoints)}.
        """
        
        if protocol.secondary_endpoints:
            protocol_summary += f" Secondary endpoints: {', '.join(protocol.secondary_endpoints)}."
            
        if protocol.arms:
            protocol_summary += f" Arms: {', '.join(protocol.arms)}."
            
        if protocol.sample_size:
            protocol_summary += f" Sample size: {protocol.sample_size}."
        
        # Find similar CSRs
        similar_csrs = search_engine.search_by_embedding(protocol_summary, limit=10)
        
        # Filter by phase and indication for more relevant matches
        filtered_csrs = []
        for csr in similar_csrs:
            phase_match = protocol.phase.lower() in csr.get('phase', '').lower()
            indication_match = any(word in csr.get('indication', '').lower() 
                                 for word in protocol.indication.lower().split() 
                                 if len(word) > 3)
            
            if phase_match or indication_match:
                filtered_csrs.append(csr)
        
        return {
            "protocol_summary": protocol_summary,
            "similar_csrs_count": len(filtered_csrs),
            "similar_csrs": filtered_csrs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error matching protocol: {str(e)}")

# Main function to run the API server
def main():
    # Preload CSRs into the search engine
    imported = search_engine.import_directory()
    print(f"Imported {imported} CSRs into the search engine")
    
    # Run the server
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()