"""
Validation Results API Endpoint

This module provides the API endpoints for accessing submission validation results.
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional

router = APIRouter()
logger = logging.getLogger(__name__)

# Sample validation results for demonstration
SAMPLE_VALIDATION_RESULTS = {
    "fda": {
        "1": {
            "id": 1,
            "status": "failed",
            "errors": [
                {
                    "code": "FDA-1571-MISSING",
                    "message": "Form FDA 1571 is missing",
                    "severity": "critical",
                    "location": "m1/us"
                },
                {
                    "code": "FDA-COVERL-LETTERHEAD",
                    "message": "Cover letter must be on company letterhead",
                    "severity": "major",
                    "location": "m1/us/cover-letter.pdf"
                }
            ],
            "warnings": [
                {
                    "code": "FDA-PDF-FORMAT",
                    "message": "PDF document contains non-embedded fonts",
                    "severity": "minor",
                    "location": "m2/summary.pdf"
                }
            ],
            "timestamp": "2025-04-15T14:30:22Z"
        },
        "2": {
            "id": 2,
            "status": "passed",
            "errors": [],
            "warnings": [
                {
                    "code": "FDA-PDF-FORMAT",
                    "message": "PDF document contains non-embedded fonts",
                    "severity": "minor",
                    "location": "m2/summary.pdf"
                }
            ],
            "timestamp": "2025-04-17T09:15:45Z"
        }
    },
    "ema": {
        "1": {
            "id": 1,
            "status": "failed",
            "errors": [
                {
                    "code": "EMA-M1-EULANG",
                    "message": "Module 1 documents require EU language translations",
                    "severity": "critical",
                    "location": "m1/eu"
                }
            ],
            "warnings": [
                {
                    "code": "EMA-SMF-FORMAT",
                    "message": "Site Master File has incorrect format",
                    "severity": "major",
                    "location": "m1/eu/site-master-file.pdf"
                }
            ],
            "timestamp": "2025-04-15T15:45:30Z"
        }
    },
    "pmda": {
        "1": {
            "id": 1,
            "status": "failed",
            "errors": [
                {
                    "code": "PMDA-JPDOC-TRANSLATION",
                    "message": "Japanese translation required for key documents",
                    "severity": "critical",
                    "location": "m1/jp"
                },
                {
                    "code": "PMDA-JPANNEX-MISSING",
                    "message": "Japanese Annex documents are missing",
                    "severity": "critical",
                    "location": "m1/jp/annexes"
                }
            ],
            "warnings": [
                {
                    "code": "PMDA-JTABLE-FORMAT",
                    "message": "Japanese tables have incorrect format",
                    "severity": "major",
                    "location": "m2/summary-jp.pdf"
                }
            ],
            "timestamp": "2025-04-16T08:22:15Z"
        }
    }
}

@router.get("/api/validation/results/{submission_id}")
async def get_validation_results(
    submission_id: str,
    region: str = Query(..., description="Regulatory region (FDA, EMA, PMDA)"),
    include_warnings: bool = Query(True, description="Include warnings in results")
) -> Dict[str, Any]:
    """
    Get validation results for a submission.
    
    Args:
        submission_id: The ID of the submission
        region: The regulatory region (FDA, EMA, PMDA)
        include_warnings: Whether to include warnings in the results
        
    Returns:
        Dictionary with validation results
    """
    try:
        logger.info(f"Validation results requested for submission {submission_id} in region {region}")
        
        # Convert region to lowercase for consistent handling
        region = region.lower()
        
        # Check if region is valid
        if region not in ["fda", "ema", "pmda"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid region: {region}. Must be one of: fda, ema, pmda"
            )
        
        # Check if submission exists
        if submission_id not in SAMPLE_VALIDATION_RESULTS.get(region, {}):
            # For demo purposes, return the first result if available
            if len(SAMPLE_VALIDATION_RESULTS.get(region, {})) > 0:
                first_key = next(iter(SAMPLE_VALIDATION_RESULTS[region]))
                result = SAMPLE_VALIDATION_RESULTS[region][first_key]
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"No validation results found for submission {submission_id} in region {region}"
                )
        else:
            result = SAMPLE_VALIDATION_RESULTS[region][submission_id]
        
        # If warnings should not be included, remove them
        if not include_warnings:
            result = {**result, "warnings": []}
        
        return {
            "submission_id": submission_id,
            "region": region,
            "results": result
        }
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        logger.error(f"Error retrieving validation results for submission {submission_id}: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving validation results: {str(e)}"
        )


@router.get("/api/validation/summary")
async def get_validation_summary(
    region: Optional[str] = Query(None, description="Filter by region (FDA, EMA, PMDA)")
) -> Dict[str, Any]:
    """
    Get a summary of all validation results.
    
    Args:
        region: Optional filter by region
        
    Returns:
        Dictionary with validation summary
    """
    try:
        if region:
            region = region.lower()
            if region not in ["fda", "ema", "pmda"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid region: {region}. Must be one of: fda, ema, pmda"
                )
            
            # Filter results by region
            regions_to_include = [region]
        else:
            # Include all regions
            regions_to_include = ["fda", "ema", "pmda"]
        
        # Generate summary
        summary = {
            "total_submissions": 0,
            "passed": 0,
            "failed": 0,
            "total_errors": 0,
            "total_warnings": 0,
            "by_region": {}
        }
        
        for reg in regions_to_include:
            region_results = SAMPLE_VALIDATION_RESULTS.get(reg, {})
            region_summary = {
                "total_submissions": len(region_results),
                "passed": 0,
                "failed": 0,
                "total_errors": 0,
                "total_warnings": 0
            }
            
            for _, result in region_results.items():
                summary["total_submissions"] += 1
                region_summary["passed"] += 1 if result["status"] == "passed" else 0
                region_summary["failed"] += 1 if result["status"] == "failed" else 0
                region_summary["total_errors"] += len(result["errors"])
                region_summary["total_warnings"] += len(result["warnings"])
                
                summary["passed"] += 1 if result["status"] == "passed" else 0
                summary["failed"] += 1 if result["status"] == "failed" else 0
                summary["total_errors"] += len(result["errors"])
                summary["total_warnings"] += len(result["warnings"])
            
            summary["by_region"][reg] = region_summary
        
        return summary
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        logger.error(f"Error retrieving validation summary: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving validation summary: {str(e)}"
        )


@router.get("/api/validation/history/{submission_id}")
async def get_validation_history(
    submission_id: str,
    region: str = Query(..., description="Regulatory region (FDA, EMA, PMDA)"),
    limit: int = Query(10, description="Maximum number of results to return")
) -> Dict[str, Any]:
    """
    Get historical validation results for a submission.
    
    Args:
        submission_id: The ID of the submission
        region: The regulatory region
        limit: Maximum number of results to return
        
    Returns:
        Dictionary with historical validation results
    """
    try:
        logger.info(f"Validation history requested for submission {submission_id} in region {region}")
        
        # Convert region to lowercase for consistent handling
        region = region.lower()
        
        # Check if region is valid
        if region not in ["fda", "ema", "pmda"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid region: {region}. Must be one of: fda, ema, pmda"
            )
        
        # For demo purposes, generate a simple history
        history = [
            {
                "id": f"val-{submission_id}-1",
                "timestamp": "2025-04-10T10:30:45Z",
                "status": "failed",
                "error_count": 3,
                "warning_count": 2
            },
            {
                "id": f"val-{submission_id}-2",
                "timestamp": "2025-04-12T14:22:15Z",
                "status": "failed",
                "error_count": 2,
                "warning_count": 1
            },
            {
                "id": f"val-{submission_id}-3",
                "timestamp": "2025-04-15T09:15:30Z",
                "status": "passed",
                "error_count": 0,
                "warning_count": 1
            }
        ][:limit]
        
        return {
            "submission_id": submission_id,
            "region": region,
            "history": history
        }
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    
    except Exception as e:
        logger.error(f"Error retrieving validation history for submission {submission_id}: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving validation history: {str(e)}"
        )