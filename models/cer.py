"""
Clinical Evaluation Report (CER) Model

This module defines the data model for Clinical Evaluation Reports (CERs)
generated from FAERS data.
"""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime

class CERMetadata(BaseModel):
    """Metadata for a Clinical Evaluation Report"""
    ndc_code: str
    product_name: Optional[str] = None
    manufacturer: Optional[str] = None
    report_count: int
    serious_cases: int
    date_range: Optional[Dict[str, str]] = None
    source: str = "FDA FAERS"
    
class AdverseEvent(BaseModel):
    """Representation of an adverse event in a CER"""
    term: str
    count: int
    percentage: float
    serious_count: Optional[int] = None
    
class DemographicSummary(BaseModel):
    """Summary of demographic information in a CER"""
    age_range: Optional[str] = None
    average_age: Optional[float] = None
    gender_distribution: Optional[Dict[str, int]] = None
    weight_range: Optional[str] = None
    
class ClinicalEvaluationReport(BaseModel):
    """
    Clinical Evaluation Report (CER) model
    
    This represents a structured clinical evaluation report generated
    from FAERS adverse event data for regulatory purposes.
    """
    cer_id: str
    title: str
    device_name: str  # Product/device name
    manufacturer: str
    indication: str
    report_date: datetime = Field(default_factory=datetime.now)
    status: str = "active"  # active, draft, archived
    content_text: str  # Full narrative text
    metadata: Dict[str, Any]
    
    # Optional structured data elements
    adverse_events: Optional[List[AdverseEvent]] = None
    demographics: Optional[DemographicSummary] = None
    
    class Config:
        schema_extra = {
            "example": {
                "cer_id": "CER-2025-042",
                "title": "Clinical Evaluation Report for Drug X",
                "device_name": "Drug X 10mg Tablets",
                "manufacturer": "Pharmaceutical Company Inc.",
                "indication": "Post-market surveillance",
                "report_date": "2025-04-15T10:30:00.000Z",
                "status": "active",
                "content_text": "# Clinical Evaluation Report\n\n## Executive Summary\nThis clinical evaluation report...",
                "metadata": {
                    "ndc_code": "12345-678-90",
                    "product_name": "Drug X",
                    "report_count": 245,
                    "serious_cases": 42,
                    "source": "FDA FAERS"
                }
            }
        }