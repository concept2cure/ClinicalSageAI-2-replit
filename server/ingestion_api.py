"""
FDA Data Ingestion API
This module provides a FastAPI interface to ingest data from various FDA sources.
"""

from fastapi import FastAPI, HTTPException
import uvicorn
from typing import Optional, Dict, Any, List

# Import data connectors and analytics tools
import pandas as pd
from ingestion.fda_faers import get_faers_cached
from ingestion.fda_device import get_device_complaints_cached
from ingestion.eu_eudamed import get_eudamed_cached
from ingestion.normalize import normalize_faers, normalize_maude, normalize_eudamed, normalize_all_sources
from predictive_analytics import aggregate_time_series, forecast_adverse_events, detect_anomalies

app = FastAPI(
    title="FDA Data Ingestion API",
    description="API for ingesting data from FDA FAERS, MAUDE, and EU EUDAMED",
    version="1.0.0"
)

@app.get("/")
async def root():
    """Root endpoint returning API information"""
    return {
        "name": "FDA Data Ingestion and Analysis API",
        "version": "1.0.0",
        "endpoints": {
            "ingestion": [
                "/api/ingest/drug/{ndc_code}",
                "/api/ingest/device/{device_code}",
                "/api/ingest/eu/{product_code}"
            ],
            "normalization": [
                "/api/norm/drug/{ndc_code}",
                "/api/norm/device/{device_code}",
                "/api/norm/eu/{product_code}",
                "/api/norm/combined/{product_code}"
            ],
            "analytics": [
                "/api/analytics/trend/faers/{ndc_code}",
                "/api/analytics/forecast/faers/{ndc_code}",
                "/api/analytics/anomalies/faers/{ndc_code}",
                "/api/analytics/trend/device/{device_code}",
                "/api/analytics/forecast/device/{device_code}",
                "/api/analytics/anomalies/device/{device_code}"
            ],
            "narrative": [
                "/api/narrative/faers/{ndc_code}",
                "/api/narrative/combined/{product_code}"
            ]
        }
    }

