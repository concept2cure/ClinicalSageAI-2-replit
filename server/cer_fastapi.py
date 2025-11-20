#!/usr/bin/env python3
"""
CER FastAPI Server

This script provides a FastAPI server for the CER API endpoints
"""
import os
import io
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from cer_narrative import generate_cer_narrative
from faers_client import get_faers_data
import requests

# Import PDF libraries
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("Warning: ReportLab not installed. PDF generation will be disabled.")

# Define Pydantic models for request/response
class BatchCERRequest(BaseModel):
    ndc_codes: List[str]
    include_comparative_analysis: bool = True

class CERResponse(BaseModel):
    success: bool
    ndc_code: str
    cer_report: str
    data_source: str
    summary: Optional[Dict[str, Any]] = None

class BatchCERResponse(BaseModel):
    success: bool
    reports: List[CERResponse]
    comparative_analysis: Optional[Dict[str, Any]] = None

# Create FastAPI app
app = FastAPI(title="CER API", description="API for Clinical Evaluation Reports")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/cer/{ndc_code}")
async def get_cer(ndc_code: str):
    """
    Generate a CER report for the specified NDC code
    
    Args:
        ndc_code: NDC code for the product
        
    Returns:
        JSON response with CER report
    """
    try:
        # Check if OpenAI API key is available
        if not os.getenv("OPENAI_API_KEY"):
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "message": "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                }
            )
        
        # Fetch FAERS data for the NDC code
        faers_data = get_faers_data(ndc_code)
        
        # Generate CER narrative
        cer_narrative = generate_cer_narrative(faers_data)
        
        # Return the report
        return {
            "success": True,
            "ndc_code": ndc_code,
            "cer_report": cer_narrative,
            "data_source": "FDA FAERS Database"
        }
    except Exception as e:
        # Log the error
        print(f"Error generating CER report: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error generating CER report: {str(e)}"
        )

@app.post("/api/cer/batch")
async def batch_cer(request: BatchCERRequest):
    """
    Generate CER reports for multiple NDC codes in batch
    
    Args:
        request: BatchCERRequest with list of NDC codes
        
    Returns:
        BatchCERResponse with individual reports and comparative analysis
    """
    try:
        # Check if OpenAI API key is available
        if not os.getenv("OPENAI_API_KEY"):
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "message": "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                }
            )
            
        # Initialize response
        reports = []
        
        # Track events and frequencies for comparative analysis
        all_events = {}
        code_to_events = {}
        
        # Process each NDC code
        for ndc_code in request.ndc_codes:
            try:
                # Fetch FAERS data for the NDC code
                faers_data = get_faers_data(ndc_code)
                
                # Extract adverse events for comparison (if available)
                events_count = {}
                try:
                    # Extract events from results array
                    if "results" in faers_data and len(faers_data["results"]) > 0:
                        for result in faers_data["results"]:
                            if "patient" in result and "reaction" in result["patient"]:
                                for reaction in result["patient"]["reaction"]:
                                    if "reactionmeddrapt" in reaction:
                                        event = reaction["reactionmeddrapt"]
                                        events_count[event] = events_count.get(event, 0) + 1
                                        all_events[event] = all_events.get(event, 0) + 1
                except Exception as e:
                    print(f"Error extracting events for {ndc_code}: {str(e)}")
                    
                # Store events for this code
                code_to_events[ndc_code] = events_count
                
                # Create summary of events for this NDC code
                summary = {
                    "event_count": len(events_count),
                    "total_reactions": sum(events_count.values()),
                    "top_events": sorted(events_count.items(), key=lambda x: x[1], reverse=True)[:5]
                }
                
                # Generate CER narrative
                cer_narrative = generate_cer_narrative(faers_data)
                
                # Add report to response
                reports.append(CERResponse(
                    success=True,
                    ndc_code=ndc_code,
                    cer_report=cer_narrative,
                    data_source="FDA FAERS Database",
                    summary=summary
                ))
            except Exception as e:
                print(f"Error processing NDC code {ndc_code}: {str(e)}")
                reports.append(CERResponse(
                    success=False,
                    ndc_code=ndc_code,
                    cer_report=f"Error: {str(e)}",
                    data_source="FDA FAERS Database"
                ))
        
        # Generate comparative analysis
        comparative_analysis = None
        if request.include_comparative_analysis and len(reports) > 1:
            # Get top 20 events across all products
            top_events = sorted(all_events.items(), key=lambda x: x[1], reverse=True)[:20]
            
            # Create comparison data
            comparison_data = {
                "events": [event for event, _ in top_events],
                "product_comparisons": {}
            }
            
            # Add data for each product
            for ndc_code, events in code_to_events.items():
                product_data = []
                for event, _ in top_events:
                    product_data.append(events.get(event, 0))
                comparison_data["product_comparisons"][ndc_code] = product_data
            
            comparative_analysis = {
                "title": "Comparative Adverse Event Analysis",
                "description": "Comparison of adverse event frequencies across selected products",
                "data": comparison_data
            }
        
        # Return the response
        return BatchCERResponse(
            success=True,
            reports=reports,
            comparative_analysis=comparative_analysis
        )
    except Exception as e:
        # Log the error
        print(f"Error processing batch CER request: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error processing batch CER request: {str(e)}"
        )

