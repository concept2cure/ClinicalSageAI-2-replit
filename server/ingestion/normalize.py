# ingestion/normalize.py
from datetime import datetime

def _to_iso(date_str):
    """
    Convert common date formats to ISO 8601 (YYYY-MM-DD).
    Returns None if parsing fails.
    """
    if not date_str:
        return None
        
    # Handle already ISO format
    if isinstance(date_str, str) and len(date_str) >= 10 and date_str[4] == '-' and date_str[7] == '-':
        return date_str[:10]  # Return just the date part
        
    for fmt in ("%m/%d/%Y", "%Y%m%d", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).date().isoformat()
        except (ValueError, TypeError):
            continue
    return None

def normalize_faers(raw_data, ndc_code: str):
    """
    Normalize FAERS data to common schema.
    
    Args:
        raw_data: JSON from FAERS API (list of results under raw_data['results'])
        ndc_code: The NDC code or drug name used for the query
        
    Returns:
        List of normalized records
    """
    if isinstance(raw_data, dict) and "results" in raw_data:
        results = raw_data.get("results", [])
    elif isinstance(raw_data, list):
        results = raw_data
    else:
        results = []
        
    normalized = []
    
    for rec in results:
        # Extract reaction information
        description = ""
        reactions = rec.get("patient", {}).get("reaction", [])
        if reactions and len(reactions) > 0:
            description = reactions[0].get("reactionmeddrapt", "")
            
        # Fall back to generic adverse event text if no specific reaction found
        if not description:
            description = "Adverse drug event reported"
            
        # Get record ID
        rec_id = rec.get("safetyreportid", "")
        
        # Get event date
        date_raw = rec.get("receiptdate", "")
        
        normalized.append({
            "source": "FAERS",
            "record_id": str(rec_id),
            "product_code": ndc_code,
            "event_type": "adverse_event",
            "event_date": _to_iso(date_raw),
            "description": description,
            "count": int(rec.get("count", 1)),
            "serious": rec.get("serious", "0") == "1",
            "raw_data": rec  # Include the raw data for reference
        })
    
    return normalized

def normalize_maude(raw_complaints, device_code: str):
    """
    Normalize MAUDE device complaint data to common schema.
    
    Args:
        raw_complaints: List of dicts from get_device_complaints_cached()
        device_code: The device code used for the query
        
    Returns:
        List of normalized records
    """
    normalized = []
    
    if not raw_complaints:
        return normalized
        
    for rec in raw_complaints:
        rec_id = rec.get("complaint_id", "")
        date_raw = rec.get("complaint_date", "")
        description = rec.get("narrative", "")
        
        # If no narrative provided, use event type
        if not description:
            description = rec.get("event_type", "Device complaint reported")
            
        normalized.append({
            "source": "MAUDE",
            "record_id": str(rec_id),
            "product_code": device_code,
            "event_type": "device_complaint",
            "event_date": _to_iso(date_raw),
            "description": description,
            "count": 1,
            "serious": rec.get("is_serious", False),
            "raw_data": rec  # Include the raw data for reference
        })
    
    return normalized

def normalize_eudamed(raw_data, device_code=None):
    """
    Normalize Eudamed data to common schema (currently a stub).
    
    Args:
        raw_data: Dict from get_eudamed_cached()
        device_code: Optional override for device code
        
    Returns:
        List of normalized records (currently just a placeholder)
    """
    product_code = device_code or raw_data.get("device_code", "")
    
    # Since this is a stub with no real data yet, return a minimal record
    return [{
        "source": "Eudamed",
        "record_id": f"stub_{product_code}",
        "product_code": product_code,
        "event_type": "eudamed_info",
        "event_date": datetime.now().date().isoformat(),
        "description": raw_data.get("message", "No Eudamed data available yet"),
        "count": 0,
        "serious": False,
        "raw_data": raw_data
    }]

def normalize_all_sources(faers_data=None, maude_data=None, eudamed_data=None, product_code=None):
    """
    Normalize data from all sources into a single unified list.
    
    Args:
        faers_data: Optional FAERS data
        maude_data: Optional MAUDE data
        eudamed_data: Optional Eudamed data
        product_code: The product code to use if data source doesn't specify one
        
    Returns:
        List of normalized records from all sources
    """
    normalized = []
    
    if faers_data:
        normalized.extend(normalize_faers(faers_data, product_code or ""))
        
    if maude_data:
        normalized.extend(normalize_maude(maude_data, product_code or ""))
        
    if eudamed_data:
        normalized.extend(normalize_eudamed(eudamed_data, product_code))
        
    return normalized