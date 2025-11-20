"""
ICH Agent API for TrialSage ICH Specialist

This module provides the FastAPI endpoints for the ICH Specialist service,
enabling AI-powered guidance on ICH guidelines and regulatory compliance.
"""
import os
import json
import logging
from typing import List, Dict, Any, Optional
import time

import openai
from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import structlog

from .config import settings
from .indexer import VectorRetriever
from .metrics import API_REQUESTS, API_LATENCY, OPENAI_REQUESTS, time_and_count

# Configure structured logging
logger = structlog.get_logger()

# Initialize FastAPI app
app = FastAPI(
    title="TrialSage ICH Specialist",
    description="ICH compliance guidance, semantic search, and task generation",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup API key authentication if enabled
api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)

# Initialize OpenAI client
openai.api_key = settings.OPENAI_API_KEY

# Initialize vector retriever
retriever = VectorRetriever()

# API key authentication dependency
async def get_api_key(api_key: str = Depends(api_key_header)):
    if not settings.API_AUTH_ENABLED:
        return True
    
    if api_key is None or api_key != settings.API_KEY:
        API_REQUESTS.labels(endpoint="/api/ich-agent", method="POST", status="unauthorized").inc()
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key",
        )
    return True

# Input model for ICH query
class ICHQuery(BaseModel):
    """Query model for ICH Agent"""
    text: str = Field(..., description="The query text or protocol content to analyze")
    document_type: str = Field("protocol", description="Type of document being analyzed: protocol, csr, cmc, etc.")
    module: str = Field(None, description="Specific ICH module to focus on (e.g., E6, E3)")
    generate_tasks: bool = Field(True, description="Whether to generate project management tasks")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context for the query")

# Output models
class Citation(BaseModel):
    """Citation for ICH guidance"""
    source: str = Field(..., description="The source document")
    text: str = Field(..., description="The cited text")
    url: Optional[str] = Field(None, description="URL to the source if available")
    relevance_score: float = Field(..., description="Relevance score (0-1)")

class Task(BaseModel):
    """Project management task suggestion"""
    title: str = Field(..., description="Task title")
    description: str = Field(..., description="Task description")
    priority: str = Field(..., description="Priority (high, medium, low)")
    estimated_effort: str = Field(..., description="Estimated effort (days or hours)")
    assignee_role: Optional[str] = Field(None, description="Suggested role for assignee")

class ICHResponse(BaseModel):
    """Response from ICH Agent"""
    answer: str = Field(..., description="The guidance answer")
    citations: List[Citation] = Field([], description="Citations from ICH guidelines")
    tasks: List[Task] = Field([], description="Suggested project management tasks")
    processing_time: float = Field(..., description="Time taken to process the request (seconds)")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    API_REQUESTS.labels(endpoint="/health", method="GET", status="success").inc()
    return {"status": "ok", "version": app.version}

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    API_REQUESTS.labels(endpoint="/metrics", method="GET", status="success").inc()
    # The actual metrics are provided by the prometheus_fastapi_instrumentator middleware
    return {"status": "ok"}

