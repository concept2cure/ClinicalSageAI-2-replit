
#!/usr/bin/env python3
"""
FastAPI Bridge for TrialSage Analytics Engine
Provides HTTP API for Python/R analytics integration
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import json
import subprocess
import os
import sys
import uuid
import base64
from datetime import datetime
import logging

# Add project root to sys.path for ingestion module imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="TrialSage Analytics Engine API",
    description="Python/R Analytics Integration Service",
    version="1.0.0"
)

# Request models
class AnalysisRequest(BaseModel):
    analysis_type: str
    data: Dict[str, Any]
    options: Optional[Dict[str, Any]] = {}

class BatchAnalysisRequest(BaseModel):
    analyses: List[AnalysisRequest]

# Response models
class AnalysisResponse(BaseModel):
    analysis_id: str
    analysis_type: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: str

# In-memory storage for demo (use Redis/database in production)
analysis_cache = {}

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "TrialSage Analytics Engine",
        "status": "active",
        "version": "1.0.0",
        "endpoints": [
            "/run-analysis",
            "/batch-analysis",
            "/analysis-status/{analysis_id}",
            "/extract-pdf",
            "/extract-pdf-upload",
            "/health"
        ]
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/run-analysis", response_model=AnalysisResponse)
async def run_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """Run a single analysis"""
    analysis_id = str(uuid.uuid4())

    # Store analysis request
    analysis_cache[analysis_id] = {
        "status": "running",
        "analysis_type": request.analysis_type,
        "timestamp": datetime.now().isoformat(),
        "result": None,
        "error": None
    }

    # Run analysis in background
    background_tasks.add_task(execute_analysis, analysis_id, request)

    return AnalysisResponse(
        analysis_id=analysis_id,
        analysis_type=request.analysis_type,
        status="running",
        timestamp=datetime.now().isoformat()
    )

@app.post("/run-analysis-sync", response_model=AnalysisResponse)
async def run_analysis_sync(request: AnalysisRequest):
    """Run analysis synchronously"""
    analysis_id = str(uuid.uuid4())

    try:
        result = await execute_analysis_sync(request)

        return AnalysisResponse(
            analysis_id=analysis_id,
            analysis_type=request.analysis_type,
            status="completed",
            result=result,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return AnalysisResponse(
            analysis_id=analysis_id,
            analysis_type=request.analysis_type,
            status="failed",
            error=str(e),
            timestamp=datetime.now().isoformat()
        )

@app.get("/analysis-status/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis_status(analysis_id: str):
    """Get analysis status and results"""
    if analysis_id not in analysis_cache:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = analysis_cache[analysis_id]

    return AnalysisResponse(
        analysis_id=analysis_id,
        analysis_type=analysis["analysis_type"],
        status=analysis["status"],
        result=analysis.get("result"),
        error=analysis.get("error"),
        timestamp=analysis["timestamp"]
    )

@app.post("/batch-analysis")
async def batch_analysis(request: BatchAnalysisRequest, background_tasks: BackgroundTasks):
    """Run multiple analyses in batch"""
    batch_id = str(uuid.uuid4())
    analysis_ids = []

    for analysis_request in request.analyses:
        analysis_id = str(uuid.uuid4())
        analysis_ids.append(analysis_id)

        # Store analysis request
        analysis_cache[analysis_id] = {
            "status": "running",
            "analysis_type": analysis_request.analysis_type,
            "timestamp": datetime.now().isoformat(),
            "result": None,
            "error": None,
            "batch_id": batch_id
        }

        # Run analysis in background
        background_tasks.add_task(execute_analysis, analysis_id, analysis_request)

    return {
        "batch_id": batch_id,
        "analysis_ids": analysis_ids,
        "status": "running",
        "timestamp": datetime.now().isoformat()
    }

async def execute_analysis_sync(request: AnalysisRequest) -> Dict[str, Any]:
    """Execute analysis synchronously"""
    try:
        # Prepare input data
        input_data = {
            "analysis_type": request.analysis_type,
            **request.data
        }

        # Run Python analytics engine
        cmd = ["python3", "PythonAnalyticsEngine.py", json.dumps(input_data)]

        result = subprocess.run(
            cmd,
            cwd=os.path.dirname(__file__),
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"output": result.stdout, "raw_output": True}
        else:
            raise Exception(f"Analysis failed: {result.stderr}")

    except Exception as e:
        logger.error(f"Analysis execution failed: {str(e)}")
        raise e

async def execute_analysis(analysis_id: str, request: AnalysisRequest):
    """Execute analysis and update cache"""
    try:
        result = await execute_analysis_sync(request)

        # Update cache with results
        analysis_cache[analysis_id].update({
            "status": "completed",
            "result": result,
            "error": None
        })

    except Exception as e:
        logger.error(f"Analysis {analysis_id} failed: {str(e)}")

        # Update cache with error
        analysis_cache[analysis_id].update({
            "status": "failed",
            "result": None,
            "error": str(e)
        })


# ═══════════════════════════════════════════════════════════════════════════════
# PDF EXTRACTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class PDFExtractionRequest(BaseModel):
    """Request for PDF text extraction."""
    file_path: Optional[str] = None
    file_base64: Optional[str] = None
    strategies: Optional[List[str]] = None
    min_chars: int = 50
    force_ocr: bool = False

class PDFExtractionResponse(BaseModel):
    """Response from PDF text extraction."""
    text: str
    strategy: str
    page_count: int
    char_count: int
    success: bool
    warnings: List[str]
    metadata: Dict[str, Any]


@app.post("/extract-pdf", response_model=PDFExtractionResponse)
async def extract_pdf_endpoint(request: PDFExtractionRequest):
    """
    Extract text from a PDF using multi-strategy cascade.

    Accepts either:
    - file_path: Path to PDF on server filesystem
    - file_base64: Base64-encoded PDF content

    Strategies (in order): pymupdf, pypdf2, pdfminer, ocr, ocr_enhanced
    """
    try:
        from ingestion.pdf_extractor import extract_pdf_text

        if request.file_path:
            if not os.path.exists(request.file_path):
                raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
            pdf_input = request.file_path
        elif request.file_base64:
            try:
                pdf_input = base64.b64decode(request.file_base64)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64: {str(e)}")
        else:
            raise HTTPException(
                status_code=400,
                detail="Either file_path or file_base64 must be provided"
            )

        result = extract_pdf_text(
            pdf_input,
            strategies=request.strategies,
            min_chars=request.min_chars,
            force_ocr=request.force_ocr,
        )

        return PDFExtractionResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("PDF extraction failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-pdf-upload", response_model=PDFExtractionResponse)
async def extract_pdf_upload_endpoint(
    file: UploadFile = File(...),
    strategies: Optional[str] = Form(None),
    min_chars: int = Form(50),
    force_ocr: bool = Form(False),
):
    """
    Extract text from an uploaded PDF file.

    Multipart form upload endpoint for direct file uploads.
    """
    try:
        from ingestion.pdf_extractor import extract_pdf_text

        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")

        pdf_bytes = await file.read()

        strategy_list = None
        if strategies:
            strategy_list = [s.strip() for s in strategies.split(',')]

        result = extract_pdf_text(
            pdf_bytes,
            strategies=strategy_list,
            min_chars=min_chars,
            force_ocr=force_ocr,
        )

        return PDFExtractionResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("PDF upload extraction failed")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    # Get port from environment or default to 8001
    port = int(os.environ.get("ANALYTICS_PORT", 8001))

    logger.info(f"Starting TrialSage Analytics Engine API on port {port}")

    uvicorn.run(
        "fastapi_bridge:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
