"""DocChunk model for storing document chunks and their vector embeddings"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from server.db import Base

class DocChunk(Base):
    """
    Document chunk model for vector search
    
    Stores:
    - Text chunk content
    - Vector embedding (OpenAI embedding-3-small)
    - Metadata about source document
    - Reference to parent document
    """
    __tablename__ = "doc_chunks"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)  # embedding-3-small has 1536 dimensions
    
    # Metadata
    document_id = Column(Integer, ForeignKey("documents.id"))
    document = relationship("Document", back_populates="chunks")
    
    # Source information for citation
    source_page = Column(Integer)
    source_section = Column(String(255))
    sequence_id = Column(Integer, ForeignKey("cer_sequences.id"))
    
    # For tracking document version
    chunk_hash = Column(String(64), index=True)
    
    def __repr__(self):
        return f"<DocChunk id={self.id} doc_id={self.document_id} page={self.source_page}>"