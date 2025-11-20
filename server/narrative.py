import os
import io
import json
import openai
from typing import List, Dict, Any, Optional, Callable
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
from redis import Redis

from ingestion.fda_faers import get_faers_cached
from ingestion.fda_device import get_device_complaints_cached
from ingestion.eu_eudamed import get_eudamed_cached
from ingestion.normalize import normalize_faers, normalize_maude, normalize_eudamed
from predictive_analytics import aggregate_time_series, forecast_adverse_events, detect_anomalies

# Redis cache setup
ttl_seconds = 3600  # 1 hour caching
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Try to connect to Redis, but provide a dummy implementation if it fails
try:
    redis_client = Redis.from_url(redis_url, socket_connect_timeout=2.0)
    # Test the connection
    redis_client.ping()
    print("Redis connected successfully")
except Exception as e:
    print(f"Redis connection failed: {e}, using memory cache fallback")
    # Create a simple in-memory cache as fallback
    class MemoryCache:
        def __init__(self):
            self.cache = {}
            
        def get(self, key):
            if key in self.cache:
                return self.cache[key].encode('utf-8')
            return None
            
        def setex(self, key, ttl, value):
            self.cache[key] = value
            return True
            
        def ping(self):
            return True
    
    redis_client = MemoryCache()

# Import ReportLab for PDF generation
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

# Ensure your OPENAI_API_KEY is set in environment
env_key = "OPENAI_API_KEY"
if not os.getenv(env_key):
    print(f"Warning: {env_key} environment variable is not set, narrative generation will fail")
openai.api_key = os.getenv(env_key)

def build_faers_analysis(ndc_code: str, periods: int = 3) -> Dict[str, Any]:
    """
    Build analysis for FAERS (drug) data.
    
    Args:
        ndc_code: NDC product code or drug name 
        periods: Number of periods to forecast ahead
        
    Returns:
        dict with source, product_code, total_count, trend, forecast, anomalies
    """
    # Get and normalize data
    raw = get_faers_cached(ndc_code)
    normalized = normalize_faers(raw, ndc_code)
    
    # Build time series
    series = aggregate_time_series(normalized)
    
    # Compute forecasts & anomalies
    forecast = forecast_adverse_events(series, periods=periods)
    anomalies = detect_anomalies(series)
    
    # Calculate counts
    total = sum(rec.get("count", 0) for rec in normalized)
    serious_count = sum(1 for rec in normalized if rec.get("serious", False))
    
    # Get top event descriptions
    event_counts = {}
    for rec in normalized:
        desc = rec.get("description", "")
        if desc:
            event_counts[desc] = event_counts.get(desc, 0) + rec.get("count", 1)
    
    top_events = sorted(event_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "source": "FAERS",
        "product_code": ndc_code,
        "total_count": total,
        "serious_count": serious_count,
        "trend": {str(idx.date()): int(val) for idx, val in series.items()},
        "forecast": forecast,
        "anomalies": anomalies,
        "top_events": dict(top_events)
    }

def build_device_analysis(device_code: str, periods: int = 3) -> Dict[str, Any]:
    """
    Build analysis for MAUDE (device) data.
    
    Args:
        device_code: Device identifier or name
        periods: Number of periods to forecast ahead
        
    Returns:
        dict with source, product_code, total_count, trend, forecast, anomalies
    """
    # Get and normalize data
    raw = get_device_complaints_cached(device_code)
    normalized = normalize_maude(raw, device_code)
    
    # Build time series
    series = aggregate_time_series(normalized)
    
    # Compute forecasts & anomalies
    forecast = forecast_adverse_events(series, periods=periods)
    anomalies = detect_anomalies(series)
    
    # Calculate counts
    total = sum(rec.get("count", 0) for rec in normalized)
    serious_count = sum(1 for rec in normalized if rec.get("serious", False))
    
    # Get top event descriptions
    event_counts = {}
    for rec in normalized:
        desc = rec.get("description", "")
        if desc:
            event_counts[desc] = event_counts.get(desc, 0) + rec.get("count", 1)
    
    top_events = sorted(event_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "source": "MAUDE",
        "product_code": device_code,
        "total_count": total,
        "serious_count": serious_count,
        "trend": {str(idx.date()): int(val) for idx, val in series.items()},
        "forecast": forecast,
        "anomalies": anomalies,
        "top_events": dict(top_events)
    }

