"""
IND Copilot Document Tools

This module provides document-related tools for the IND Copilot agent,
including document approval and QC functions.
"""

import logging
import httpx
from typing import Dict, Any

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