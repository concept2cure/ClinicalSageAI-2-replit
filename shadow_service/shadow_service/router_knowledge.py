"""Knowledge Base + AI Document Generation router.

Bridges the Shadow Service (port 8001) to the project-root Python layer:
  backend/knowledge_ingestion.py  — multi-format file extraction + project index
  backend/generateSection.py      — AI section generation + python-docx output

Auth: same fail-closed REVIEW_ADMIN_TOKEN guard as DOCX Factory.

Endpoints
---------
POST /knowledge/ingest-files            — upload files into a project KB
GET  /knowledge/project-context/{id}    — retrieve synthesised context
POST /knowledge/generate-docx           — sections JSON → .docx bytes
POST /knowledge/generate-ind-package    — end-to-end IND CTD package
POST /knowledge/generate-ind-section    — single section as JSON
"""

import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── sys.path: let shadow_service find the project root ────────────────────────
# Layout:
#   .../shadow_service/shadow_service/router_knowledge.py  ← this file
#   .../shadow_service/                                    ← ss package root
#   .../                                                   ← PROJECT ROOT
_PKG_DIR      = Path(__file__).resolve().parent   # .../shadow_service/shadow_service/
_SS_ROOT      = _PKG_DIR.parent                   # .../shadow_service/
_PROJECT_ROOT = _SS_ROOT.parent                   # workspace root

