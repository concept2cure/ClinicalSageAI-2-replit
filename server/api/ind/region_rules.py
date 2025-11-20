"""
Region Rules API Endpoint

This module provides the API endpoints for checking required modules per region.
"""
import logging
from fastapi import APIRouter, HTTPException, Query

from ...utils.region_rules import missing_modules

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get('/api/ind/region-rules')
async def region_rules(
    region: str = Query('FDA', regex='^(FDA|EMA|PMDA)$'), 
    modules: str = ''
):
    """
    Get missing required modules for a specific region.
    
    Args:
        region: Regulatory region (FDA, EMA, PMDA)
        modules: Comma-separated list of included modules
        
    Returns:
        Dictionary with list of missing modules
    """
    try:
        logger.info(f"Region rules requested for {region} with modules: {modules}")
        
        # Convert modules parameter to a set
        mod_set = set(modules.split(',')) if modules else set()
        
        # Get missing modules
        missing = missing_modules(region, mod_set)
        
        return {"missing": missing}
    
    except Exception as e:
        logger.error(f"Error processing region rules: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error processing region rules: {str(e)}"
        )