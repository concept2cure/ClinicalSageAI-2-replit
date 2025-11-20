"""CERSequence model for Clinical Evaluation Report sequences"""
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from server.db import Base

class CERSequence(Base):
    """
    CER Sequence model
    
    Represents a group of documents within a specific Clinical Evaluation Report sequence.
    Each sequence corresponds to a regulatory submission package.
    """
    __tablename__ = "cer_sequences"
    
    id = Column(Integer, primary_key=True, index=True)
    sequence_number = Column(String(50), index=True)  # e.g., "0001", "0002"
    title = Column(String(255), nullable=False)
    description = Column(Text)
    
    # Metadata
    region = Column(String(50), index=True)  # FDA, EMA, PMDA, etc.
    status = Column(String(50), index=True, default="draft")  # draft, submitted, approved, etc.
    metadata = Column(JSON)
    is_valid = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    submitted_at = Column(DateTime)
    
    # XML generation
    has_eu_regional = Column(Boolean, default=False)
    has_ectd_index = Column(Boolean, default=False)
    
    # Relationships
    documents = relationship("Document", back_populates="sequence")
    
    def __repr__(self):
        return f"<CERSequence id={self.id} number='{self.sequence_number}' region='{self.region}'>"