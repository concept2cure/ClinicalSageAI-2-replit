"""
Region-specific Rules API

This module provides endpoints for retrieving region-specific rules
for regulatory submissions.
"""

import sys
import os
import logging
from typing import Dict, List, Any

# Add parent path to allow imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# FastAPI imports
from fastapi import APIRouter, HTTPException, Path

# Import region rules
from utils.region_rules import get_required_modules, REGION_RULES

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/region", tags=["region"])

@router.get("/{region_code}/required-modules")
async def get_required_modules_for_region(
    region_code: str = Path(..., description="Region code (FDA, EMA, PMDA)")
) -> Dict[str, Any]:
    """
    Get required modules for a specific region
    
    Args:
        region_code: Region code (FDA, EMA, PMDA)
        
    Returns:
        Dictionary with required modules and other region information
    """
    region_code = region_code.upper()
    
    if region_code not in REGION_RULES:
        raise HTTPException(status_code=404, detail=f"Region {region_code} not found")
    
    required_modules = get_required_modules(region_code)
    region_info = REGION_RULES.get(region_code, {})
    display_name = region_info.get('display', region_code)
    
    return {
        "region": region_code,
        "display_name": display_name,
        "required_modules": required_modules
    }

@router.get("/")
async def list_regions() -> Dict[str, Any]:
    """
    List all available regions
    
    Returns:
        Dictionary with available regions and their display names
    """
    regions = []
    
    for code, info in REGION_RULES.items():
        regions.append({
            "code": code,
            "display_name": info.get('display', code)
        })
    
    return {
        "regions": regions
    }