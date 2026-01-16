"""
Validation Profiles API

This module provides endpoints for accessing and managing validation profiles
for different regulatory regions (FDA, EMA, PMDA).
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path

# Import validator manager
from server.utils.validator_manager import get_validator_profile, get_rules_for_region

# Set up logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/validation", tags=["validation"])

@router.get("/profiles")
async def get_validation_profiles() -> Dict[str, Any]:
    """
    Get all available validation profiles.
    
    Returns:
        Dictionary containing validation profiles for all supported regions
    """
    try:
        # Get profiles for all supported regions
        profiles = {
            "FDA": get_validator_profile("FDA"),
            "EMA": get_validator_profile("EMA"),
            "PMDA": get_validator_profile("PMDA")
        }
        
        return {
            "status": "success",
            "profiles": profiles
        }
    except Exception as e:
        logger.error(f"Error retrieving validation profiles: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve validation profiles: {str(e)}"
        )

@router.get("/profiles/{region}")
async def get_region_validation_profile(
    region: str = Path(..., description="Regulatory region (FDA, EMA, PMDA)")
) -> Dict[str, Any]:
    """
    Get validation profile for a specific region.
    
    Args:
        region: Regulatory region code
        
    Returns:
        Dictionary containing validation profile for the specified region
    """
    try:
        # Get profile for the specified region
        profile = get_validator_profile(region.upper())
        
        return {
            "status": "success",
            "profile": profile
        }
    except Exception as e:
        logger.error(f"Error retrieving validation profile for {region}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve validation profile for {region}: {str(e)}"
        )

@router.get("/rules/{region}")
async def get_validation_rules(
    region: str = Path(..., description="Regulatory region (FDA, EMA, PMDA)")
) -> Dict[str, Any]:
    """
    Get validation rules for a specific region.
    
    Args:
        region: Regulatory region code
        
    Returns:
        Dictionary containing validation rules for the specified region
    """
    try:
        # Get rules for the specified region
        rules = get_rules_for_region(region.upper())
        
        return {
            "status": "success",
            "rules": rules
        }
    except Exception as e:
        logger.error(f"Error retrieving validation rules for {region}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve validation rules for {region}: {str(e)}"
        )