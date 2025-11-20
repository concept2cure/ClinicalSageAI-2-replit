"""Vector search API for retrieving semantically similar document chunks"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from server.db import get_db
from server.utils.cer_retriever import retrieve_chunks, embed

router = APIRouter()

class SearchQuery(BaseModel):
    """Search query parameters"""
    query: str
    k: int = 5  # Number of results to return
    min_relevance: Optional[float] = None  # Minimum relevance score (0-1)
    filter_sequence_id: Optional[int] = None  # Filter by sequence ID
    filter_document_id: Optional[int] = None  # Filter by document ID

class SearchResult(BaseModel):
    """Search result with chunk content and metadata"""
    content: str
    relevance: float
    document_id: Optional[int] = None
    document_title: Optional[str] = None
    source_page: Optional[int] = None
    source_section: Optional[str] = None

@router.post("/api/search/vector", response_model=List[SearchResult])
async def search_documents(
    search_query: SearchQuery,
    db: Session = Depends(get_db)
):
    """
    Search documents using vector similarity
    
    Returns semantically similar document chunks based on embedding similarity
    """
    try:
        # Basic implementation for now - we'll expand with filters later
        chunks = retrieve_chunks(search_query.query, search_query.k)
        
        # For now, return simple results 
        results = [
            SearchResult(
                content=chunk,
                relevance=0.95,  # Placeholder - we'll calculate actual scores later
                document_id=None,
                document_title="Document Title",  # Placeholder
                source_page=1,  # Placeholder
                source_section="Section"  # Placeholder
            )
            for chunk in chunks
        ]
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))