def build_eudamed_analysis(product_code: str) -> Dict[str, Any]:
    """
    Creates a simple analysis from Eudamed stub data
    
    Args:
        product_code: Product code to query in Eudamed
        
    Returns:
        Basic Eudamed analysis info 
    """
    # Get Eudamed data (currently a stub)
    raw = get_eudamed_cached(product_code)
    normalized = normalize_eudamed(raw, product_code)
    
    # Extract available data
    message = raw.get("message", "No Eudamed data available")
    
    return {
        "source": "Eudamed",
        "product_code": product_code,
        "message": message,
        "records": normalized
    }

def build_multi_analysis(ndc_codes: List[str] = None, device_codes: List[str] = None, periods: int = 3) -> Dict[str, Any]:
    """
    Combine analyses across FAERS, MAUDE, and optional Eudamed stubs.
    
    Args:
        ndc_codes: List of NDC codes for drugs
        device_codes: List of device identifiers
        periods: Number of periods to forecast
        
    Returns:
        Combined dict of analyses from all sources
    """
    analyses = []
    
    # Add drug analyses
    if ndc_codes:
        for ndc in ndc_codes:
            analyses.append(build_faers_analysis(ndc, periods))
    
    # Add device analyses
    if device_codes:
        for device in device_codes:
            analyses.append(build_device_analysis(device, periods))
            # Also include Eudamed data for devices
            analyses.append(build_eudamed_analysis(device))
    
    return {"analyses": analyses}

