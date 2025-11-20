"""
Data Pipeline Module for LumenTrialGuide.AI

This module handles data fetching, transformation, and integration
with the Redis caching layer for optimized performance.
"""

import os
import logging
import json
import time
from typing import Dict, List, Any, Optional, Union
import httpx
from datetime import datetime, timedelta

from redis_cache import cache

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
FAERS_API_BASE_URL = os.environ.get('FAERS_API_URL', 'https://api.fda.gov/drug/event.json')
FAERS_API_KEY = os.environ.get('FAERS_API_KEY', '')
DEFAULT_CACHE_TTL = 86400  # 24 hours in seconds


async def fetch_faers_data(
    ndc_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    use_cache: bool = True,
    cache_ttl: int = DEFAULT_CACHE_TTL
) -> Dict[str, Any]:
    """
    Fetch adverse event data from the FDA FAERS API with caching.
    
    Args:
        ndc_code: The NDC product code to search for
        start_date: Start date in 'YYYYMMDD' format (default: 1 year ago)
        end_date: End date in 'YYYYMMDD' format (default: today)
        limit: Maximum number of records to return
        use_cache: Whether to use Redis cache
        cache_ttl: Cache time-to-live in seconds
        
    Returns:
        Dictionary containing the API response or cached data
    """
    # Generate default dates if not provided
    if not end_date:
        end_date = datetime.now().strftime('%Y%m%d')
    
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y%m%d')
    
    # Create cache key based on parameters
    cache_key = f"faers_data:{ndc_code}:{start_date}:{end_date}:{limit}"
    
    # Try to get from cache if enabled
    if use_cache:
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"Cache HIT for FAERS data: {cache_key}")
            return cached_data
    
    logger.info(f"Cache MISS for FAERS data: {cache_key}, fetching from API")
    
    # Build the API query
    query = f'search=(product.product_ndc:"{ndc_code}")' + \
            f'+AND+receivedate:[{start_date}+TO+{end_date}]'
    
    url = f"{FAERS_API_BASE_URL}?api_key={FAERS_API_KEY}&search={query}&limit={limit}"
    
    try:
        # Make the API request
        async with httpx.AsyncClient() as client:
            start_time = time.time()
            response = await client.get(url, timeout=30.0)
            elapsed_time = time.time() - start_time
            
            logger.info(f"FAERS API call completed in {elapsed_time:.2f}s")
            
            # Check if request was successful
            response.raise_for_status()
            
            # Parse the response
            data = response.json()
            
            # Store in cache if enabled
            if use_cache and data:
                cache.set(cache_key, data, ttl=cache_ttl)
                logger.info(f"Cached FAERS data: {cache_key}, TTL: {cache_ttl}s")
            
            return data
    
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error from FAERS API: {e.response.status_code} - {e.response.text}")
        raise
    except httpx.RequestError as e:
        logger.error(f"Error making request to FAERS API: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error fetching FAERS data: {str(e)}")
        raise


async def get_adverse_events_by_product(
    ndc_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    use_cache: bool = True
) -> Dict[str, int]:
    """
    Get a summary of adverse events by type for a specific product.
    
    Args:
        ndc_code: The NDC product code
        start_date: Start date in 'YYYYMMDD' format
        end_date: End date in 'YYYYMMDD' format
        use_cache: Whether to use caching
        
    Returns:
        Dictionary mapping event types to count
    """
    # Create a function that will be called on cache miss
    async def fetch_and_process():
        data = await fetch_faers_data(
            ndc_code=ndc_code,
            start_date=start_date,
            end_date=end_date,
            limit=1000,
            use_cache=use_cache
        )
        
        # Process the response to extract event counts
        event_counts = {}
        
        if 'results' in data:
            for report in data['results']:
                if 'patient' in report and 'reaction' in report['patient']:
                    for reaction in report['patient']['reaction']:
                        if 'reactionmeddrapt' in reaction:
                            event_name = reaction['reactionmeddrapt']
                            event_counts[event_name] = event_counts.get(event_name, 0) + 1
        
        # Sort by count (descending)
        return dict(sorted(event_counts.items(), key=lambda x: x[1], reverse=True))
    
    # Create cache key
    cache_key = f"adverse_events:{ndc_code}:{start_date or 'default'}:{end_date or 'default'}"
    
    # Use the get_with_fallback method which handles cache lookup and fallback
    if use_cache:
        try:
            return await cache.get_with_fallback(
                key=cache_key,
                fallback_function=fetch_and_process,
                ttl=DEFAULT_CACHE_TTL
            )
        except Exception as e:
            logger.error(f"Error with cached adverse events retrieval: {str(e)}")
            # Fall back to direct fetch on cache error
            return await fetch_and_process()
    else:
        # Skip cache entirely
        return await fetch_and_process()


async def get_event_forecast(
    ndc_code: str,
    event_name: str,
    periods: int = 4,
    use_cache: bool = True
) -> Dict[str, int]:
    """
    Generate a simple forecast for a specific adverse event.
    
    Args:
        ndc_code: The NDC product code
        event_name: Name of the adverse event
        periods: Number of forecast periods (quarters)
        use_cache: Whether to use caching
        
    Returns:
        Dictionary mapping future quarters to predicted counts
    """
    # Cache key for this forecast
    cache_key = f"forecast:{ndc_code}:{event_name}:{periods}"
    
    # Check cache first if enabled
    if use_cache:
        cached_forecast = cache.get(cache_key)
        if cached_forecast:
            logger.info(f"Cache HIT for forecast: {cache_key}")
            return cached_forecast
    
    # Get historical data for the last 2 years
    end_date = datetime.now().strftime('%Y%m%d')
    start_date = (datetime.now() - timedelta(days=730)).strftime('%Y%m%d')
    
    try:
        # Get historical event data
        events_data = await get_adverse_events_by_product(
            ndc_code=ndc_code,
            start_date=start_date,
            end_date=end_date,
            use_cache=use_cache
        )
        
        # Get count for the specific event
        event_count = events_data.get(event_name, 0)
        
        # For this simplified example, we'll just project a simple trend
        # In a real implementation, this would use more sophisticated time series analysis
        forecast = {}
        current_quarter = datetime.now().month // 3 + 1
        current_year = datetime.now().year
        
        # Base value - in a real implementation this would be based on historical trends
        base_value = max(1, event_count // 8)  # Assuming the historical data spans 8 quarters
        
        # Generate quarterly forecast with a simple trend
        for i in range(periods):
            quarter = (current_quarter + i) % 4
            if quarter == 0:
                quarter = 4
            year = current_year + ((current_quarter + i - 1) // 4)
            
            # Simple trend with some variation
            # In a real implementation, this would use actual time series forecasting
            quarter_value = max(1, round(base_value * (1 + 0.05 * (i - periods // 2))))
            
            # Format as "2023 Q1"
            period_key = f"{year} Q{quarter}"
            forecast[period_key] = quarter_value
        
        # Cache the forecast
        if use_cache:
            cache.set(cache_key, forecast, ttl=86400)  # Cache for 24 hours
        
        return forecast
    
    except Exception as e:
        logger.error(f"Error generating forecast for {event_name}: {str(e)}")
        # Return empty forecast on error
        return {}