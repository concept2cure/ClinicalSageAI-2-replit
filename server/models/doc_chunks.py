"""
Document Chunks Model with Vector Embeddings
Used for semantic search and context-aware document retrieval
"""

from sqlalchemy import Column, Integer, String, Text, ForeignKey, ARRAY, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from pgvector.sqlalchemy import Vector

from server.db import Base

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    # --- Existing Fields ---
    id = Column(Integer, primary_key=True)
    doc_id = Column(String(255), nullable=False, index=True)
    doc_title = Column(String(255), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)  # OpenAI embedding dimension is 1536

    # --- New Fields to Add ---
    ectd_section = Column(String(255), nullable=True, index=True)  # (New) e.g., '5.3.5.1'
    page_number = Column(Integer, nullable=True)  # (New)
    doc_type = Column(String(255), nullable=True, index=True)  # (New) e.g., 'CSR', 'ICH_Guideline'
    region_tag = Column(ARRAY(String), nullable=True)  # (New) e.g., ['FDA', 'EMA']

    # Add a unique constraint to prevent duplicate chunks for the same document
    __table_args__ = (UniqueConstraint('doc_id', 'chunk_index', name='_doc_chunk_uc'),)