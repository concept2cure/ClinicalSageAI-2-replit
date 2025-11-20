"""
FastAPI CER Generator API

This module provides FastAPI endpoints for generating Clinical Evaluation Reports (CERs)
with streaming support using server-sent events (SSE).
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from utils.cer_generator import generate_cer, generate_cer_complete
from models.cer_models import ClinicalEvaluationReport, ReportSection, AIAudit
from database import get_db_session, get_sync_db_engine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define request models
class CERGenerationRequest(BaseModel):
    device_id: int
    start_date: str
    end_date: str
    sections: Optional[List[str]] = None
    organization_id: Optional[int] = None

class CERInsightRequest(BaseModel):
    report_id: int

class SectionUpdateRequest(BaseModel):
    content: str

# Create FastAPI app
cer_app = FastAPI(title="CER Generator API", version="1.0.0")

# Add CORS middleware
cer_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@cer_app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "version": "1.0.0"}

@cer_app.post("/api/cer/generate")
async def generate_cer_endpoint(request: CERGenerationRequest):
    """
    Generate a complete Clinical Evaluation Report and store in database
    
    Returns:
        JSON response with the report ID
    """
    try:
        # Run the complete report generation (non-streaming)
        report_content = await generate_cer_complete(
            device_id=request.device_id,
            start_date=request.start_date,
            end_date=request.end_date,
            sections=request.sections
        )
        
        # Create report record in database
        async with get_db_session() as session:
            # Create main report
            new_report = ClinicalEvaluationReport(
                organization_id=request.organization_id or 1,
                device_id=request.device_id,
                title=f"Clinical Evaluation Report - {datetime.now().strftime('%Y-%m-%d')}",
                report_type="MDR",
                start_date=request.start_date,
                end_date=request.end_date,
                status="draft",
                content=report_content
            )
            session.add(new_report)
            await session.flush()
            
            # Create report sections
            section_order = 1
            for section_name, content in report_content.items():
                section = ReportSection(
                    report_id=new_report.id,
                    title=section_name.replace("_", " ").title(),
                    section_order=section_order,
                    content=content,
                    status="generated",
                    ai_generated=True
                )
                session.add(section)
                section_order += 1
                
            await session.commit()
            
        return {"report_id": new_report.id, "status": "complete"}
        
    except Exception as e:
        logger.error(f"Error generating CER: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@cer_app.post("/api/cer/generate/stream")
async def generate_cer_stream_endpoint(request: CERGenerationRequest):
    """
    Generate a Clinical Evaluation Report with streaming response
    
    Returns:
        Server-sent events stream with generated content
    """
    async def event_generator():
        try:
            # Header for SSE
            yield "event: start\ndata: {\"status\": \"started\"}\n\n"
            
            # Stream report generation
            async for section_name, content_chunk in generate_cer(
                device_id=request.device_id,
                start_date=request.start_date,
                end_date=request.end_date,
                sections=request.sections
            ):
                # Format as SSE event
                event_data = {
                    "section": section_name,
                    "content": content_chunk
                }
                yield f"event: chunk\ndata: {json.dumps(event_data)}\n\n"
                
                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.01)
                
            # End event
            yield "event: end\ndata: {\"status\": \"complete\"}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming CER generation: {str(e)}")
            error_data = {"error": str(e)}
            yield f"event: error\ndata: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

@cer_app.get("/api/cer/reports/{report_id}")
async def get_report(report_id: int, db: AsyncSession = Depends(get_db_session)):
    """
    Get a Clinical Evaluation Report by ID
    
    Args:
        report_id: The ID of the report
        
    Returns:
        JSON response with report details
    """
    try:
        result = await db.execute(
            f"SELECT * FROM clinical_evaluation_reports WHERE id = {report_id}"
        )
        report = result.mappings().first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
            
        # Get report sections
        sections_result = await db.execute(
            f"SELECT * FROM report_sections WHERE report_id = {report_id} ORDER BY section_order"
        )
        sections = [dict(row) for row in sections_result.mappings().all()]
        
        # Get device info
        device_result = await db.execute(
            f"SELECT * FROM devices WHERE id = {report['device_id']}"
        )
        device = device_result.mappings().first()
        
        return {
            **dict(report),
            "sections": sections,
            "device": dict(device) if device else None
        }
        
    except Exception as e:
        logger.error(f"Error retrieving report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@cer_app.put("/api/cer/reports/{report_id}/sections/{section_id}")
async def update_section(
    report_id: int, 
    section_id: int, 
    request: SectionUpdateRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Update a report section's content
    
    Args:
        report_id: The ID of the report
        section_id: The ID of the section
        request: The update request
        
    Returns:
        JSON response with success status
    """
    try:
        # Update the section
        await db.execute(
            f"""
            UPDATE report_sections 
            SET content = :content, status = 'reviewed', updated_at = NOW()
            WHERE id = {section_id} AND report_id = {report_id}
            """, 
            {"content": request.content}
        )
        
        await db.commit()
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error updating section: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@cer_app.get("/api/cer/reports/{report_id}/insights")
async def get_report_insights(report_id: int, db: AsyncSession = Depends(get_db_session)):
    """
    Get insights data for a report
    
    Args:
        report_id: The ID of the report
        
    Returns:
        JSON response with insights data
    """
    try:
        result = await db.execute(
            f"SELECT insights FROM clinical_evaluation_reports WHERE id = {report_id}"
        )
        report = result.mappings().first()
        
        if not report or not report['insights']:
            # If no insights yet, return empty structure
            return {
                "adverse_events": {
                    "total_count": 0,
                    "serious_count": 0,
                    "non_serious_count": 0,
                    "common_event_types": [],
                    "monthly_trend": []
                },
                "literature": {
                    "total_references": 0,
                    "publication_years": [],
                    "top_journals": []
                }
            }
            
        return report['insights']
        
    except Exception as e:
        logger.error(f"Error retrieving insights: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@cer_app.get("/api/cer/reports/{report_id}/evidence/{section_name}")
async def get_section_evidence(
    report_id: int, 
    section_name: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Get evidence sources used for a specific section
    
    Args:
        report_id: The ID of the report
        section_name: The name of the section
        
    Returns:
        JSON response with evidence data
    """
    try:
        # This would normally fetch from a table that tracks which 
        # evidence chunks were used for which sections
        # For now, returning placeholder data
        
        # In a real implementation, we would track source chunks during generation
        # and retrieve them here
        evidence = {
            "sources": [
                {
                    "source_type": "FAERS",
                    "source_id": "12345",
                    "content": "Evidence chunk from FAERS database about this device",
                    "metadata": {
                        "report_date": "2023-10-15",
                        "event_type": "Device Malfunction"
                    }
                },
                {
                    "source_type": "PubMed",
                    "source_id": "PMC7890123",
                    "content": "Evidence from clinical literature about similar devices",
                    "metadata": {
                        "title": "Clinical evaluation of medical devices",
                        "authors": ["Smith J", "Jones A"],
                        "journal": "Journal of Medical Devices",
                        "year": 2022
                    }
                }
            ]
        }
        
        return evidence
        
    except Exception as e:
        logger.error(f"Error retrieving evidence: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@cer_app.get("/api/cer/templates")
async def get_templates(db: AsyncSession = Depends(get_db_session)):
    """
    Get available CER templates
    
    Returns:
        JSON response with templates
    """
    try:
        # These would typically come from a database
        templates = [
            {
                "id": "mdr-2017-745",
                "name": "EU MDR 2017/745",
                "type": "CER",
                "framework": "mdr",
                "description": "Medical Device Regulation compliant template with MEDDEV 2.7/1 Rev 4 structure"
            },
            {
                "id": "ivdr-2017-746", 
                "name": "EU IVDR 2017/746", 
                "type": "CER", 
                "framework": "ivdr",
                "description": "In Vitro Diagnostic Regulation compliant template"
            },
            {
                "id": "mdr-legacy", 
                "name": "Legacy MDD to MDR Template", 
                "type": "CER", 
                "framework": "mdr-legacy",
                "description": "For transition from Medical Device Directive to MDR compliance"
            },
            {
                "id": "fda-510k", 
                "name": "FDA 510(k) Submission", 
                "type": "CER", 
                "framework": "fda",
                "description": "US FDA 510(k) premarket submission structure"
            }
        ]
        
        return templates
        
    except Exception as e:
        logger.error(f"Error retrieving templates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@cer_app.get("/api/cer/devices")
async def get_devices(db: AsyncSession = Depends(get_db_session)):
    """
    Get available devices
    
    Returns:
        JSON response with devices
    """
    try:
        result = await db.execute("SELECT * FROM devices ORDER BY name")
        devices = [dict(row) for row in result.mappings().all()]
        
        if not devices:
            # Return placeholder data
            devices = [
                {
                    "id": 1,
                    "name": "CardioMonitor XR500",
                    "device_code": "CM-XR500",
                    "manufacturer": "MedTech Innovations",
                    "device_class": "IIb"
                },
                {
                    "id": 2,
                    "name": "DiabCare Pump System",
                    "device_code": "DCP-100",
                    "manufacturer": "DiabeTech Medical",
                    "device_class": "III"
                },
                {
                    "id": 3,
                    "name": "NeuroStim XL2",
                    "device_code": "NS-XL2",
                    "manufacturer": "NeuraMed Devices",
                    "device_class": "III"
                }
            ]
        
        return devices
        
    except Exception as e:
        logger.error(f"Error retrieving devices: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# For FAERS integration
@cer_app.get("/api/faers/search")
async def search_faers_events(
    product_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: Optional[int] = 50
):
    """
    Search for adverse events in FAERS
    
    Args:
        product_name: Name of the product
        start_date: Optional start date
        end_date: Optional end date
        limit: Maximum number of results
        
    Returns:
        JSON response with search results
    """
    try:
        # In production, this would connect to the FAERS API or database
        # Since we don't have the Health Canada API key yet, we'll return a structured response
        # This would normally check for the HEALTH_CANADA_API_KEY
        
        if not os.environ.get("HEALTH_CANADA_API_KEY"):
            # Return a placeholder structured response
            return {
                "query": {
                    "product_name": product_name,
                    "start_date": start_date,
                    "end_date": end_date
                },
                "results": [],
                "total_count": 0,
                "message": "Health Canada API key required for actual data"
            }
        
        # Placeholder for actual FAERS search implementation
        # This would make a request to the Health Canada API
        
        return {
            "query": {
                "product_name": product_name,
                "start_date": start_date,
                "end_date": end_date
            },
            "results": [],
            "total_count": 0
        }
        
    except Exception as e:
        logger.error(f"Error searching FAERS: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Additional FAERS endpoints would be implemented here

# API documentation root
@cer_app.get("/")
async def api_root():
    """API documentation and welcome message"""
    return {
        "name": "CER Generator API",
        "version": "1.0.0",
        "description": "API for generating Clinical Evaluation Reports using OpenAI and evidence retrieval",
        "endpoints": [
            {"path": "/api/cer/generate", "method": "POST", "description": "Generate a complete CER"},
            {"path": "/api/cer/generate/stream", "method": "POST", "description": "Generate a CER with streaming response"},
            {"path": "/api/cer/reports/{report_id}", "method": "GET", "description": "Get a specific report"},
            {"path": "/api/cer/templates", "method": "GET", "description": "Get available templates"},
            {"path": "/api/cer/devices", "method": "GET", "description": "Get available devices"},
            {"path": "/api/faers/search", "method": "GET", "description": "Search FAERS adverse events"}
        ],
        "documentation": "/docs"
    }