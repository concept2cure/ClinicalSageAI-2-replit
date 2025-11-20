"""
Defines the data schema for storing AI-generated CMC document versions, including text, metadata,
and export paths. Supports future integration with diff/restore UI and multi-user audit logs.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

class CMCVersionRecord(BaseModel):
    version_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    drug_name: str
    draft_text: str
    txt_path: str
    pdf_path: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None  # for future auth integration

    class Config:
        orm_mode = True