@app.get("/api/ingest/drug/{identifier}")
async def ingest_drug_data(identifier: str, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Fetch drug adverse event data from FDA FAERS
    
    Args:
        identifier: NDC product code or drug name to search for
        limit: Optional limit on number of records returned
        
    Returns:
        Dictionary containing FAERS data
    """
    try:
        records = get_faers_cached(identifier)
        
        # Apply limit if specified
        if limit and limit > 0 and records:
            records = records[:limit]
        
        # Handle case when no records are found
        if not records:
            records = []
            
        return {
            "source": "FDA_FAERS",
            "drug_identifier": identifier,
            "count": len(records),
            "raw_data": {
                "meta": {
                    "disclaimer": "Data from FDA Adverse Event Reporting System (FAERS)",
                    "results": {
                        "skip": 0,
                        "limit": limit if limit else len(records),
                        "total": len(records)
                    }
                },
                "results": records
            }
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FAERS ingestion failed: {str(e)}")

@app.get("/api/ingest/device/{device_identifier}")
async def ingest_device_data(device_identifier: str) -> Dict[str, Any]:
    """
    Fetch device complaint data from FDA MAUDE
    
    Args:
        device_identifier: Device identifier or name to search for
        
    Returns:
        Dictionary containing MAUDE data
    """
    try:
        complaints = get_device_complaints_cached(device_identifier)
        
        # Handle case when no complaints are found
        if not complaints:
            complaints = []
            
        return {
            "source": "FDA_Device_MAUDE",
            "device_identifier": device_identifier,
            "count": len(complaints),
            "complaints": complaints
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MAUDE ingestion failed: {str(e)}")

@app.get("/api/ingest/eu/{product_code}")
async def ingest_eu_data(product_code: str) -> Dict[str, Any]:
    """
    Fetch product data from EU EUDAMED (stub for future implementation)
    
    Args:
        product_code: Product identifier to search for
        
    Returns:
        Dictionary containing EUDAMED data
    """
    try:
        # Use the cached connector stub
        eudamed_data = get_eudamed_cached(product_code)
        return eudamed_data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Eudamed ingestion failed: {str(e)}")

# Normalization endpoints
@app.get("/api/norm/drug/{ndc_code}")
async def normalize_drug_data(ndc_code: str, limit: Optional[int] = 100) -> Dict[str, Any]:
    """
    Fetch and normalize drug adverse event data from FDA FAERS
    
    Args:
        ndc_code: NDC product code or drug name to search for
        limit: Maximum number of raw records to process
        
    Returns:
        Dictionary with normalized FAERS records
    """
    try:
        # Get raw data
        raw_data = get_faers_cached(ndc_code)
        
        # Apply limit if specified
        if limit and limit > 0 and isinstance(raw_data, list) and len(raw_data) > limit:
            raw_data = raw_data[:limit]
        
        # Normalize data
        normalized = normalize_faers(raw_data, ndc_code)
        
        return {
            "source": "FAERS",
            "drug_identifier": ndc_code,
            "count": len(normalized),
            "records": normalized
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FAERS normalization failed: {str(e)}")

@app.get("/api/norm/device/{device_code}")
async def normalize_device_data(device_code: str) -> Dict[str, Any]:
    """
    Fetch and normalize device complaint data from FDA MAUDE
    
    Args:
        device_code: Device identifier or name to search for
        
    Returns:
        Dictionary with normalized MAUDE records
    """
    try:
        # Get raw data
        raw_data = get_device_complaints_cached(device_code)
        
        # Normalize data
        normalized = normalize_maude(raw_data, device_code)
        
        return {
            "source": "MAUDE",
            "device_identifier": device_code,
            "count": len(normalized),
            "records": normalized
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MAUDE normalization failed: {str(e)}")

@app.get("/api/norm/eu/{product_code}")
async def normalize_eu_data(product_code: str) -> Dict[str, Any]:
    """
    Fetch and normalize product data from EU EUDAMED
    
    Args:
        product_code: Product identifier to search for
        
    Returns:
        Dictionary with normalized EUDAMED records
    """
    try:
        # Get raw data
        raw_data = get_eudamed_cached(product_code)
        
        # Normalize data
        normalized = normalize_eudamed(raw_data, product_code)
        
        return {
            "source": "Eudamed",
            "product_code": product_code,
            "count": len(normalized),
            "records": normalized
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Eudamed normalization failed: {str(e)}")

@app.get("/api/norm/combined/{product_code}")
async def get_combined_data(product_code: str, limit: Optional[int] = 100) -> Dict[str, Any]:
    """
    Fetch and normalize data from all sources (FAERS, MAUDE, EUDAMED)
    
    Args:
        product_code: Product identifier to search in all sources
        limit: Maximum records per source
        
    Returns:
        Dictionary with combined normalized records from all sources
    """
    try:
        # Get data from all sources
        faers_data = get_faers_cached(product_code)
        if isinstance(faers_data, list) and limit:
            faers_data = faers_data[:limit]
            
        maude_data = get_device_complaints_cached(product_code)
        if isinstance(maude_data, list) and limit:
            maude_data = maude_data[:limit]
            
        eudamed_data = get_eudamed_cached(product_code)
        
        # Normalize everything
        normalized = normalize_all_sources(
            faers_data=faers_data,
            maude_data=maude_data,
            eudamed_data=eudamed_data,
            product_code=product_code
        )
        
        # Group by source for easier consumption
        grouped = {
            "FAERS": [r for r in normalized if r["source"] == "FAERS"],
            "MAUDE": [r for r in normalized if r["source"] == "MAUDE"],
            "Eudamed": [r for r in normalized if r["source"] == "Eudamed"]
        }
        
        return {
            "product_code": product_code,
            "total_count": len(normalized),
            "sources": {
                "FAERS": len(grouped["FAERS"]),
                "MAUDE": len(grouped["MAUDE"]),
                "Eudamed": len(grouped["Eudamed"])
            },
            "records": normalized,
            "grouped_records": grouped
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Combined normalization failed: {str(e)}")

# Analytics endpoints
@app.get("/api/analytics/trend/faers/{ndc_code}")
async def trend_faers(ndc_code: str, interval: str = "M"):
    """
    Get time-series trend of FAERS adverse events
    
    Args:
        ndc_code: NDC product code or drug name
        interval: Time aggregation interval (D=daily, W=weekly, M=monthly, Y=yearly)
        
    Returns:
        Dictionary with time-series trend data
    """
    try:
        raw = get_faers_cached(ndc_code)
        normalized = normalize_faers(raw, ndc_code)
        series = aggregate_time_series(normalized, interval=interval)
        trend_dict = {str(idx.date()): float(val) for idx, val in series.items()}
        return {"ndc": ndc_code, "interval": interval, "trend": trend_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FAERS trend failed: {str(e)}")

@app.get("/api/analytics/forecast/faers/{ndc_code}")
async def forecast_faers(ndc_code: str, periods: int = 3, interval: str = "M"):
    """
    Forecast future FAERS adverse events
    
    Args:
        ndc_code: NDC product code or drug name
        periods: Number of periods to forecast ahead
        interval: Time aggregation interval (D=daily, W=weekly, M=monthly, Y=yearly)
        
    Returns:
        Dictionary with forecast data
    """
    try:
        raw = get_faers_cached(ndc_code)
        normalized = normalize_faers(raw, ndc_code)
        series = aggregate_time_series(normalized, interval=interval)
        fc = forecast_adverse_events(series, periods=periods)
        return {"ndc": ndc_code, "interval": interval, "periods": periods, "forecast": fc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FAERS forecast failed: {str(e)}")

@app.get("/api/analytics/anomalies/faers/{ndc_code}")
async def anomalies_faers(ndc_code: str, threshold: float = 1.5, interval: str = "M"):
    """
    Detect anomalies in FAERS adverse events
    
    Args:
        ndc_code: NDC product code or drug name
        threshold: Multiplier for rolling mean to detect anomalies
        interval: Time aggregation interval (D=daily, W=weekly, M=monthly, Y=yearly)
        
    Returns:
        Dictionary with anomaly data
    """
    try:
        raw = get_faers_cached(ndc_code)
        normalized = normalize_faers(raw, ndc_code)
        series = aggregate_time_series(normalized, interval=interval)
        anomalies = detect_anomalies(series, threshold=threshold)
        return {"ndc": ndc_code, "threshold": threshold, "interval": interval, "anomalies": anomalies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FAERS anomalies failed: {str(e)}")

@app.get("/api/analytics/trend/device/{device_code}")
async def trend_device(device_code: str, interval: str = "M"):
    """
    Get time-series trend of device complaints from MAUDE
    
    Args:
        device_code: Device identifier or name
        interval: Time aggregation interval (D=daily, W=weekly, M=monthly, Y=yearly)
        
    Returns:
        Dictionary with time-series trend data
    """
    try:
        raw = get_device_complaints_cached(device_code)
        normalized = normalize_maude(raw, device_code)
        series = aggregate_time_series(normalized, interval=interval)
        trend_dict = {str(idx.date()): float(val) for idx, val in series.items()}
        return {"device": device_code, "interval": interval, "trend": trend_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Device trend failed: {str(e)}")

@app.get("/api/analytics/forecast/device/{device_code}")
async def forecast_device(device_code: str, periods: int = 3, interval: str = "M"):
    """
    Forecast future device complaints
    
    Args:
        device_code: Device identifier or name
        periods: Number of periods to forecast ahead
        interval: Time aggregation interval (D=daily, W=weekly, M=monthly, Y=yearly)
        
    Returns:
        Dictionary with forecast data
    """
    try:
        raw = get_device_complaints_cached(device_code)
        normalized = normalize_maude(raw, device_code)
        series = aggregate_time_series(normalized, interval=interval)
        fc = forecast_adverse_events(series, periods=periods)
        return {"device": device_code, "interval": interval, "periods": periods, "forecast": fc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Device forecast failed: {str(e)}")

@app.get("/api/analytics/anomalies/device/{device_code}")
async def anomalies_device(device_code: str, threshold: float = 1.5, interval: str = "M"):
    """
    Detect anomalies in device complaints
    
    Args:
        device_code: Device identifier or name
        threshold: Multiplier for rolling mean to detect anomalies
        interval: Time aggregation interval (D=daily, W=weekly, M=monthly, Y=yearly)
        
    Returns:
        Dictionary with anomaly data
    """
    try:
        raw = get_device_complaints_cached(device_code)
        normalized = normalize_maude(raw, device_code)
        series = aggregate_time_series(normalized, interval=interval)
        anomalies = detect_anomalies(series, threshold=threshold)
        return {"device": device_code, "threshold": threshold, "interval": interval, "anomalies": anomalies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Device anomalies failed: {str(e)}")

# Import and include narrative router
from narrative import router as narrative_router
app.include_router(narrative_router)

if __name__ == "__main__":
    # Run the API server directly for testing
    uvicorn.run(app, host="0.0.0.0", port=3500)