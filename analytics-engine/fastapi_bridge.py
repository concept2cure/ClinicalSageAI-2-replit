
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
            "/ingest-files",
            "/project-context/{project_id}",
            "/generate-docx",
            "/generate-ind-package",
            "/generate-ind-section",
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


# ── Project Knowledge-Base & Document Generation endpoints ──────────────────

class ProjectContextRequest(BaseModel):
    project_id: str
    max_chars_per_doc: Optional[int] = 4000
    max_total_chars: Optional[int] = 80000


class DocxGenerationRequest(BaseModel):
    sections: List[Dict[str, Any]]
    document_title: Optional[str] = "Regulatory Document"
    organization: Optional[str] = ""
    author: Optional[str] = ""


class INDGenerationRequest(BaseModel):
    project_id: str
    drug_name: Optional[str] = "Investigational Drug"
    sponsor: Optional[str] = ""
    indication: Optional[str] = ""
    ctd_sections: Optional[List[str]] = None
    compliance_region: Optional[str] = "FDA"
    document_type: Optional[str] = "ind_package"
    document_config: Optional[Dict[str, Any]] = None


class INDSectionRequest(BaseModel):
    section_type: str
    project_id: Optional[str] = None
    documents: Optional[List[Dict[str, Any]]] = None
    requirements: Optional[Dict[str, Any]] = {}
    compliance_region: Optional[str] = "FDA"


@app.post("/ingest-files")
async def ingest_files_endpoint(
    project_id: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """
    Upload one or more files (PDF, DOCX, XLSX, TXT, CSV, MD) into a project
    knowledge base. Files are extracted and indexed for later synthesis.
    """
    try:
        from backend.knowledge_ingestion import ingest_project_bytes

        file_data = []
        for uf in files:
            content = await uf.read()
            file_data.append({
                "filename": uf.filename or "upload",
                "content":  content,
                "content_type": uf.content_type or "application/octet-stream",
            })

        result = ingest_project_bytes(file_data, project_id)
        return {
            "success": True,
            "project_id": project_id,
            "ingested": result.get("ingested", []),
            "failed":   result.get("failed", []),
            "total_files": len(file_data),
            "timestamp": datetime.now().isoformat(),
        }

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Ingestion module unavailable: {e}")
    except Exception as e:
        logger.exception("File ingestion failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/project-context/{project_id}")
async def get_project_context_endpoint(
    project_id: str,
    max_chars_per_doc: int = 4000,
    max_total_chars: int = 80000,
):
    """
    Return the synthesised knowledge context for a project:
      - list of documents with excerpts
      - combined_context string (all docs concatenated)
      - summary_prompt suitable for direct LLM injection
      - extracted keywords
    """
    try:
        from backend.knowledge_ingestion import get_project_context

        ctx = get_project_context(
            project_id,
            max_chars_per_doc=max_chars_per_doc,
            max_total_chars=max_total_chars,
        )
        return ctx

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Knowledge module unavailable: {e}")
    except Exception as e:
        logger.exception("Project context retrieval failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-docx")
async def generate_docx_endpoint(request: DocxGenerationRequest):
    """
    Generate a formatted .docx from a list of pre-built section dicts.
    Returns the raw DOCX bytes as application/vnd.openxmlformats-officedocument...
    """
    from fastapi.responses import Response

    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.generateSection import section_generator

        docx_bytes = section_generator.generate_docx_document(
            sections=request.sections,
            document_title=request.document_title or "Regulatory Document",
            organization=request.organization or "",
            author=request.author or "",
        )
        filename = (request.document_title or "document").replace(" ", "_") + ".docx"
        return Response(
            content=docx_bytes,
            media_type=(
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            ),
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Document generator unavailable: {e}")
    except Exception as e:
        logger.exception("DOCX generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-ind-package")
async def generate_ind_package_endpoint(request: INDGenerationRequest):
    """
    End-to-end IND package generation:
    1. Loads all uploaded project documents
    2. Uses AI to draft each requested CTD section
    3. Assembles a formatted .docx
    Returns DOCX bytes as a file download.
    """
    from fastapi.responses import Response
    import asyncio

    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.generateSection import section_generator

        # Use document_from_project for named types, or direct IND package
        if request.document_type and request.document_type != "ind_package":
            config = request.document_config or {}
            config.update({
                "drug_name":          request.drug_name,
                "sponsor":            request.sponsor,
                "indication":         request.indication,
                "compliance_region":  request.compliance_region,
            })
            result = await section_generator.generate_document_from_project(
                project_id=request.project_id,
                document_type=request.document_type,
                document_config=config,
            )
        else:
            result = await section_generator.generate_ind_package_docx(
                project_id=request.project_id,
                drug_name=request.drug_name or "Investigational Drug",
                sponsor=request.sponsor or "",
                indication=request.indication or "",
                ctd_sections=request.ctd_sections,
                compliance_region=request.compliance_region or "FDA",
            )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail={"errors": result.get("errors", [])},
            )

        docx_bytes = result["docx_bytes"]
        filename = (
            (result.get("document_title") or "IND_Package")
            .replace(" ", "_")
            .replace("/", "-")
            + ".docx"
        )

        return Response(
            content=docx_bytes,
            media_type=(
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            ),
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Sections-Generated": str(result.get("sections_generated", 0)),
                "X-Sections-Failed":    str(result.get("sections_failed", 0)),
            },
        )

    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Generation module unavailable: {e}")
    except Exception as e:
        logger.exception("IND package generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-ind-section")
async def generate_ind_section_endpoint(request: INDSectionRequest):
    """
    Generate a single IND/eCTD section as JSON.
    Accepts either an explicit documents list OR a project_id (auto-loads context).
    Returns the section content + citations + scores.
    """
    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.generateSection import section_generator

        docs = request.documents or []
        if not docs and request.project_id:
            docs = section_generator.load_project_documents(request.project_id)

        result = await section_generator.generate_regulatory_section(
            section_type=request.section_type,
            context_documents=docs,
            user_requirements=request.requirements or {},
            compliance_region=request.compliance_region or "FDA",
        )

        from dataclasses import asdict
        return {
            "success":   True,
            "section":   asdict(result),
            "timestamp": datetime.now().isoformat(),
        }

    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Generation module unavailable: {e}")
    except Exception as e:
        logger.exception("Section generation failed")
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