@app.post("/api/cer/analyze")
async def analyze_cer_data(request: BatchCERRequest):
    """
    Analyze FAERS data for multiple NDC codes without generating full CER reports
    
    Args:
        request: BatchCERRequest with list of NDC codes
        
    Returns:
        JSON response with analysis data suitable for visualization
    """
    try:
        # Track all events and frequencies
        all_events = {}
        code_to_events = {}
        total_reports = {}
        
        # Process each NDC code
        for ndc_code in request.ndc_codes:
            try:
                # Fetch FAERS data for the NDC code
                faers_data = get_faers_data(ndc_code)
                
                # Count total reports
                report_count = 0
                if "meta" in faers_data and "results" in faers_data["meta"]:
                    report_count = faers_data["meta"]["results"]["total"]
                total_reports[ndc_code] = report_count
                
                # Extract events
                events_count = {}
                try:
                    # Extract events from results array
                    if "results" in faers_data and len(faers_data["results"]) > 0:
                        for result in faers_data["results"]:
                            if "patient" in result and "reaction" in result["patient"]:
                                for reaction in result["patient"]["reaction"]:
                                    if "reactionmeddrapt" in reaction:
                                        event = reaction["reactionmeddrapt"]
                                        events_count[event] = events_count.get(event, 0) + 1
                                        all_events[event] = all_events.get(event, 0) + 1
                except Exception as e:
                    print(f"Error extracting events for {ndc_code}: {str(e)}")
                    
                # Store events for this code
                code_to_events[ndc_code] = events_count
                
            except Exception as e:
                print(f"Error analyzing NDC code {ndc_code}: {str(e)}")
        
        # Get top 15 events across all products
        top_events = sorted(all_events.items(), key=lambda x: x[1], reverse=True)[:15]
        
        # Prepare response data suitable for visualization
        visualization_data = {
            "event_labels": [event for event, _ in top_events],
            "products": {},
            "total_reports": total_reports,
            "comparative_data": []
        }
        
        # Add data for each product
        for ndc_code, events in code_to_events.items():
            product_data = []
            for event, _ in top_events:
                product_data.append(events.get(event, 0))
            visualization_data["products"][ndc_code] = product_data
            
            # Add to comparative data in a format suitable for Chart.js
            visualization_data["comparative_data"].append({
                "label": f"Product {ndc_code}",
                "data": product_data,
                "backgroundColor": f"rgba({hash(ndc_code) % 255}, {(hash(ndc_code) + 100) % 255}, {(hash(ndc_code) + 150) % 255}, 0.6)"
            })
        
        # Return the visualization data
        return {
            "success": True,
            "visualization_data": visualization_data
        }
    except Exception as e:
        # Log the error
        print(f"Error analyzing CER data: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing CER data: {str(e)}"
        )

@app.get("/api/cer/{ndc_code}/pdf")
async def download_cer(ndc_code: str):
    """
    Generate a PDF version of the CER report
    
    Args:
        ndc_code: NDC code for the product
        
    Returns:
        PDF file as a streaming response
    """
    try:
        # Check PDF support
        if not PDF_SUPPORT:
            return JSONResponse(
                status_code=501, 
                content={
                    "success": False,
                    "message": "PDF generation is not available on this server."
                }
            )
            
        # Check if OpenAI API key is available
        if not os.getenv("OPENAI_API_KEY"):
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "message": "OpenAI API key not configured. Please set the OPENAI_API_KEY environment variable."
                }
            )
        
        # Fetch FAERS data for the NDC code
        faers_data = get_faers_data(ndc_code)
        
        # Generate CER narrative
        cer_narrative = generate_cer_narrative(faers_data)
        
        # Create a PDF
        buffer = io.BytesIO()
        
        # Create the PDF document
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Add title
        title_style = styles["Title"]
        title = Paragraph(f"Clinical Evaluation Report: Product {ndc_code}", title_style)
        story.append(title)
        story.append(Spacer(1, 12))
        
        # Add report date
        date_style = styles["Normal"]
        date_style.alignment = 1  # Center alignment
        from datetime import datetime
        report_date = Paragraph(f"Report Date: {datetime.now().strftime('%Y-%m-%d')}", date_style)
        story.append(report_date)
        story.append(Spacer(1, 24))
        
        # Add report content
        content_style = styles["BodyText"]
        for line in cer_narrative.split('\n'):
            if line.strip():  # Skip empty lines
                p = Paragraph(line, content_style)
                story.append(p)
                story.append(Spacer(1, 6))
        
        # Build the PDF
        doc.build(story)
        
        # Return the PDF as a streaming response
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=CER_Report_{ndc_code}.pdf"}
        )
    except Exception as e:
        # Log the error
        print(f"Error generating PDF: {str(e)}")
        
        # Return error response
        raise HTTPException(
            status_code=500,
            detail=f"Error generating PDF: {str(e)}"
        )

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "CER API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3500)