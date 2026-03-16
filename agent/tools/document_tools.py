"""
IND Copilot Document Tools

This module provides document-related tools for the IND Copilot agent,
including document approval and QC functions.
"""

import base64
import logging
import os
import sys
import httpx
from typing import Dict, Any

# Add project root to path so ingestion module is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Configure logger
logger = logging.getLogger(__name__)

# API Base URL
API_BASE = "http://localhost:3000"  # Update to match your actual API URL

async def approve_document(doc_id: int) -> Dict[str, Any]:
    """
    Run QC and approve a document

    Args:
        doc_id: Document ID to approve

    Returns:
        Dictionary with operation result
    """
    try:
        # Send request to the bulk approve endpoint
        # We're using the bulk endpoint with a single ID for consistency
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE}/api/documents/bulk-approve",
                json={"ids": [doc_id]},
                timeout=30.0
            )

            # Check response
            response.raise_for_status()
            result = response.json()

            return {
                "success": True,
                "message": f"Document {doc_id} QC and approval process started",
                "details": result
            }
    except httpx.HTTPStatusError as e:
        error_message = f"HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(f"Error approving document {doc_id}: {error_message}")
        return {
            "success": False,
            "message": f"Failed to approve document {doc_id}",
            "error": error_message
        }
    except Exception as e:
        logger.error(f"Error approving document {doc_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to approve document {doc_id}",
            "error": str(e)
        }

async def get_document_status(doc_id: int) -> Dict[str, Any]:
    """
    Get the current status of a document

    Args:
        doc_id: Document ID to check

    Returns:
        Dictionary with document status information
    """
    try:
        # Send request to get document status
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE}/api/documents/{doc_id}",
                timeout=10.0
            )

            # Check response
            response.raise_for_status()
            document = response.json()

            # Format response
            status = document.get("status", "unknown")
            qc_status = document.get("qc_json", {}).get("status", "unknown")

            return {
                "success": True,
                "document_id": doc_id,
                "status": status,
                "qc_status": qc_status,
                "title": document.get("title", ""),
                "module": document.get("module", "")
            }
    except httpx.HTTPStatusError as e:
        error_message = f"HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(f"Error getting document status {doc_id}: {error_message}")
        return {
            "success": False,
            "message": f"Failed to get status for document {doc_id}",
            "error": error_message
        }
    except Exception as e:
        logger.error(f"Error getting document status {doc_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to get status for document {doc_id}",
            "error": str(e)
        }


# ═══════════════════════════════════════════════════════════════════════════════
# PDF TEXT EXTRACTION TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

async def extract_pdf_text(
    file_path: str = None,
    file_base64: str = None,
    force_ocr: bool = False,
    strategies: list = None,
) -> Dict[str, Any]:
    """
    Extract text from a PDF using multi-strategy cascade.

    Strategies tried in order:
      1. PyMuPDF (fitz) — fastest, best layout preservation
      2. PyPDF2 — fallback for native PDFs
      3. pdfminer.six — layout-aware extraction
      4. Tesseract OCR — for scanned PDFs
      5. Enhanced OCR — with OpenCV preprocessing for poor quality scans

    Args:
        file_path: Path to PDF file on server
        file_base64: Base64-encoded PDF content (alternative to file_path)
        force_ocr: Skip text extraction and use OCR directly
        strategies: List of strategies to try (default: all)

    Returns:
        Dictionary with:
          - text: Extracted text
          - strategy: Which strategy succeeded
          - page_count: Number of pages
          - char_count: Character count
          - success: Whether extraction succeeded
          - warnings: Any warnings encountered
          - metadata: Additional extraction metadata
    """
    # First try FastAPI endpoint
    analytics_port = os.environ.get('ANALYTICS_PORT', 8001)
    analytics_url = f"http://localhost:{analytics_port}/extract-pdf"

    try:
        async with httpx.AsyncClient() as client:
            payload = {
                "min_chars": 50,
                "force_ocr": force_ocr,
            }

            if file_path:
                if not os.path.exists(file_path):
                    return {
                        "success": False,
                        "text": "",
                        "strategy": "none",
                        "page_count": 0,
                        "char_count": 0,
                        "warnings": [f"File not found: {file_path}"],
                        "metadata": {}
                    }
                payload["file_path"] = file_path
            elif file_base64:
                payload["file_base64"] = file_base64
            else:
                return {
                    "success": False,
                    "text": "",
                    "strategy": "none",
                    "page_count": 0,
                    "char_count": 0,
                    "warnings": ["Either file_path or file_base64 must be provided"],
                    "metadata": {}
                }

            if strategies:
                payload["strategies"] = strategies

            response = await client.post(
                analytics_url,
                json=payload,
                timeout=120.0  # 2 min for OCR
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(f"PDF extracted via FastAPI: {result.get('strategy')}, {result.get('char_count')} chars")
                return {
                    "success": result.get("success", False),
                    "text": result.get("text", ""),
                    "strategy": result.get("strategy", "unknown"),
                    "page_count": result.get("page_count", 0),
                    "char_count": result.get("char_count", 0),
                    "warnings": result.get("warnings", []),
                    "metadata": result.get("metadata", {})
                }
            else:
                logger.warning(f"FastAPI returned {response.status_code}")
    except Exception as e:
        logger.warning(f"FastAPI not available: {e}")

    # Fallback: direct Python extraction
    try:
        from ingestion.pdf_extractor import extract_pdf_text as py_extract

        if file_path:
            pdf_input = file_path
        elif file_base64:
            pdf_input = base64.b64decode(file_base64)
        else:
            return {
                "success": False,
                "text": "",
                "strategy": "none",
                "page_count": 0,
                "char_count": 0,
                "warnings": ["No input provided"],
                "metadata": {}
            }

        result = py_extract(
            pdf_input,
            strategies=strategies,
            force_ocr=force_ocr,
        )

        logger.info(f"PDF extracted directly: {result.get('strategy')}, {result.get('char_count')} chars")
        return result

    except Exception as e:
        logger.exception("Direct Python extraction failed")
        return {
            "success": False,
            "text": "",
            "strategy": "none",
            "page_count": 0,
            "char_count": 0,
            "warnings": [f"Extraction failed: {str(e)}"],
            "metadata": {}
        }


async def extract_pdf_with_ocr(file_path: str = None, file_base64: str = None) -> Dict[str, Any]:
    """
    Extract text from a PDF forcing OCR mode.

    Use this for scanned documents or when you know the PDF contains images of text.

    Args:
        file_path: Path to PDF file on server
        file_base64: Base64-encoded PDF content

    Returns:
        Same as extract_pdf_text()
    """
    return await extract_pdf_text(
        file_path=file_path,
        file_base64=file_base64,
        force_ocr=True,
        strategies=['ocr', 'ocr_enhanced']
    )