def generate_cer_narrative_from_analysis(analysis_data: Dict[str, Any]) -> str:
    """
    Generate CER narrative from multi-source analysis data.
    
    Args:
        analysis_data: Dict with analyses array or single analysis
        
    Returns:
        Generated CER narrative text
    """
    # Check if we have a multi-source analysis or single source
    if "analyses" in analysis_data:
        # Multi-source analysis - build clean prompt lines
        prompt_lines = []
        
        for item in analysis_data.get("analyses", []):
            source = item.get("source", "Unknown")
            code = item.get("product_code", "Unknown")
            
            if source in ["FAERS", "MAUDE"]:
                # Drug or device data
                total = item.get("total_count", 0)
                serious = item.get("serious_count", 0)
                top_events = item.get("top_events", {})
                trend = item.get("trend", {})
                forecast = item.get("forecast", {})
                anomalies = item.get("anomalies", {})
                
                top_events_str = ", ".join([f"{event} ({count})" for event, count in top_events.items()])
                trend_str = ", ".join([f"{date}: {count}" for date, count in trend.items()])
                forecast_str = ", ".join([f"{date}: {count}" for date, count in forecast.items()])
                anomalies_str = ", ".join([f"{date}: {count}" for date, count in anomalies.items()])
                
                line = (f"Source: {source}, Code: {code}, " +
                       f"Total: {total}, Serious: {serious}, " +
                       f"Top Events: {top_events_str}, " +
                       f"Trend: {trend_str}, " +
                       f"Forecast: {forecast_str}, " +
                       f"Anomalies: {anomalies_str}")
                prompt_lines.append(line)
                
            elif source == "Eudamed":
                # Eudamed data (stub)
                message = item.get("message", "")
                records = item.get("records", [])
                line = f"Source: {source}, Code: {code}, Info: {message}, Records: {records}"
                prompt_lines.append(line)
        
        # Build the complete prompt
        prompt = (
            "You are a regulatory-compliant Clinical Evaluation Report (CER) generator. "
            "Based on the following multi-source analysis data, generate a cohesive CER narrative "
            "that includes an executive summary, trends, forecasts, anomaly analysis, and benefit-risk considerations.\n\n"
            + "\n".join(prompt_lines) +
            "\n\nPlease include in your CER narrative:\n"
            "1. Executive summary of the combined safety profile\n"
            "2. Analysis of trends across all sources\n"
            "3. Forecast interpretation and risk assessment\n"
            "4. Analysis of any detected anomalies\n"
            "5. Benefit-risk considerations\n\n"
            "Provide a cohesive, professional narrative suitable for regulatory submission."
        )
    else:
        # Single source analysis (FAERS or MAUDE)
        item = analysis_data
        source = item.get("source", "Unknown")
        code = item.get("product_code", "Unknown")
        total = item.get("total_count", 0)
        serious = item.get("serious_count", 0)
        top_events = item.get("top_events", {})
        trend = item.get("trend", {})
        forecast = item.get("forecast", {})
        anomalies = item.get("anomalies", {})
        
        top_events_str = ", ".join([f"{event} ({count})" for event, count in top_events.items()])
        trend_str = ", ".join([f"{date}: {count}" for date, count in trend.items()])
        forecast_str = ", ".join([f"{date}: {count}" for date, count in forecast.items()])
        anomalies_str = ", ".join([f"{date}: {count}" for date, count in anomalies.items()])
        
        prompt = f"""
You are a regulatory-compliant Clinical Evaluation Report (CER) generator.

Generate a detailed CER narrative based on the following {source} analysis data:

Product Code: {code}
Total Reports: {total}
Serious Events: {serious}
Top Reported Events: {top_events_str}

Trend (monthly counts): {trend_str}
Forecast (next periods): {forecast_str}
Anomalies detected: {anomalies_str}

Please include:
- An executive summary
- Description of trends 
- Forecast interpretation
- Analysis of anomalies
- Benefit-risk considerations

Provide a cohesive, professional narrative suitable for regulatory submission.
"""

    try:
        # Generate the narrative with OpenAI
        response = openai.chat.completions.create(
            model="gpt-4-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=800
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error generating CER narrative: {e}")
        # Fall back to a simple narrative if OpenAI fails
        if "analyses" in analysis_data:
            return f"Clinical Evaluation Report: Combined analysis of multiple regulatory sources. Due to the complexity of the data, a comprehensive narrative could not be generated. Please review the raw analysis data."
        else:
            return f"Clinical Evaluation Report for {code}: Analysis of {total} adverse event reports, including {serious} serious events from {source}. Data trends and forecasting suggest continued monitoring is warranted."

# Cache key generator
def _cache_key(prefix: str, identifier: str) -> str:
    """Generate a cache key for Redis"""
    return f"cer_narrative:{prefix}:{identifier}"

# Cache fetch or generate utility
def _fetch_or_generate(prefix: str, identifier: str, generator_fn: Callable[[], str]) -> str:
    """
    Check Redis cache for the narrative, generate if not found
    
    Args:
        prefix: Cache key prefix (faers, device, multi)
        identifier: Unique identifier for this narrative
        generator_fn: Function that generates the narrative if cache miss
        
    Returns:
        The narrative text, either from cache or freshly generated
    """
    # Generate cache key
    key = _cache_key(prefix, identifier)
    
    # Try to get from cache
    cached = redis_client.get(key)
    if cached:
        print(f"Cache hit for {key}")
        return cached.decode('utf-8')
    
    # Cache miss - generate new
    print(f"Cache miss for {key}, generating...")
    narrative = generator_fn()
    
    # Store in cache
    redis_client.setex(key, ttl_seconds, narrative)
    return narrative

# PDF Generation Utility
def generate_pdf_report(narrative: str, analysis_data: Dict[str, Any]) -> bytes:
    """
    Generate a PDF report from a CER narrative and analysis data
    
    Args:
        narrative: The generated CER narrative text
        analysis_data: Analysis data dictionary (single source or multi-source)
        
    Returns:
        PDF bytes that can be returned as a StreamingResponse
    """
    # Create a BytesIO buffer to receive PDF data
    buffer = io.BytesIO()
    
    # Create the PDF document
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=letter,
        rightMargin=72, 
        leftMargin=72,
        topMargin=72, 
        bottomMargin=72
    )
    
    # Define styles
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    heading_style = styles['Heading2']
    normal_style = styles['Normal']
    
    # Create custom paragraph style for narrative text
    narrative_style = ParagraphStyle(
        'NarrativeStyle',
        parent=styles['BodyText'],
        spaceBefore=6,
        spaceAfter=6,
        leading=14
    )
    
    # Define document elements
    elements = []
    
    # Add title
    report_title = "Clinical Evaluation Report (CER)"
    elements.append(Paragraph(report_title, title_style))
    elements.append(Spacer(1, 12))
    
    # Add generation date
    gen_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    elements.append(Paragraph(f"Generated: {gen_date}", normal_style))
    elements.append(Spacer(1, 12))
    
    # Add product information
    if "analyses" in analysis_data:
        # Multi-source report
        products = []
        for item in analysis_data.get("analyses", []):
            source = item.get("source", "")
            code = item.get("product_code", "")
            if code and source:
                products.append(f"{source}: {code}")
        
        if products:
            elements.append(Paragraph("Products Evaluated:", heading_style))
            for product in products:
                elements.append(Paragraph(f"• {product}", normal_style))
            elements.append(Spacer(1, 12))
    else:
        # Single source report
        source = analysis_data.get("source", "")
        code = analysis_data.get("product_code", "")
        if code and source:
            elements.append(Paragraph(f"Product: {code} (Source: {source})", heading_style))
            elements.append(Spacer(1, 12))
    
    # Add summary table for multi-source
    if "analyses" in analysis_data:
        elements.append(Paragraph("Summary Data", heading_style))
        
        # Create table data
        table_data = [["Source", "Product Code", "Total Events", "Serious Events"]]
        
        for item in analysis_data.get("analyses", []):
            source = item.get("source", "")
            code = item.get("product_code", "")
            total = item.get("total_count", "N/A")
            serious = item.get("serious_count", "N/A")
            
            if source in ["FAERS", "MAUDE"]:
                table_data.append([source, code, str(total), str(serious)])
        
        # Create table with styling
        table = Table(table_data, colWidths=[1.5*inch, 1.5*inch, 1.25*inch, 1.25*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ALIGN', (2, 1), (3, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        elements.append(table)
        elements.append(Spacer(1, 24))
    else:
        # Single source summary
        total = analysis_data.get("total_count", 0)
        serious = analysis_data.get("serious_count", 0)
        
        # Simple summary text
        summary = f"Total Events: {total}, Serious Events: {serious}"
        elements.append(Paragraph(summary, normal_style))
        elements.append(Spacer(1, 12))
        
        # Add top events if available
        top_events = analysis_data.get("top_events", {})
        if top_events:
            elements.append(Paragraph("Top Reported Events:", normal_style))
            for event, count in top_events.items():
                elements.append(Paragraph(f"• {event}: {count}", normal_style))
            elements.append(Spacer(1, 12))
    
    # Add narrative section
    elements.append(Paragraph("Clinical Evaluation Narrative", heading_style))
    elements.append(Spacer(1, 12))
    
    # Format narrative text with proper paragraph breaks
    narrative_paragraphs = narrative.split('\n\n')
    for para in narrative_paragraphs:
        if para.strip():
            elements.append(Paragraph(para, narrative_style))
    
    # Build the PDF document
    doc.build(elements)
    
    # Get the value from the BytesIO buffer
    buffer.seek(0)
    return buffer.getvalue()

# FastAPI Router Integration
router = APIRouter(prefix="/api/narrative", tags=["narrative"])

@router.get("/faers/{ndc_code}")
async def narrative_faers(ndc_code: str, periods: int = 3):
    """
    Generate a CER narrative for a drug based on FAERS data
    
    Args:
        ndc_code: NDC product code or drug name
        periods: Number of periods to forecast (default: 3)
        
    Returns:
        Dictionary with product_code, analysis data, and generated narrative
    """
    try:
        # Check if OpenAI API key is available
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        # Build analysis and generate narrative
        analysis = build_faers_analysis(ndc_code, periods)
        
        # Handle case with no data
        if analysis["total_count"] == 0:
            return {
                "product_code": ndc_code,
                "source": "FAERS",
                "analysis": analysis,
                "narrative": f"No adverse events found for product code {ndc_code} in FAERS database."
            }
        
        # Generate or fetch narrative from cache
        identifier = f"faers:{ndc_code}:{periods}"
        def generate_narrative():
            return generate_cer_narrative_from_analysis(analysis)
        
        narrative = _fetch_or_generate('faers', identifier, generate_narrative)
        
        # Return both the analysis data and the narrative
        return {
            "product_code": ndc_code,
            "source": "FAERS",
            "analysis": analysis,
            "narrative": narrative
        }
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        raise HTTPException(
            status_code=500, 
            detail={
                "error_type": error_type,
                "message": f"FAERS narrative failed: {error_message}"
            }
        )

@router.get("/faers/{ndc_code}/pdf")
async def narrative_faers_pdf(ndc_code: str, periods: int = 3):
    """
    Generate a PDF CER report for a drug based on FAERS data
    
    Args:
        ndc_code: NDC product code or drug name
        periods: Number of periods to forecast (default: 3)
        
    Returns:
        PDF document with CER narrative and analysis
    """
    try:
        # Check if OpenAI API key is available
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        # Build analysis and generate narrative
        analysis = build_faers_analysis(ndc_code, periods)
        
        # Handle case with no data
        if analysis["total_count"] == 0:
            narrative = f"No adverse events found for product code {ndc_code} in FAERS database."
        else:
            # Generate or fetch narrative from cache
            identifier = f"faers:{ndc_code}:{periods}"
            def generate_narrative():
                return generate_cer_narrative_from_analysis(analysis)
            
            narrative = _fetch_or_generate('faers', identifier, generate_narrative)
        
        # Generate PDF
        pdf_bytes = generate_pdf_report(narrative, analysis)
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(pdf_bytes), 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=cer_faers_{ndc_code}.pdf"}
        )
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        raise HTTPException(
            status_code=500, 
            detail={
                "error_type": error_type,
                "message": f"FAERS PDF generation failed: {error_message}"
            }
        )

@router.get("/device/{device_code}")
async def narrative_device(device_code: str, periods: int = 3):
    """
    Generate a CER narrative for a device based on MAUDE data
    
    Args:
        device_code: Device identifier or name
        periods: Number of periods to forecast (default: 3)
        
    Returns:
        Dictionary with product_code, analysis data, and generated narrative
    """
    try:
        # Check if OpenAI API key is available
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        # Build analysis and generate narrative
        analysis = build_device_analysis(device_code, periods)
        
        # Handle case with no data
        if analysis["total_count"] == 0:
            return {
                "product_code": device_code,
                "source": "MAUDE",
                "analysis": analysis,
                "narrative": f"No device complaints found for product code {device_code} in MAUDE database."
            }
        
        # Generate or fetch narrative from cache
        identifier = f"device:{device_code}:{periods}"
        def generate_narrative():
            return generate_cer_narrative_from_analysis(analysis)
        
        narrative = _fetch_or_generate('device', identifier, generate_narrative)
        
        # Return both the analysis data and the narrative
        return {
            "product_code": device_code,
            "source": "MAUDE",
            "analysis": analysis,
            "narrative": narrative
        }
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        raise HTTPException(
            status_code=500, 
            detail={
                "error_type": error_type,
                "message": f"Device narrative failed: {error_message}"
            }
        )

@router.get("/device/{device_code}/pdf")
async def narrative_device_pdf(device_code: str, periods: int = 3):
    """
    Generate a PDF CER report for a device based on MAUDE data
    
    Args:
        device_code: Device identifier or name
        periods: Number of periods to forecast (default: 3)
        
    Returns:
        PDF document with CER narrative and analysis
    """
    try:
        # Check if OpenAI API key is available
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        
        # Build analysis and generate narrative
        analysis = build_device_analysis(device_code, periods)
        
        # Handle case with no data
        if analysis["total_count"] == 0:
            narrative = f"No device complaints found for product code {device_code} in MAUDE database."
        else:
            # Generate or fetch narrative from cache
            identifier = f"device:{device_code}:{periods}"
            def generate_narrative():
                return generate_cer_narrative_from_analysis(analysis)
            
            narrative = _fetch_or_generate('device', identifier, generate_narrative)
        
        # Generate PDF
        pdf_bytes = generate_pdf_report(narrative, analysis)
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(pdf_bytes), 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=cer_device_{device_code}.pdf"}
        )
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        raise HTTPException(
            status_code=500, 
            detail={
                "error_type": error_type,
                "message": f"Device PDF generation failed: {error_message}"
            }
        )

