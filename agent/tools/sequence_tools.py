"""
IND Copilot Sequence Tools

This module provides sequence-related tools for the IND Copilot agent,
including sequence creation and validation functions.
"""

import logging
import httpx
from typing import Dict, Any, List

# Configure logger
logger = logging.getLogger(__name__)

# API Base URL
API_BASE = "http://localhost:3000"  # Update to match your actual API URL

async def create_sequence(region: str) -> Dict[str, Any]:
    """
    Build an eCTD sequence for a specified region
    
    Args:
        region: Regulatory region (FDA, EMA, PMDA)
        
    Returns:
        Dictionary with operation result
    """
    try:
        # Send request to create a sequence
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE}/api/sequence/create",
                json={"region": region},
                timeout=120.0  # Allow a longer timeout for sequence creation
            )
            
            # Check response
            response.raise_for_status()
            result = response.json()
            
            # Format successful response
            return {
                "success": True,
                "message": f"Sequence created for {region}",
                "sequence_id": result.get("sequence", "unknown"),
                "details": result
            }
    except httpx.HTTPStatusError as e:
        error_message = f"HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(f"Error creating sequence for {region}: {error_message}")
        return {
            "success": False,
            "message": f"Failed to create sequence for {region}",
            "error": error_message
        }
    except Exception as e:
        logger.error(f"Error creating sequence for {region}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to create sequence for {region}",
            "error": str(e)
        }

async def validate_sequence(seq_id: str) -> Dict[str, Any]:
    """
    Run DTD and eValidator on a sequence
    
    Args:
        seq_id: Sequence ID to validate
        
    Returns:
        Dictionary with validation results
    """
    try:
        # Send request to validate a sequence
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE}/api/sequence/validate",
                json={"sequence_id": seq_id},
                timeout=180.0  # Allow a longer timeout for validation
            )
            
            # Check response
            response.raise_for_status()
            result = response.json()
            
            # Extract and format validation status
            validation_passed = result.get("validation_passed", False)
            errors = result.get("errors", [])
            warnings = result.get("warnings", [])
            
            message = "Validation passed" if validation_passed else f"Validation failed with {len(errors)} errors"
            
            return {
                "success": True,
                "message": message,
                "sequence_id": seq_id,
                "validation_passed": validation_passed,
                "error_count": len(errors),
                "warning_count": len(warnings),
                "errors": errors,
                "warnings": warnings
            }
    except httpx.HTTPStatusError as e:
        error_message = f"HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(f"Error validating sequence {seq_id}: {error_message}")
        return {
            "success": False,
            "message": f"Failed to validate sequence {seq_id}",
            "error": error_message
        }
    except Exception as e:
        logger.error(f"Error validating sequence {seq_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to validate sequence {seq_id}",
            "error": str(e)
        }

async def get_sequences(region: str = None, limit: int = 10) -> Dict[str, Any]:
    """
    Get a list of sequences, optionally filtered by region
    
    Args:
        region: Optional region filter
        limit: Maximum number of sequences to return
        
    Returns:
        Dictionary with sequence list
    """
    try:
        # Build query parameters
        params = {}
        if region:
            params["region"] = region
        params["limit"] = limit
        
        # Send request to get sequences
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_BASE}/api/sequences",
                params=params,
                timeout=10.0
            )
            
            # Check response
            response.raise_for_status()
            sequences = response.json()
            
            return {
                "success": True,
                "count": len(sequences),
                "sequences": sequences
            }
    except httpx.HTTPStatusError as e:
        error_message = f"HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(f"Error getting sequences: {error_message}")
        return {
            "success": False,
            "message": "Failed to retrieve sequences",
            "error": error_message
        }
    except Exception as e:
        logger.error(f"Error getting sequences: {str(e)}")
        return {
            "success": False,
            "message": "Failed to retrieve sequences",
            "error": str(e)
        }