@app.post("/api/ich-agent", response_model=ICHResponse, dependencies=[Depends(get_api_key)])
@time_and_count("API_LATENCY", {"endpoint": "/api/ich-agent"})
async def ich_agent(query: ICHQuery, background_tasks: BackgroundTasks, request: Request):
    """
    Process a query about ICH guidelines and return AI-powered guidance
    
    This endpoint:
    1. Retrieves relevant passages from the vector store
    2. Generates a response using OpenAI
    3. Extracts citations from the source material
    4. Creates suggested project management tasks
    """
    start_time = time.time()
    logger.info("ICH agent query received", document_type=query.document_type, module=query.module)
    API_REQUESTS.labels(endpoint="/api/ich-agent", method="POST", status="processing").inc()
    
    try:
        # Retrieve relevant context from vector store
        context_docs = await retriever.retrieve(
            query.text, 
            module=query.module,
            document_type=query.document_type,
            top_k=10
        )
        
        # Format context for OpenAI
        formatted_context = "\n\n".join([
            f"SOURCE: {doc['source']}\n{doc['text']}" 
            for doc in context_docs
        ])
        
        # Create system prompt based on query type
        system_prompt = """You are the TrialSage ICH Specialist, an expert co-pilot for pharmaceutical regulatory compliance.
Your purpose is to provide accurate guidance on ICH regulatory guidelines and suggest project management tasks.
Always cite your sources and be precise in your recommendations.
If you're unsure about anything, acknowledge the uncertainty rather than providing speculative information."""
        
        # Add document type specific instructions
        if query.document_type == "protocol":
            system_prompt += "\nFocus on protocol design and study methodology guidance aligned with ICH E6, E8, and E9."
        elif query.document_type == "csr":
            system_prompt += "\nFocus on clinical study report structure and content aligned with ICH E3."
        elif query.document_type == "cmc":
            system_prompt += "\nFocus on chemistry, manufacturing, and controls guidance aligned with ICH Q1-Q12."
        
        # User prompt with context
        user_prompt = f"""Please analyze the following query and provide guidance based on ICH guidelines:

QUERY: {query.text}

RELEVANT ICH GUIDELINES:
{formatted_context}

Please provide:
1. A comprehensive answer addressing the query
2. Explicit citations to relevant ICH guidelines
3. A list of suggested project management tasks based on your guidance"""
        
        # Track API calls
        OPENAI_REQUESTS.labels(operation="completion", status="processing").inc()
        
        # Call OpenAI API
        response = await openai.ChatCompletion.acreate(
            model="gpt-4o",  # Note: Using the latest GPT-4o model
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2000,
        )
        
        OPENAI_REQUESTS.labels(operation="completion", status="success").inc()
        
        # Extract response text
        gpt_response = response.choices[0].message.content
        
        # Process response to extract citations and tasks
        # Note: In a production implementation, this would parse the structured output
        # For this implementation, we'll create sample data
        
        # Extract citations from context documents
        citations = [
            Citation(
                source=doc['source'],
                text=doc['text'][:200] + "...",  # Truncate for brevity
                url=doc.get('url'),
                relevance_score=doc['score']
            )
            for doc in context_docs[:5]  # Include top 5 citations
        ]
        
        # Generate tasks based on response
        # In production, we would parse these from the GPT response
        sample_tasks = [
            Task(
                title="Review protocol against ICH E6(R2) GCP requirements",
                description="Conduct a comprehensive review of the protocol to ensure compliance with GCP standards",
                priority="high",
                estimated_effort="2 days",
                assignee_role="Regulatory Affairs Specialist"
            ),
            Task(
                title="Update statistical analysis plan",
                description="Revise the SAP to incorporate ICH E9 recommendations for the primary endpoint analysis",
                priority="medium",
                estimated_effort="1 day",
                assignee_role="Biostatistician"
            ),
            Task(
                title="Develop monitoring plan",
                description="Create a risk-based monitoring plan in line with ICH E6(R2) section 5.18",
                priority="medium",
                estimated_effort="3 days",
                assignee_role="Clinical Operations Manager"
            )
        ]
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Log success
        logger.info(
            "ICH agent query successful",
            document_type=query.document_type,
            module=query.module,
            processing_time=processing_time
        )
        
        # Track success
        API_REQUESTS.labels(endpoint="/api/ich-agent", method="POST", status="success").inc()
        
        # Return response
        return ICHResponse(
            answer=gpt_response,
            citations=citations,
            tasks=sample_tasks if query.generate_tasks else [],
            processing_time=processing_time
        )
        
    except Exception as e:
        # Log error
        logger.error(
            "ICH agent query failed",
            document_type=query.document_type,
            module=query.module,
            error=str(e)
        )
        
        # Track error
        API_REQUESTS.labels(endpoint="/api/ich-agent", method="POST", status="error").inc()
        OPENAI_REQUESTS.labels(operation="completion", status="error").inc()
        
        # Raise HTTP exception
        raise HTTPException(
            status_code=500,
            detail=f"Error processing query: {str(e)}"
        )

# Add middleware for metrics collection
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)

# Run the FastAPI app directly for development
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)