class MultiRequest(BaseModel):
    ndc_codes: Optional[List[str]] = None
    device_codes: Optional[List[str]] = None
    periods: int = 3

@router.post("/multi")
async def narrative_multi(request: MultiRequest = Body(...)):
    """
    Generate a comprehensive CER narrative from multiple regulatory sources
    
    Args:
        request: MultiRequest with ndc_codes, device_codes, and periods
        
    Returns:
        Dictionary with analysis data and generated narrative
    """
    try:
        # Check if OpenAI API key is available
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
            
        # Validate request
        if not request.ndc_codes and not request.device_codes:
            raise ValueError("At least one NDC code or device code must be provided")
            
        # Build combined analysis
        analysis_data = build_multi_analysis(
            ndc_codes=request.ndc_codes,
            device_codes=request.device_codes,
            periods=request.periods
        )
        
        # Create a deterministic identifier for caching
        ndc_str = ",".join(sorted(request.ndc_codes or []))
        device_str = ",".join(sorted(request.device_codes or []))
        identifier = f"multi:{ndc_str}:{device_str}:{request.periods}"
        
        # Define the generator function
        def generate_narrative():
            return generate_cer_narrative_from_analysis(analysis_data)
        
        # Generate or fetch narrative from cache
        narrative = _fetch_or_generate('multi', identifier, generate_narrative)
        
        # Return analysis and narrative
        return {
            "sources": {
                "FAERS": len(request.ndc_codes) if request.ndc_codes else 0,
                "MAUDE": len(request.device_codes) if request.device_codes else 0,
                "Eudamed": len(request.device_codes) if request.device_codes else 0
            },
            "analysis": analysis_data,
            "narrative": narrative
        }
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        raise HTTPException(
            status_code=500, 
            detail={
                "error_type": error_type,
                "message": f"Multi-source narrative failed: {error_message}"
            }
        )

