# ingestion/fda_device.py
import requests
from bs4 import BeautifulSoup
import json
import os
import time
from pathlib import Path

BASE_URL = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm"
CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "cache"
CACHE_TTL = 300  # 5 minutes cache expiry

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

def fetch_all_fda_device_complaints(device_code: str):
    """
    Fetch all FDA MAUDE device complaints for a given device_code, handling pagination.
    
    Args:
        device_code: The device code to query
        
    Returns:
        List of all complaints for the given device code
    """
    session = requests.Session()
    params = {"device": device_code}
    complaints = []
    page_count = 0
    
    # Initial URL with query params
    url = BASE_URL
    
    try:
        print(f"Fetching FDA MAUDE data for device code: {device_code}")
        
        # Loop through all pages
        while True:
            page_count += 1
            print(f"Fetching page {page_count}...")
            
            response = session.get(url, params=params, timeout=15)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Parse table rows
            table = soup.find("table", {"id": "resultTable"})
            if not table:
                # No results table found
                if page_count == 1:
                    print(f"No results found for device code: {device_code}")
                break
            
            rows = table.find_all("tr")
            if len(rows) <= 1:  # Just the header row
                if page_count == 1:
                    print(f"No results found for device code: {device_code}")
                break
                
            # Parse data rows (skip header row)
            for row in rows[1:]:
                cols = row.find_all("td")
                if len(cols) >= 4:  # Ensure we have all required columns
                    complaints.append({
                        "complaint_id": cols[0].get_text(strip=True),
                        "device_name": cols[1].get_text(strip=True),
                        "complaint_date": cols[2].get_text(strip=True),
                        "narrative": cols[3].get_text(strip=True),
                    })
            
            # Find "Next" link to paginate
            next_link = None
            for link in soup.find_all("a"):
                if link.get_text(strip=True) == "Next":
                    next_link = link
                    break
                    
            if next_link and next_link.get("href"):
                # The href may be relative; build absolute URL
                next_url = next_link["href"]
                if next_url.startswith("http"):
                    url = next_url
                else:
                    # For relative URLs, join with the base URL
                    url = BASE_URL[:BASE_URL.rfind("/")+1] + next_url
                # After the first page, clear params to follow direct href
                params = {}
                
                # Add a small delay to avoid overloading the server
                time.sleep(0.5)
            else:
                # No next link, we've reached the end
                break
                
        print(f"Fetched {len(complaints)} complaints for device code {device_code} from {page_count} pages")
        return complaints
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching FDA MAUDE data: {e}")
        return []

def get_cache_path(device_code: str):
    """Get the path to the cache file for a given device code"""
    return CACHE_DIR / f"maude_{device_code}.json"

def get_device_complaints_cached(device_code: str):
    """
    Get device complaints with caching
    
    Args:
        device_code: The device code to query
        
    Returns:
        Cached or freshly fetched complaints
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
    data = fetch_all_fda_device_complaints(device_code)
    
    # Save to cache
    try:
        with open(cache_path, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Error caching FDA MAUDE data: {e}")
    
    return data

def fetch_fda_device_complaints(device_code: str):
    """
    Scrape FDA Device Complaint Database for entries matching device_code.
    This is a wrapper around the cached version for backward compatibility.
    
    Returns a list of dicts with keys: complaint_id, device_name, complaint_date, narrative.
    """
    return get_device_complaints_cached(device_code)