for _p in (str(_PROJECT_ROOT), str(_SS_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)


# ══════════════════════════════════════════════════════════════════════════════
# Auth — fail-closed admin token guard
# ══════════════════════════════════════════════════════════════════════════════

def require_knowledge_admin(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Reject requests if REVIEW_ADMIN_TOKEN is not configured or wrong."""
    expected = os.getenv("REVIEW_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Knowledge Base service disabled (REVIEW_ADMIN_TOKEN not set)",
        )
    if x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic request / response models
# ══════════════════════════════════════════════════════════════════════════════

class INDSectionRequest(BaseModel):
    section_type: str
    project_id: Optional[str] = None
    documents: Optional[List[Dict[str, Any]]] = None
    requirements: Optional[Dict[str, Any]] = {}
    compliance_region: Optional[str] = "FDA"


class INDPackageRequest(BaseModel):
    project_id: str
    drug_name: Optional[str] = "Investigational Drug"
    sponsor: Optional[str] = ""
    indication: Optional[str] = ""
    ctd_sections: Optional[List[str]] = None
    compliance_region: Optional[str] = "FDA"
    document_type: Optional[str] = "ind_package"
    document_config: Optional[Dict[str, Any]] = None


class DocxSectionItem(BaseModel):
    section_title: str
    content: str
    citations: Optional[List[Any]] = []
    validation: Optional[Dict[str, Any]] = None


class DocxBuildRequest(BaseModel):
    sections: List[DocxSectionItem]
    document_title: Optional[str] = "Regulatory Document"
    organization: Optional[str] = ""
    author: Optional[str] = ""


# ══════════════════════════════════════════════════════════════════════════════
# Router
# ══════════════════════════════════════════════════════════════════════════════

router = APIRouter(
    prefix="/knowledge",
    tags=["Knowledge Base"],
    dependencies=[Depends(require_knowledge_admin)],
)

_DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


# ──────────────────────────────────────────────────────────────────────────────
# POST /knowledge/ingest-files
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/ingest-files",
    summary="Upload & ingest files into a project knowledge base",
)
async def ingest_files(
    project_id: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """Accept one or more files and index them under *project_id*."""
    try:
        from backend.knowledge_ingestion import ingest_project_bytes  # noqa: PLC0415

        file_data = []
        for uf in files:
            content = await uf.read()
            file_data.append(
                {
                    "filename":     uf.filename or "upload",
                    "content":      content,
                    "content_type": uf.content_type or "application/octet-stream",
                }
            )

        result = ingest_project_bytes(file_data, project_id)

        return {
            "success":     True,
            "project_id":  project_id,
            "ingested":    result.get("ingested", []),
            "failed":      result.get("failed", []),
            "total_files": len(file_data),
        }

    except ImportError as exc:
        logger.exception("knowledge_ingestion unavailable")
        raise HTTPException(status_code=503, detail=f"Ingestion module unavailable: {exc}")
    except Exception as exc:
        logger.exception("File ingestion failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# GET /knowledge/project-context/{project_id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get(
    "/project-context/{project_id}",
    summary="Return synthesised knowledge context for a project",
)
async def get_project_context_endpoint(
    project_id: str,
    max_chars_per_doc: int = 4000,
    max_total_chars: int = 80_000,
):
    """
    Returns combined_context, summary_prompt, keywords, and per-document
    excerpts — ready for direct injection into LLM prompts.
    """
    try:
        from backend.knowledge_ingestion import get_project_context  # noqa: PLC0415

        return get_project_context(
            project_id,
            max_chars_per_doc=max_chars_per_doc,
            max_total_chars=max_total_chars,
        )

    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Knowledge module unavailable: {exc}")
    except Exception as exc:
        logger.exception("Project context retrieval failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# POST /knowledge/generate-docx
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/generate-docx",
    summary="Generate a formatted .docx from pre-built section JSON",
)
async def generate_docx_endpoint(request: DocxBuildRequest):
    """
    Receives a list of section dicts (section_title + content + optional
    citations/validation) and returns a binary .docx download.
    """
    try:
        from backend.generateSection import section_generator  # noqa: PLC0415

        sections_dicts = [s.model_dump() for s in request.sections]
        docx_bytes = section_generator.generate_docx_document(
            sections=sections_dicts,
            document_title=request.document_title or "Regulatory Document",
            organization=request.organization or "",
            author=request.author or "",
        )

        filename = (request.document_title or "document").replace(" ", "_") + ".docx"
        return Response(
            content=docx_bytes,
            media_type=_DOCX_MIME,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Document generator unavailable: {exc}")
    except Exception as exc:
        logger.exception("DOCX generation failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# POST /knowledge/generate-ind-package
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/generate-ind-package",
    summary="End-to-end IND CTD package: project docs → AI draft → .docx",
)
async def generate_ind_package_endpoint(request: INDPackageRequest):
    """
    1. Loads all ingested project documents from the knowledge store.
    2. Uses AI to draft each requested CTD section.
    3. Assembles a formatted .docx.
    Returns DOCX binary as a file download.
    """
    try:
        from backend.generateSection import section_generator  # noqa: PLC0415

        if request.document_type and request.document_type != "ind_package":
            config: Dict[str, Any] = dict(request.document_config or {})
            config.update(
                {
                    "drug_name":         request.drug_name,
                    "sponsor":           request.sponsor,
                    "indication":        request.indication,
                    "compliance_region": request.compliance_region,
                }
            )
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
                detail={"message": "Document generation failed", "errors": result.get("errors", [])},
            )

        docx_bytes = result["docx_bytes"]
        doc_title  = result.get("document_title") or "IND_Package"
        filename   = doc_title.replace(" ", "_").replace("/", "-") + ".docx"

        return Response(
            content=docx_bytes,
            media_type=_DOCX_MIME,
            headers={
                "Content-Disposition":  f'attachment; filename="{filename}"',
                "X-Sections-Generated": str(result.get("sections_generated", 0)),
                "X-Sections-Failed":    str(result.get("sections_failed", 0)),
            },
        )

    except HTTPException:
        raise
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Generation module unavailable: {exc}")
    except Exception as exc:
        logger.exception("IND package generation failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# POST /knowledge/generate-ind-section
# ──────────────────────────────────────────────────────────────────────────────

@router.post(
    "/generate-ind-section",
    summary="Generate a single IND/eCTD section as JSON",
)
async def generate_ind_section_endpoint(request: INDSectionRequest):
    """
    Generates AI content for one CTD section.
    Accepts either an explicit *documents* list OR a *project_id*
    (context auto-loaded from the knowledge base).
    """
    try:
        from dataclasses import asdict
        from backend.generateSection import section_generator  # noqa: PLC0415

        docs: List[Dict[str, Any]] = list(request.documents or [])
        if not docs and request.project_id:
            docs = section_generator.load_project_documents(request.project_id)

        result = await section_generator.generate_regulatory_section(
            section_type=request.section_type,
            context_documents=docs,
            user_requirements=dict(request.requirements or {}),
            compliance_region=request.compliance_region or "FDA",
        )

        return {
            "success": True,
            "section": asdict(result),
        }

    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Generation module unavailable: {exc}")
    except Exception as exc:
        logger.exception("Section generation failed")
        raise HTTPException(status_code=500, detail=str(exc))
