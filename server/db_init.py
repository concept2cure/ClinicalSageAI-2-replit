"""Database initialization script for TrialSage

This script:
1. Creates the pgvector extension if it doesn't exist
2. Creates necessary tables for the application
3. Creates vector indices for efficient similarity search
"""
import os
import sqlalchemy as sa
from sqlalchemy import text

from server.db import engine, Base, SessionLocal
from server.models.doc_chunk import DocChunk

def init_vector_extension():
    """Initialize the pgvector extension in PostgreSQL"""
    with engine.connect() as conn:
        # Check if pgvector extension exists
        result = conn.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector'"))
        extension_exists = result.scalar() == 'vector'
        
        if not extension_exists:
            print("Creating pgvector extension...")
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
            print("pgvector extension created successfully")
        else:
            print("pgvector extension already exists")

def create_tables():
    """Create all tables defined in SQLAlchemy models"""
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully")

def create_vector_indices():
    """Create vector indices for efficient similarity search"""
    with engine.connect() as conn:
        # Check if index exists
        result = conn.execute(text(
            "SELECT indexname FROM pg_indexes WHERE tablename = 'doc_chunks' AND indexname = 'doc_chunks_embedding_idx'"
        ))
        index_exists = result.scalar() is not None
        
        if not index_exists:
            print("Creating vector index on doc_chunks.embedding...")
            conn.execute(text(
                "CREATE INDEX doc_chunks_embedding_idx ON doc_chunks USING ivfflat (embedding vector_l2_ops) WITH (lists = 100)"
            ))
            conn.commit()
            print("Vector index created successfully")
        else:
            print("Vector index already exists")

def init_db():
    """Initialize the database with required extensions and tables"""
    try:
        # Ensure the pgvector extension is installed
        init_vector_extension()
        
        # Create all tables
        create_tables()
        
        # Create vector indices
        create_vector_indices()
        
        print("Database initialization complete")
    except Exception as e:
        print(f"Error initializing database: {e}")

if __name__ == "__main__":
    init_db()