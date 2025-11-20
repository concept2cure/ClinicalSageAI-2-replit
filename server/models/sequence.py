"""
IND Sequence Models

These SQLAlchemy models define the database structure for storing IND submissions,
including sequence metadata, document associations, and lifecycle tracking.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class INDSequence(Base):
    """
    Represents an eCTD sequence in an IND submission.
    """
    __tablename__ = 'ind_sequences'
    
    id = Column(Integer, primary_key=True)
    sequence = Column(String(10), nullable=False, index=True)  # e.g., "0001"
    ind_number = Column(String(20))  # e.g., "123456"
    created = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    status = Column(String(20), default="draft")
    doc_count = Column(Integer, default=0)
    base_path = Column(Text)
    xml = Column(Text)  # Path to generated index.xml
    validation_status = Column(String(20), default="pending")
    validation_result = Column(JSON)
    
    # FDA ESG acknowledgment fields
    ack1_path = Column(String)  # Path to first acknowledgment (receipt)
    ack2_path = Column(String)  # Path to second acknowledgment (ESG processing)
    ack3_path = Column(String)  # Path to third acknowledgment (centre receipt)
    
    # Relationship to documents in this sequence
    documents = relationship("INDSequenceDoc", back_populates="sequence_obj")
    
    def __repr__(self):
        return f"<INDSequence {self.sequence}>"

class INDSequenceDoc(Base):
    """
    Represents a document included in an eCTD sequence.
    Tracks document lifecycle operations and placement within modules.
    """
    __tablename__ = 'ind_sequence_docs'
    
    id = Column(Integer, primary_key=True)
    sequence = Column(String(10), ForeignKey('ind_sequences.sequence'), nullable=False)
    doc_id = Column(Integer, ForeignKey('documents.id'), nullable=False)
    module = Column(String(50), nullable=False)  # e.g., "m5.3.1"
    op = Column(String(20), nullable=False, default="new")  # e.g., "new", "replace", "delete"
    file_path = Column(Text, nullable=False)
    md5 = Column(String(32))
    xml_id = Column(String(50))  # For lifecycle reference
    
    # Relationships
    sequence_obj = relationship("INDSequence", back_populates="documents")
    document = relationship("Document")
    
    def __repr__(self):
        return f"<INDSequenceDoc {self.doc_id} in {self.sequence}>"

class Document(Base):
    """
    Represents a document in the system.
    This is a simplified version - your actual document model may differ.
    """
    __tablename__ = 'documents'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    version = Column(String(20), nullable=False)
    path = Column(Text, nullable=False)
    status = Column(String(20), default="draft")  # draft, in_review, approved, rejected
    doc_metadata = Column(JSON)  # Renamed from metadata to avoid SQLAlchemy reserved name
    slug = Column(String(100))
    
    # PDF QC fields
    qc_status = Column(String(20), default="pending")  # pending, passed, failed
    qc_report_path = Column(Text)  # Path to QC JSON report
    qc_pdf_path = Column(Text)  # Path to QC-corrected PDF/A version
    qc_timestamp = Column(DateTime)  # When QC was performed
    
    def __repr__(self):
        return f"<Document {self.id}: {self.title}>"

class SubmissionProfile(Base):
    """
    Represents submission profile settings for different regulatory authorities
    """
    __tablename__ = 'submission_profiles'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    region = Column(String(20), nullable=False)  # FDA, EMA, PMDA, etc.
    company_id = Column(Integer, nullable=False)
    contact_name = Column(String(100))
    contact_email = Column(String(100))
    contact_phone = Column(String(50))
    address = Column(Text)
    submission_type = Column(String(50))  # New, Amendment, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<SubmissionProfile {self.id}: {self.name} ({self.region})>"

class INDAuditTrail(Base):
    """
    Audit trail for IND sequence operations.
    Maintains Part 11 compliance by tracking all user interactions.
    """
    __tablename__ = 'ind_audit_trail'
    
    id = Column(Integer, primary_key=True)
    sequence = Column(String(10), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    user_id = Column(Integer)
    action = Column(String(50), nullable=False)
    details = Column(JSON)
    
    def __repr__(self):
        return f"<INDAuditTrail {self.action} on {self.sequence}>"