@router.post("/multi/pdf")
async def narrative_multi_pdf(request: MultiRequest = Body(...)):
    """
    Generate a comprehensive PDF CER report from multiple regulatory sources
    
    Args:
        request: MultiRequest with ndc_codes, device_codes, and periods
        
    Returns:
        PDF document with CER narrative and analysis from multiple sources
    """
    try:
        # Check if OpenAI API key is available
        if not openai.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
            
        # Validate request
        if not request.ndc_codes and not request.device_codes:
            raise ValueError("At least one NDC code or device code must be provided")
        
        # Create a deterministic identifier for caching
        ndc_str = ",".join(sorted(request.ndc_codes or []))
        device_str = ",".join(sorted(request.device_codes or []))
        identifier = f"multi:{ndc_str}:{device_str}:{request.periods}"
        
        # Create filename with product codes
        products = []
        if request.ndc_codes:
            products.extend(request.ndc_codes)
        if request.device_codes:
            products.extend(request.device_codes)
        
        # Limit to first 2 products for filename
        filename_parts = products[:2]
        if len(products) > 2:
            filename_parts.append("et_al")
        
        filename = f"cer_multi_{'_'.join(filename_parts)}.pdf"
        
        # Check if we already have a cached narrative first to avoid redundant computation
        cache_key = _cache_key('multi', identifier)
        cached_narrative = redis_client.get(cache_key)
        
        if cached_narrative:
            print(f"Cache hit for {cache_key}")
            narrative = cached_narrative.decode('utf-8')
            
            # Build analysis data to generate PDF (less intensive than generating narrative)
            analysis_data = build_multi_analysis(
                ndc_codes=request.ndc_codes,
                device_codes=request.device_codes,
                periods=request.periods
            )
            
            # Generate PDF
            pdf_bytes = generate_pdf_report(narrative, analysis_data)
            
            # Return as streaming response
            return StreamingResponse(
                io.BytesIO(pdf_bytes), 
                media_type="application/pdf", 
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        # If narrative is not in cache, recommend using the separate endpoints
        # first to generate and cache the narrative, then retrieve as PDF
        return {
            "status": "pending",
            "message": "For complex multi-source reports, please first call /api/narrative/multi endpoint to generate and cache the narrative, then retry this PDF endpoint.",
            "next_steps": [
                "POST to /api/narrative/multi with the same parameters",
                "Wait for the narrative to be generated and cached (usually 10-15 seconds)",
                "Then call this endpoint again to retrieve the PDF"
            ]
        }
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        raise HTTPException(
            status_code=500, 
            detail={
                "error_type": error_type,
                "message": f"Multi-source PDF generation failed: {error_message}"
            }
        )

# Command-line entrypoint for standalone usage
if __name__ == "__main__":
    import argparse
    import sys
    import json
    
    parser = argparse.ArgumentParser(description="CER Narrative and PDF Generator")
    parser.add_argument("--mode", choices=["narrative", "pdf"], default="pdf",
                      help="Mode of operation: generate narrative or PDF")
    parser.add_argument("--input", type=str, help="Input file path (for existing narrative)")
    parser.add_argument("--data", type=str, help="Data JSON file path (for analysis data)")
    parser.add_argument("--output", type=str, help="Output file path (PDF or text)")
    parser.add_argument("--product", type=str, help="Product code/name")
    parser.add_argument("--source", choices=["faers", "maude", "eudamed", "multi"], default="faers",
                      help="Data source type")
    
    args = parser.parse_args()
    
    # PDF Generation Mode - takes a narrative file and generates PDF
    if args.mode == "pdf" and args.input and args.output:
        try:
            print(f"Generating enhanced PDF from {args.input} to {args.output}")
            # Load narrative text
            with open(args.input, 'r') as f:
                narrative_text = f.read()
                
            # Load analysis data if provided
            analysis_data = {}
            if args.data:
                try:
                    with open(args.data, 'r') as f:
                        analysis_data = json.load(f)
                    print(f"Loaded analysis data from {args.data}")
                except Exception as e:
                    print(f"Error loading analysis data: {e}", file=sys.stderr)
            
            # Generate PDF
            pdf_buffer = generate_pdf_report(narrative_text, analysis_data)
            
            # Write PDF to file
            with open(args.output, 'wb') as f:
                f.write(pdf_buffer.getvalue())
                
            print(f"Successfully generated PDF at {args.output}")
            sys.exit(0)
        except Exception as e:
            print(f"Error generating PDF: {e}", file=sys.stderr)
            sys.exit(1)
    
    # Invalid arguments
    else:
        print("Error: For PDF generation, --input, --output, and --mode=pdf parameters are required")
        print("Example: python narrative.py --mode=pdf --input=narrative.txt --data=analysis.json --output=report.pdf")
        sys.exit(1)