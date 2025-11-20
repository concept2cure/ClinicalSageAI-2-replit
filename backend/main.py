"""
FastAPI Application for TrialSage Study Architect™
--------------------------------------------------
This module serves as the main application entry point for the FastAPI backend.
"""

import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from routes.study import router as study_router
from routes.enzymax_study import router as enzymax_router
from routes.simulation import router as simulation_router
from routes.metadata_repository import router as metadata_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="TrialSage Study Architect API",
    description="API for statistical simulation and trial design capabilities",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(study_router)
app.include_router(enzymax_router)
app.include_router(simulation_router)

# Register the Clinical Metadata Repository (CMDR) router
app.include_router(
    metadata_router,
    prefix="/api",
    tags=["Metadata Repository"]
)

@app.get("/")
async def root():
    """Root endpoint providing API information."""
    return {
        "name": "TrialSage Study Architect API",
        "version": "1.0.0",
        "status": "active",
        "endpoints": [
            "/api/study/simulate",
            "/api/study/sample-size",
            "/api/enzymax/functional-dyspepsia",
            "/api/enzymax/chronic-pancreatitis",
            "/api/enzymax/functional-dyspepsia/power-curve",
            "/api/enzymax/chronic-pancreatitis/power-curve",
            "/api/enzymax/sample-scenarios",
            "/api/simulation/monte-carlo",
            "/api/simulation/adaptive-design",
            "/api/simulation/methods",
            "/api/metadata/forms",
            "/api/metadata/terminologies",
            "/api/metadata/datasets",
            "/api/metadata/mappings",
            "/api/metadata/files",
            "/api/metadata/search",
            "/api/metadata/impact",
            "/api/metadata/export-edc"
        ]
    }

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

if __name__ == "__main__":
    # Determine port - use PORT environment variable if available, otherwise use 8000
    port = int(os.environ.get("PORT", 8000))
    
    # Log startup information
    logger.info(f"Starting TrialSage Study Architect API on port {port}")
    
    # Start the server
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)