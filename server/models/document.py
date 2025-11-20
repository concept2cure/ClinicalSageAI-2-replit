"""Document model for CER and CSR documents"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from server.db import Base

class Document(Base):
    """
    Document model for CER/CSR documents
    
    Stores:
    - Document metadata
    - References to sequences
    - Processing status
    """
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    document_type = Column(String(50), index=True)  # CER, CSR, Protocol, etc.
    file_path = Column(String(512))
    file_hash = Column(String(64), index=True)
    
    # Metadata
    metadata = Column(JSON)
    sequence_id = Column(Integer, ForeignKey("cer_sequences.id"), index=True)
    sequence = relationship("CERSequence", back_populates="documents")
    
    # Status tracking
    status = Column(String(50), index=True, default="pending")  # pending, processing, indexed, failed
    processing_errors = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    indexed_at = Column(DateTime)
    
    # Relationships
    chunks = relationship("DocChunk", back_populates="document", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Document id={self.id} title='{self.title}' type='{self.document_type}'>"