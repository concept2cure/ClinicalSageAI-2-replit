# /trialsage/main.py
# Main FastAPI application entry point

import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from controllers import protocol
from controllers import analytics_routes
from controllers import chat
from controllers import sample_size
from controllers import statistics
from controllers import dropout
from controllers import success
from controllers import validation

# Initialize FastAPI app
app = FastAPI(
    title="TrialSage API",
    description="Clinical Trial Intelligence Platform with Protocol and IND Generation",
    version="1.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup directories
static_dir = Path("static")
static_dir.mkdir(exist_ok=True)
frontend_dir = Path("frontend")

# Mount static files directory
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Set up templates
templates = Jinja2Templates(directory=str(frontend_dir))

# Include the protocol router
app.include_router(protocol.router)

# Include the dropout estimator router
app.include_router(dropout.router)

# Include the success probability router
app.include_router(success.router)

# Include the analytics router with prefix
app.include_router(
    analytics_routes.router,
    prefix="/api/analytics",
    tags=["analytics"]
)

# Include the chat router with prefix
app.include_router(
    chat.router,
    prefix="/api/chat",
    tags=["chat"]
)

# Include the sample size calculator router
app.include_router(
    sample_size.router,
    tags=["sample_size"]
)

# Include the statistics router
app.include_router(
    statistics.router,
    tags=["statistics"]
)

# Include the validation router
app.include_router(
    validation.router,
    tags=["validation"]
)

# Root endpoint (serve frontend)
@app.get("/")
async def read_root(request: Request):
    """Serve the frontend application"""
    try:
        return templates.TemplateResponse("index.html", {"request": request})
    except Exception as e:
        # Fallback to API info if frontend isn't available
        return {
            "name": "TrialSage Intelligence API",
            "version": "1.0",
            "endpoints": {
                "/api/intel/protocol-suggestions": "Generate protocol scaffolds with IND 2.5 and risk analysis",
                "/api/intel/continue-thread": "Continue protocol development with thread memory",
                "/api/intel/trigger-followup": "Generate follow-up modules like IND 2.7",
                "/api/intel/sap-draft": "Generate Statistical Analysis Plan drafts",
                "/api/intel/csr-evidence": "Find evidence in CSR corpus for a topic",
                "/api/intel/scheduled-report": "Generate weekly intelligence briefing",
                "/api/chat/send-message": "Send message to AI assistant and get response with CSR citations", 
                "/static/latest_report.pdf": "Download the latest intelligence briefing PDF",
                "/api/sample-size/continuous": "Calculate sample size for continuous outcomes",
                "/api/sample-size/binary": "Calculate sample size for binary outcomes",
                "/api/sample-size/survival": "Calculate sample size for survival/time-to-event outcomes",
                "/api/sample-size/non-inferiority-binary": "Calculate sample size for non-inferiority trial with binary outcome",
                "/api/sample-size/non-inferiority-continuous": "Calculate sample size for non-inferiority trial with continuous outcome",
                "/api/sample-size/recommend": "Get sample size recommendations based on protocol details"
            }
        }

# Error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for API errors"""
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": f"An unexpected error occurred: {str(exc)}",
            "error_type": exc.__class__.__name__,
        },
    )

# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint for monitoring systems"""
    required_env_vars = ["OPENAI_API_KEY"]
    missing_vars = [var for var in required_env_vars if not os.environ.get(var)]
    
    if missing_vars:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Missing required environment variables: {', '.join(missing_vars)}",
            },
        )
    
    return {"status": "healthy", "service": "TrialSage API"}

# Run the app with uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)