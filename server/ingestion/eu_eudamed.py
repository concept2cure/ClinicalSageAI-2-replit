# ingestion/eu_eudamed.py
import requests
from bs4 import BeautifulSoup
import json
import os
import time
from pathlib import Path

BASE_URL = "https://ec.europa.eu/tools/eudamed/eudamed"
CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "cache"
CACHE_TTL = 3600  # 1 hour cache expiry (longer since this is a stub)

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

def fetch_eudamed_data(device_code: str):
    """
    Placeholder for EU Eudamed ingestion.
    Currently returns a notice; update this when an official API or scrape strategy is available.
    
    Args:
        device_code: The device code to query
        
    Returns:
        Dictionary with placeholder Eudamed data
    """
    # Example of how you *might* scrape if an HTML table existed:
    # resp = requests.get(f"{BASE_URL}/search?device={device_code}", timeout=10)
    # soup = BeautifulSoup(resp.text, "html.parser")
    # ...parse tables...
    
    # For now, return structured placeholder data
    return {
        "source": "EU_Eudamed",
        "device_code": device_code,
        "count": 0,  # No actual records yet
        "message": (
            "Programmatic access to Eudamed is not yet available. "
            "This connector is a stub—implement scraping or API calls when Eudamed opens API access."
        ),
        "vigilance_reports": [],
        "metadata": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "notes": "This is placeholder data until Eudamed API or scraping becomes available"
        }
    }

def get_cache_path(device_code: str):
    """Get the path to the cache file for a given device code"""
    return CACHE_DIR / f"eudamed_{device_code}.json"

def get_eudamed_cached(device_code: str):
    """
    Get Eudamed data with caching
    
    Args:
        device_code: The device code to query
        
    Returns:
        Cached or freshly fetched data
    """
    cache_path = get_cache_path(device_code)
    
    # Check if cache exists and is fresh
    if cache_path.exists():
        cache_age = time.time() - cache_path.stat().st_mtime
        if cache_age < CACHE_TTL:
            try:
                with open(cache_path, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                print(f"Cache file corrupted for {device_code}, fetching fresh data")
    
    # Fetch fresh data
    data = fetch_eudamed_data(device_code)
    
    # Save to cache
    try:
        with open(cache_path, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Error caching Eudamed data: {e}")
    
    return data