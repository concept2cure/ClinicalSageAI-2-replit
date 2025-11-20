"""
CER Generator Database Models

This module defines the database models for the Clinical Evaluation Report (CER) generator
system, including device information, adverse events, literature references, and report data.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

Base = declarative_base()

class Organization(Base):
    """Organization table for multi-tenant support"""
    __tablename__ = "organizations"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    devices = relationship("Device", back_populates="organization")
    drugs = relationship("Drug", back_populates="organization")
    reports = relationship("ClinicalEvaluationReport", back_populates="organization")


class Device(Base):
    """Medical device catalog information"""
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    device_code = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    manufacturer = Column(String(255))
    device_class = Column(String(50))  # I, IIa, IIb, III
    description = Column(Text)
    intended_use = Column(Text)
    metadata = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    organization = relationship("Organization", back_populates="devices")
    adverse_events = relationship("AdverseEvent", back_populates="device")
    reports = relationship("ClinicalEvaluationReport", back_populates="device")


class Drug(Base):
    """Pharmaceutical product catalog information"""
    __tablename__ = "drugs"
    
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    ndc_code = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    manufacturer = Column(String(255))
    description = Column(Text)
    active_ingredients = Column(JSON)
    metadata = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    organization = relationship("Organization", back_populates="drugs")
    adverse_events = relationship("AdverseEvent", back_populates="drug")


class AdverseEvent(Base):
    """Adverse event data from FAERS, MAUDE, and other sources"""
    __tablename__ = "adverse_events"
    
    id = Column(Integer, primary_key=True)
    source = Column(String(50), nullable=False)  # FAERS, MAUDE, etc.
    source_id = Column(String(100), index=True)  # Original ID from source system
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    drug_id = Column(Integer, ForeignKey("drugs.id"), nullable=True)
    event_date = Column(DateTime)
    report_date = Column(DateTime)
    event_type = Column(String(255))
    outcome = Column(String(100))
    seriousness = Column(String(50))
    description = Column(Text)
    patient_age = Column(Integer)
    patient_gender = Column(String(20))
    patient_weight = Column(Float)
    raw_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    device = relationship("Device", back_populates="adverse_events")
    drug = relationship("Drug", back_populates="adverse_events")


class LiteratureReference(Base):
    """Scientific literature references for clinical evidence"""
    __tablename__ = "literature_references"
    
    id = Column(Integer, primary_key=True)
    source = Column(String(50))  # PubMed, Embase, etc.
    source_id = Column(String(100), index=True)
    title = Column(String(500), nullable=False)
    authors = Column(JSON)  # List of author names
    journal = Column(String(255))
    publication_date = Column(DateTime)
    abstract = Column(Text)
    keywords = Column(JSON)  # List of keywords
    doi = Column(String(100))
    url = Column(String(500))
    citation_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DocumentChunk(Base):
    """Vector-embedded document chunks for RAG retrieval"""
    __tablename__ = "doc_chunks"
    
    id = Column(Integer, primary_key=True)
    source_type = Column(String(50), nullable=False)  # FAERS, MAUDE, PubMed, CSR, etc.
    source_id = Column(String(100), index=True)
    chunk_index = Column(Integer)
    content = Column(Text, nullable=False)
    metadata = Column(JSON)
    embedding = Column(Vector(1536))  # For OpenAI embeddings
    created_at = Column(DateTime, default=datetime.utcnow)


class ClinicalEvaluationReport(Base):
    """Clinical Evaluation Report (CER) data"""
    __tablename__ = "clinical_evaluation_reports"
    
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    title = Column(String(255), nullable=False)
    report_type = Column(String(50))  # MDR, IVDR, FDA, etc.
    version = Column(String(50))
    status = Column(String(50), default="draft")  # draft, in_progress, in_review, completed, archived
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    created_by = Column(Integer)  # User ID
    content = Column(JSON)  # Structured report content
    insights = Column(JSON)  # AI-generated insights
    metadata = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    organization = relationship("Organization", back_populates="reports")
    device = relationship("Device", back_populates="reports")
    sections = relationship("ReportSection", back_populates="report")
    files = relationship("ReportFile", back_populates="report")


class ReportSection(Base):
    """Individual sections of a Clinical Evaluation Report"""
    __tablename__ = "report_sections"
    
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("clinical_evaluation_reports.id"), nullable=False)
    title = Column(String(255), nullable=False)
    section_order = Column(Integer)
    content = Column(Text)
    status = Column(String(50), default="pending")  # pending, in_progress, generated, reviewed, complete
    ai_generated = Column(Boolean, default=False)
    last_modified_by = Column(Integer)  # User ID
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    report = relationship("ClinicalEvaluationReport", back_populates="sections")


class ReportFile(Base):
    """Files associated with Clinical Evaluation Reports"""
    __tablename__ = "report_files"
    
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("clinical_evaluation_reports.id"), nullable=False)
    file_type = Column(String(50))  # pdf, docx, etc.
    file_name = Column(String(255))
    file_path = Column(String(500))
    version = Column(String(50))
    size_bytes = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    report = relationship("ClinicalEvaluationReport", back_populates="files")


class AIAudit(Base):
    """Audit trail for AI interactions (for FDA traceability)"""
    __tablename__ = "ai_audit"
    
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer)
    report_id = Column(Integer, ForeignKey("clinical_evaluation_reports.id"), nullable=True)
    section_id = Column(Integer, ForeignKey("report_sections.id"), nullable=True)
    ai_model = Column(String(100))  # e.g., gpt-4-turbo
    prompt = Column(Text)
    completion = Column(Text)
    tokens_used = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)


class CeleryJob(Base):
    """Status tracking for Celery background jobs"""
    __tablename__ = "celery_jobs"
    
    id = Column(Integer, primary_key=True)
    job_id = Column(String(100), nullable=False, index=True)
    task_name = Column(String(255))
    status = Column(String(50))  # queued, running, completed, failed
    result = Column(JSON)
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)