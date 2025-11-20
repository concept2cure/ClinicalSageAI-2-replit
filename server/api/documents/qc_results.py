"""
QC Results API module.

This module provides sample QC results for testing the risk analyzer.
"""
from fastapi import APIRouter, Query
from typing import List, Dict, Any, Optional
import random

router = APIRouter()

# Sample QC results
SAMPLE_QC_RESULTS = {
    "fda": [
        {
            "id": 101,
            "document_name": "Form 1571",
            "module": "m1.2",
            "status": "passed",
            "severity": "minor",
            "issues": []
        },
        {
            "id": 102,
            "document_name": "Protocol Amendment 2",
            "module": "m5.3.5",
            "status": "failed",
            "severity": "critical",
            "issues": [
                "Invalid document format for eCTD submission",
                "Missing page numbers",
                "References section incomplete"
            ]
        },
        {
            "id": 103,
            "document_name": "Clinical Overview",
            "module": "m2.5",
            "status": "failed",
            "severity": "major",
            "issues": [
                "Missing safety information",
                "Inconsistent data presentation"
            ]
        }
    ],
    "ema": [
        {
            "id": 201,
            "document_name": "EU Application Form",
            "module": "m1.2",
            "status": "passed",
            "severity": "minor",
            "issues": []
        },
        {
            "id": 202,
            "document_name": "SmPC",
            "module": "m1.3",
            "status": "failed",
            "severity": "critical",
            "issues": [
                "Not compliant with QRD template",
                "Missing member state translations"
            ]
        },
        {
            "id": 203,
            "document_name": "Pediatric Investigation Plan",
            "module": "m1.10",
            "status": "failed",
            "severity": "major",
            "issues": [
                "Incomplete waiver documentation",
                "Missing PDCO opinion"
            ]
        }
    ],
    "pmda": [
        {
            "id": 301,
            "document_name": "Japanese Application Form",
            "module": "m1.2",
            "status": "passed",
            "severity": "minor",
            "issues": []
        },
        {
            "id": 302,
            "document_name": "Japanese Labeling",
            "module": "m1.13",
            "status": "failed",
            "severity": "critical",
            "issues": [
                "Missing Japanese translation",
                "Format not compliant with PMDA requirements"
            ]
        },
        {
            "id": 303,
            "document_name": "JP Specific Attachment",
            "module": "jp-annex",
            "status": "failed",
            "severity": "major",
            "issues": [
                "Incorrect folder structure",
                "Missing required documents"
            ]
        }
    ]
}

@router.get("/api/documents/qc-results")
async def get_qc_results(
    submission_id: Optional[int] = Query(None, description="Submission ID"),
    region: str = Query("FDA", description="Regulatory region (FDA, EMA, PMDA)")
) -> List[Dict[str, Any]]:
    """
    Get QC results for a submission.
    
    Args:
        submission_id: Optional submission ID
        region: Regulatory region
        
    Returns:
        List of QC results
    """
    region_key = region.lower()
    
    # Get region-specific QC results
    if region_key in SAMPLE_QC_RESULTS:
        results = SAMPLE_QC_RESULTS[region_key]
    else:
        results = SAMPLE_QC_RESULTS["fda"]
    
    # Add some random variation based on submission ID if provided
    if submission_id is not None:
        # Use submission ID as seed for consistent randomization
        random.seed(submission_id)
        
        # Modify status of some results
        for result in results:
            # 30% chance to flip status
            if random.random() < 0.3:
                result["status"] = "failed" if result["status"] == "passed" else "passed"
                
                # Update issues if status changed
                if result["status"] == "passed":
                    result["issues"] = []
                elif result["status"] == "failed" and not result["issues"]:
                    result["issues"] = ["Random issue for testing"]
    
    return results