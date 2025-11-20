#!/usr/bin/env python
"""
ICH Wiz Agent

This module provides the ICH Wiz agent API that serves as a Digital 
Compliance Coach with comprehensive regulatory knowledge about ICH guidelines.
"""
import json
import os
import sys
import time
from typing import Dict, List, Optional, Any, Union

import openai
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import structlog

from services.ich_wiz.config import settings
from services.ich_wiz.indexer import PineconeIndexer
from services.metrics import API_REQUESTS, API_LATENCY, OPENAI_REQUESTS, time_and_count

# Initialize structured logging
logger = structlog.get_logger(__name__)

# Initialize the indexer
indexer = PineconeIndexer(
    api_key=settings.PINECONE_API_KEY,
    environment=settings.PINECONE_ENVIRONMENT,
    index_name=settings.PINECONE_INDEX_NAME,
)

# Set up the API key authorization
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def get_api_key(api_key: str = Depends(api_key_header)):
    """
    Validate the API key if provided. If not provided, allow access
    if API key validation is disabled.
    """
    if settings.API_KEY_REQUIRED and api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

# Define API request and response models
class QueryRequest(BaseModel):
    """Request model for ICH Wiz queries."""
    query: str
    source: Optional[str] = "general"
    context: Optional[Dict[str, Any]] = {}
    max_results: Optional[int] = 5

class Citation(BaseModel):
    """Model for a source citation."""
    source: str
    text: str
    relevance: float

class Task(BaseModel):
    """Model for a suggested task."""
    task: str
    priority: str
    rationale: str

class QueryResponse(BaseModel):
    """Response model for ICH Wiz queries."""
    query: str
    answer: str
    citations: List[Citation]
    tasks: List[Task]
    processing_time: float
    source: str

# System prompts
GENERAL_SYSTEM_PROMPT = """
You are ICH Wiz, a specialized digital ICH guidelines assistant that helps pharmaceutical 
and biotech professionals navigate International Council for Harmonisation (ICH) guidelines. 
You provide expertise on regulatory compliance requirements and best practices.

When responding:
1. Be clear, precise, and authoritative on ICH guidelines
2. Always cite specific ICH guideline references when possible (e.g., "According to ICH E6(R2), section 4.2.1...")
3. Structure your response with relevant headings if appropriate
4. Provide actionable insights tailored to the query context
5. Flag important compliance considerations or potential pitfalls

You should focus exclusively on ICH guidelines and regulatory compliance topics.
If the question is outside your knowledge domain, politely redirect the user to appropriate resources.
"""

CITATION_ANALYSIS_PROMPT = """
Analyze the following context information retrieved from regulatory documents and identify the most relevant 
citations to answer the user's query. Format your response as a JSON object with the structure:
{
  "citations": [
    {
      "source": "source document name",
      "text": "extracted citation text",
      "relevance": 0.95 // relevance score from 0 to 1
    },
    ...
  ]
}

Order citations by relevance, with the most relevant first.
Return a maximum of 5 citations that directly address the query.
Ensure the extracted citation text is comprehensive enough to be useful on its own.

User Query: {query}

Context Information:
{context}
"""

TASK_GENERATION_PROMPT = """
Based on the user's query and the provided response about ICH guidelines, generate a list of actionable tasks 
that would help ensure compliance or implement the guidance effectively. Format your response as a JSON object 
with the structure:
{
  "tasks": [
    {
      "task": "clear, specific action item",
      "priority": "high/medium/low",
      "rationale": "brief explanation of why this task is important"
    },
    ...
  ]
}

Focus on practical, specific tasks that directly relate to implementing or complying with the ICH guidelines 
mentioned in the response. Return a maximum of 3 tasks, prioritized by importance.

User Query: {query}

Response: {response}
"""

def generate_system_prompt(source: str, context: Dict[str, Any]) -> str:
    """
    Generate a system prompt based on the source and context.
    
    Args:
        source: The source of the query (e.g., 'general', 'protocol', 'submission')
        context: Additional context information
        
    Returns:
        str: The system prompt to use for the query
    """
    if source == "protocol":
        return f"""
        {GENERAL_SYSTEM_PROMPT}
        
        You are currently assisting with a clinical trial protocol review. Provide 
        specific guidance on protocol design, methodology, endpoint selection, and 
        compliance with ICH E6(R2) Good Clinical Practice requirements.
        
        Protocol Information:
        - Indication: {context.get('indication', 'Not specified')}
        - Phase: {context.get('phase', 'Not specified')}
        - Population: {context.get('population', 'Not specified')}
        """
    elif source == "submission":
        return f"""
        {GENERAL_SYSTEM_PROMPT}
        
        You are currently assisting with regulatory submission preparation. Provide 
        specific guidance on eCTD requirements, document formatting, and compliance 
        with ICH M4 and regional submission guidelines.
        
        Submission Information:
        - Submission Type: {context.get('submission_type', 'Not specified')}
        - Target Regions: {context.get('regions', 'Not specified')}
        - Document Type: {context.get('document_type', 'Not specified')}
        """
    elif source == "cmc":
        return f"""
        {GENERAL_SYSTEM_PROMPT}
        
        You are currently assisting with Chemistry, Manufacturing, and Controls (CMC) 
        documentation. Provide specific guidance on ICH Q8-Q12 implementation, quality 
        risk management, and pharmaceutical development best practices.
        
        Product Information:
        - Product Type: {context.get('product_type', 'Not specified')}
        - Manufacturing Process: {context.get('process', 'Not specified')}
        - Dosage Form: {context.get('dosage_form', 'Not specified')}
        """
    else:  # general
        return GENERAL_SYSTEM_PROMPT

