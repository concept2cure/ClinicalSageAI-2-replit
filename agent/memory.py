"""
IND Copilot Memory Module

This module handles storing and retrieving conversation memory for the IND Copilot,
using pgvector for efficient semantic search.
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

import openai
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import text
from pgvector.sqlalchemy import Vector

# Configure logger
logger = logging.getLogger(__name__)

# Initialize database
DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Initialize OpenAI client
openai_client = openai.AsyncOpenAI(
    api_key=os.environ.get("OPENAI_API_KEY")
)

class ProjectMemory(Base):
    """
    Model for storing project memory entries with vector embeddings
    """
    __tablename__ = "project_memory"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, index=True)
    conversation_id = Column(String(50), index=True)
    role = Column(String(20))  # user, assistant, system, tool
    content = Column(Text)
    embedding = Column(Vector(1536))  # OpenAI embedding dimension
    metadata = Column(Text)  # JSON string for additional data
    created_at = Column(DateTime, default=datetime.utcnow)

async def add_to_memory(
    project_id: int,
    conversation_id: str,
    message: Dict[str, Any]
) -> None:
    """
    Add a message to project memory with embeddings
    
    Args:
        project_id: Project identifier
        conversation_id: Conversation identifier
        message: Message to store, including role and content
    """
    try:
        # Extract message content
        content = message.get("content", "")
        if not content:
            return
        
        # Generate embedding
        embedding_response = await openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=content
        )
        embedding = embedding_response.data[0].embedding
        
        # Store message metadata
        metadata = {
            "timestamp": message.get("timestamp", datetime.utcnow().isoformat()),
        }
        
        if message.get("name"):
            metadata["name"] = message["name"]
        
        # Create database session
        db = SessionLocal()
        try:
            # Create memory record
            memory_entry = ProjectMemory(
                project_id=project_id,
                conversation_id=conversation_id,
                role=message.get("role", "user"),
                content=content,
                embedding=embedding,
                metadata=json.dumps(metadata)
            )
            
            # Add and commit
            db.add(memory_entry)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error adding to memory: {str(e)}")

async def retrieve_from_memory(
    project_id: int,
    query: str,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """
    Retrieve relevant memories using vector similarity search
    
    Args:
        project_id: Project identifier
        query: Search query
        limit: Maximum number of results to return
        
    Returns:
        List of relevant memory entries
    """
    try:
        # Generate query embedding
        embedding_response = await openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=query
        )
        query_embedding = embedding_response.data[0].embedding
        
        # Create database session
        db = SessionLocal()
        try:
            # Execute vector similarity search
            # Note: Using raw SQL for pgvector operations
            query_str = text("""
                SELECT id, project_id, conversation_id, role, content, metadata
                FROM project_memory
                WHERE project_id = :project_id
                ORDER BY embedding <-> :query_embedding
                LIMIT :limit
            """)
            
            result = db.execute(
                query_str,
                {
                    "project_id": project_id,
                    "query_embedding": query_embedding,
                    "limit": limit
                }
            )
            
            # Format results
            memories = []
            for row in result:
                try:
                    metadata = json.loads(row.metadata) if row.metadata else {}
                except:
                    metadata = {}
                
                memories.append({
                    "id": row.id,
                    "project_id": row.project_id,
                    "conversation_id": row.conversation_id,
                    "role": row.role,
                    "content": row.content,
                    "metadata": metadata
                })
            
            return memories
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error retrieving from memory: {str(e)}")
        return []

def initialize_memory_tables():
    """Initialize the database tables needed for memory storage"""
    try:
        # Create pgvector extension if it doesn't exist
        engine.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except:
        logger.warning("Could not create pgvector extension - it may already exist or require superuser")
    
    # Create memory tables
    Base.metadata.create_all(bind=engine)