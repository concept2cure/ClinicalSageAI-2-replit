"""
Enhanced FastAPI Server with Assistant and Vector Search

This script creates a FastAPI server that integrates:
1. CER generation endpoints
2. Assistant streaming endpoints with context-aware retrieval
3. Vector search for documents
"""

import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="TrialSage API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routes
from routes.assistant_routes import router as assistant_router
from routes.assistant_retrieval import router as assistant_retrieval_router
from routes.document_routes import router as document_router
from routes.embedding_routes import router as embedding_router
from routes.ind_xml_validation import router as xml_validation_router
from routes.acks import router as acks_router
from routes.document_approval import router as doc_approval_router
from routes.ind_sequence_create import router as sequence_create_router

# Register route modules
app.include_router(assistant_router)
app.include_router(assistant_retrieval_router)
app.include_router(document_router)
app.include_router(embedding_router)
app.include_router(xml_validation_router)
app.include_router(acks_router)
app.include_router(doc_approval_router)
app.include_router(sequence_create_router)

# Add health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}

# Error handling
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"message": f"Internal server error: {str(exc)}"}
    )

if __name__ == "__main__":
    import uvicorn
    # Run the server
    port = int(os.environ.get("FASTAPI_PORT", 8000))
    logger.info(f"Starting FastAPI server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)