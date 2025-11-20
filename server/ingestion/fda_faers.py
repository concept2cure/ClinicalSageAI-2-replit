# ingestion/fda_faers.py
import requests
import json
import os
import time
from pathlib import Path

FAERS_API_URL = "https://api.fda.gov/drug/event.json"
CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "cache"
CACHE_TTL = 300  # 5 minutes cache expiry

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

def get_generic_drug_name(ndc_code: str) -> str:
    """Try to find the generic name for an NDC code"""
    # This is a simplified approach - in production, you would use a real drug database
    # For now, we'll use a local mapping of common examples
    common_drugs = {
        "00009-0029": "insulin",  
        "00071-0155": "penicillin",
        "50580-506": "acetaminophen",
        "00002-3227": "fluoxetine", 
        "00093-7146": "metformin",
        "00378-1532": "lisinopril"
    }
    
    # Check our simple map first
    generic_name = common_drugs.get(ndc_code)
    if generic_name:
        return generic_name
    
    # For unknown NDCs, try to look up in the OpenFDA NDC directory
    # (This is a real API but we're simplifying for the example)
    try:
        url = f"https://api.fda.gov/drug/ndc.json?search=product_ndc:{ndc_code}&limit=1"
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            if "results" in data and len(data["results"]) > 0:
                # Try to find generic name in the openfda section
                openfda = data["results"][0].get("openfda", {})
                if "generic_name" in openfda and len(openfda["generic_name"]) > 0:
                    return openfda["generic_name"][0].lower()
                # Fall back to brand name if available
                if "brand_name" in openfda and len(openfda["brand_name"]) > 0:
                    return openfda["brand_name"][0].lower()
    except Exception as e:
        print(f"Error looking up NDC: {e}")
    
    # If all else fails, return None
    return None

def fetch_all_faers(ndc_code: str, page_size: int = 100, use_generic: bool = True, max_records: int = 100):
    """
    Fetch FAERS entries for a given NDC code or generic drug name, handling pagination.
    
    Args:
        ndc_code: The NDC code or drug name to query
        page_size: Number of records per page
        use_generic: If True, try to find the generic name from NDC and search by that instead
        max_records: Maximum number of records to fetch (for demo purposes)
        
    Returns:
        List of records for the given NDC code or drug name (limited to max_records)
    """
    base_url = FAERS_API_URL
    results = []
    skip = 0
    
    # Build the search query
    # First check if the input looks like an NDC code (digits and hyphens)
    is_ndc = all(c.isdigit() or c == '-' for c in ndc_code)
    
    if is_ndc:
        query = f'openfda.product_ndc:"{ndc_code}"'
        
        # Try to fetch a single record to check if this NDC has any data
        try:
            check_params = {"search": query, "limit": 1}
            test_response = requests.get(base_url, params=check_params, timeout=15)
            test_response.raise_for_status()
            
            # If we successfully get data, continue with this query
            if test_response.status_code == 200:
                test_data = test_response.json()
                if test_data.get("meta", {}).get("results", {}).get("total", 0) > 0:
                    # NDC search works, continue with it
                    print(f"Using NDC code search for {ndc_code}")
                elif use_generic:
                    # Try to find a generic name for this NDC
                    generic_name = get_generic_drug_name(ndc_code)
                    if generic_name:
                        print(f"Switching to generic name search for {generic_name}")
                        query = f'patient.drug.openfda.generic_name:"{generic_name}"'
        except Exception as e:
            # If the NDC check fails but generic search is enabled, try that instead
            if use_generic:
                # Try to derive a generic name from the NDC (simplified)
                generic_name = get_generic_drug_name(ndc_code)
                if generic_name:
                    print(f"Switching to generic name search for {generic_name}")
                    query = f'patient.drug.openfda.generic_name:"{generic_name}"'
    else:
        # If not an NDC, assume it's a drug name
        query = f'patient.drug.openfda.generic_name:"{ndc_code}" OR patient.drug.medicinalproduct:"{ndc_code}"'
    
    try:
        # First request to get total count
        params = {"search": query, "limit": page_size, "skip": skip}
        response = requests.get(base_url, params=params, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        total = data["meta"]["results"]["total"]
        
        # Add first batch of results, up to max_records
        if "results" in data:
            first_batch = data["results"][:max_records]
            results.extend(first_batch)
        
        # Fetch remaining pages, up to max_records
        while len(results) < total and len(results) < max_records:
            skip += page_size
            params["skip"] = skip
            
            # Add delay to avoid rate limits
            time.sleep(0.2)
            
            try:
                response = requests.get(base_url, params=params, timeout=15)
                response.raise_for_status()
                
                data = response.json()
                if "results" in data:
                    # Only add enough to reach max_records
                    remaining = max_records - len(results)
                    if remaining > 0:
                        results.extend(data["results"][:remaining])
                    else:
                        break
                else:
                    print(f"Warning: No results in page {skip//page_size + 1}")
                    break
                    
            except requests.exceptions.RequestException as e:
                print(f"Error fetching page {skip//page_size + 1}: {e}")
                break
        
        print(f"Fetched {len(results)} FAERS records out of {total} total for NDC {ndc_code}")
        return results
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching FAERS data: {e}")
        return []

def get_cache_path(ndc_code: str):
    """Get the path to the cache file for a given NDC code"""
    return CACHE_DIR / f"faers_{ndc_code}.json"

def get_faers_cached(ndc_code: str):
    """
    Get FAERS data with caching
    
    Args:
        ndc_code: The NDC code to query
        
    Returns:
        Cached or freshly fetched data
    """
    cache_path = get_cache_path(ndc_code)
    
    # Check if cache exists and is fresh
    if cache_path.exists():
        cache_age = time.time() - cache_path.stat().st_mtime
        if cache_age < CACHE_TTL:
            try:
                with open(cache_path, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                print(f"Cache file corrupted for {ndc_code}, fetching fresh data")
    
    # Fetch fresh data
    data = fetch_all_faers(ndc_code)
    
    # Save to cache
    try:
        with open(cache_path, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Error caching FAERS data: {e}")
    
    return data

def fetch_faers_data(ndc_code: str, limit: int = 100):
    """
    Query FAERS (via OpenFDA) for adverse events filtered by NDC code.
    This is a simplified wrapper that returns a compatible format with the 
    original function, for backward compatibility.
    
    Args:
        ndc_code: The NDC code to query
        limit: Maximum records to return (for API compatibility)
        
    Returns:
        The raw API response format with results limited to 'limit'
    """
    all_results = get_faers_cached(ndc_code)
    
    # Truncate to requested limit
    limited_results = all_results[:limit] if limit else all_results
    
    # Build a response object in the same format as the FDA API
    response = {
        "meta": {
            "disclaimer": "Data from FDA Adverse Event Reporting System (FAERS)",
            "results": {
                "skip": 0,
                "limit": limit,
                "total": len(all_results)
            }
        },
        "results": limited_results
    }
    
    return response