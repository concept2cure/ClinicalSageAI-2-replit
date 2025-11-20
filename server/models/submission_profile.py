"""
Submission Profile Models

This module defines database models for regional submission profiles (FDA, EMA, PMDA, etc.)
and their associated regional configuration settings.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class SubmissionProfile(Base):
    """
    Represents a regulatory submission profile (FDA, EMA, PMDA, etc.).
    Profiles define region-specific submission requirements and are used
    to generate properly formatted CTD submissions for different authorities.
    """
    __tablename__ = 'submission_profiles'
    
    id = Column(Integer, primary_key=True)
    code = Column(String(10), nullable=False, unique=True)  # e.g., "fda", "ema", "pmda", "hc"
    name = Column(String(100), nullable=False)  # e.g., "US FDA", "EU EMA", etc.
    dtd_version = Column(String(20))  # e.g., "3.2.2" for FDA
    active = Column(Boolean, default=True)
    created = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Region-specific settings
    settings = Column(JSON)  # Store region-specific settings as JSON
    
    # Validator settings
    validator_profile = Column(String(100))  # e.g., "fda_us_regional", "ema_eu_regional"
    
    # Path to DTD files
    dtd_path = Column(String(255))
    
    # Relationship to sequences using this profile
    sequences = relationship("INDSequence", back_populates="profile")
    
    def __repr__(self):
        return f"<SubmissionProfile {self.code}: {self.name}>"

# Update INDSequence model to include profile relationship
from server.models.sequence import INDSequence

# Add profile_id column to INDSequence
if not hasattr(INDSequence, 'profile_id'):
    INDSequence.profile_id = Column(Integer, ForeignKey('submission_profiles.id'))
    INDSequence.profile = relationship("SubmissionProfile", back_populates="sequences")

# Module 1 Regional Document Types
class RegionalDocumentType(Base):
    """
    Defines regional document types for Module 1, which varies by region.
    These are used to properly categorize and place documents in the CTD structure.
    """
    __tablename__ = 'regional_document_types'
    
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey('submission_profiles.id'), nullable=False)
    code = Column(String(50), nullable=False)  # e.g., "m1-cover-letter", "m1-application-form"
    name = Column(String(255), nullable=False)
    path_template = Column(String(255), nullable=False)  # e.g., "m1/eu/10-cover/cover.pdf"
    required = Column(Boolean, default=False)
    description = Column(Text)
    
    # Relationship to profile
    profile = relationship("SubmissionProfile")
    
    def __repr__(self):
        return f"<RegionalDocumentType {self.code}: {self.name}>"