def search_similar_documents(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Search for similar documents to the query.
    
    Args:
        query: The query string
        top_k: Number of results to return
        
    Returns:
        List of document dictionaries with source, text, and score
    """
    try:
        with time_and_count(OPENAI_REQUESTS):
            # Generate embedding for the query
            results = indexer.search_similar(query, top_k=top_k)
            
            # Format the results
            documents = []
            for match in results:
                metadata = match.get("metadata", {})
                documents.append({
                    "source": metadata.get("source", "Unknown Source"),
                    "text": metadata.get("text", ""),
                    "score": match.get("score", 0.0)
                })
                
            return documents
    except Exception as e:
        logger.error("Error searching similar documents", error=str(e))
        return []

def get_relevant_citations(query: str, documents: List[Dict[str, Any]]) -> List[Citation]:
    """
    Extract relevant citations from the retrieved documents.
    
    Args:
        query: The original query
        documents: List of retrieved documents
        
    Returns:
        List of Citation objects
    """
    if not documents:
        return []
        
    try:
        # Format the context information
        context = ""
        for i, doc in enumerate(documents, 1):
            context += f"Document {i} (Source: {doc['source']}):\n{doc['text']}\n\n"
            
        # Use OpenAI to extract and format citations
        with time_and_count(OPENAI_REQUESTS):
            response = openai.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts and analyzes citations."},
                    {"role": "user", "content": CITATION_ANALYSIS_PROMPT.format(
                        query=query,
                        context=context
                    )}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            
        # Parse the JSON response
        content = response.choices[0].message.content
        result = json.loads(content)
        citations = [
            Citation(
                source=citation["source"],
                text=citation["text"],
                relevance=citation["relevance"]
            )
            for citation in result.get("citations", [])
        ]
        
        return citations
    except Exception as e:
        logger.error("Error getting relevant citations", error=str(e))
        return []

def generate_tasks(query: str, response: str) -> List[Task]:
    """
    Generate actionable tasks based on the query and response.
    
    Args:
        query: The original query
        response: The generated response
        
    Returns:
        List of Task objects
    """
    try:
        # Use OpenAI to generate tasks
        with time_and_count(OPENAI_REQUESTS):
            response_obj = openai.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that creates actionable tasks."},
                    {"role": "user", "content": TASK_GENERATION_PROMPT.format(
                        query=query,
                        response=response
                    )}
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            
        # Parse the JSON response
        content = response_obj.choices[0].message.content
        result = json.loads(content)
        tasks = [
            Task(
                task=task["task"],
                priority=task["priority"],
                rationale=task["rationale"]
            )
            for task in result.get("tasks", [])
        ]
        
        return tasks
    except Exception as e:
        logger.error("Error generating tasks", error=str(e))
        return []

def generate_response(query: str, source: str, context: Dict[str, Any], max_results: int) -> QueryResponse:
    """
    Generate a response to the query.
    
    Args:
        query: The query string
        source: The source of the query
        context: Additional context information
        max_results: Maximum number of results to return
        
    Returns:
        QueryResponse object
    """
    start_time = time.time()
    
    try:
        # Search for similar documents
        documents = search_similar_documents(query, top_k=max_results)
        
        # Generate system prompt
        system_prompt = generate_system_prompt(source, context)
        
        # Format the context information
        context_str = ""
        for i, doc in enumerate(documents, 1):
            context_str += f"Reference {i} (Source: {doc['source']}):\n{doc['text']}\n\n"
            
        # Generate the response
        with time_and_count(OPENAI_REQUESTS):
            response = openai.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Query: {query}\n\nRelevant Information:\n{context_str}"}
                ],
                temperature=0.2,
            )
            
        answer = response.choices[0].message.content
        
        # Get relevant citations
        citations = get_relevant_citations(query, documents)
        
        # Generate tasks
        tasks = generate_tasks(query, answer)
        
        processing_time = time.time() - start_time
        
        return QueryResponse(
            query=query,
            answer=answer,
            citations=citations,
            tasks=tasks,
            processing_time=processing_time,
            source=source
        )
    except Exception as e:
        logger.error("Error generating response", error=str(e))
        processing_time = time.time() - start_time
        
        return QueryResponse(
            query=query,
            answer=f"I'm sorry, I encountered an error while processing your query: {str(e)}\n\nPlease try again or contact support.",
            citations=[],
            tasks=[],
            processing_time=processing_time,
            source=source
        )

# Create the FastAPI app
app = FastAPI(
    title="ICH Wiz API",
    description="API for the ICH Wiz regulatory guidance assistant",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/query", response_model=QueryResponse, dependencies=[Depends(get_api_key)])
async def query_endpoint(request: QueryRequest):
    """
    Process a query and return a response with citations and tasks.
    """
    with time_and_count(API_REQUESTS, API_LATENCY):
        response = generate_response(
            query=request.query,
            source=request.source,
            context=request.context or {},
            max_results=request.max_results or 5
        )
        return response

# Add Prometheus metrics endpoint
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)

def main():
    """Run the ICH Wiz API server."""
    import uvicorn
    uvicorn.run(
        "services.ich_wiz.agent:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=True,
    )

if __name__ == "__main__":
    main()