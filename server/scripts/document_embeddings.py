"""
Document Embeddings Generator Script

This script processes documents from the CSR database,
chunks them into manageable segments, and creates vector embeddings
for semantic search and context-aware retrieval.

Usage:
    python -m server.scripts.document_embeddings

Dependencies:
    - pgvector
    - openai
    - sqlalchemy
    - tqdm
"""

import os
import re
import time
from typing import List, Dict, Any, Optional
from tqdm import tqdm

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import openai
from openai import OpenAI

# Import models
from server.models.doc_chunks import DocumentChunk
from server.models.csr import CSR
from server.db import Base, engine

# Constants
EMBED_MODEL = "text-embedding-ada-002"  # OpenAI embedding model
CHUNK_SIZE = 800  # Approximate token size for each chunk
CHUNK_OVERLAP = 100  # Overlap between chunks to maintain context
MAX_BATCH_SIZE = 100  # Number of documents to process in one batch
RATE_LIMIT_DELAY = 0.1  # Delay between API calls to prevent rate limiting

# Text cleaning pattern
CLEANUP_PATTERN = re.compile(r'\s+')

def get_client():
    """Initialize and return OpenAI client"""
    # Check if API key is available
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")
    
    return OpenAI(api_key=api_key)

def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Split text into overlapping chunks of specified size
    
    Args:
        text: Text to split
        size: Approximate chunk size in tokens (estimated by word count)
        overlap: Number of overlapping tokens between chunks
        
    Returns:
        List of text chunks
    """
    # Clean text
    text = CLEANUP_PATTERN.sub(' ', text)
    words = text.split()
    
    chunks = []
    for i in range(0, len(words), size - overlap):
        chunk = ' '.join(words[i:i + size])
        if chunk.strip():  # Skip empty chunks
            chunks.append(chunk)
    
    return chunks

def create_embedding(client: OpenAI, text: str) -> List[float]:
    """
    Create an embedding for the given text
    
    Args:
        client: OpenAI client
        text: Text to embed
        
    Returns:
        Embedding vector
    """
    try:
        response = client.embeddings.create(
            model=EMBED_MODEL,
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error creating embedding: {e}")
        return None

def process_document(
    client: OpenAI, 
    doc_id: str, 
    doc_title: str, 
    content: str, 
    session
) -> int:
    """
    Process a document by chunking it and creating embeddings
    
    Args:
        client: OpenAI client
        doc_id: Document ID
        doc_title: Document title
        content: Document content
        session: Database session
        
    Returns:
        Number of chunks created
    """
    # Delete existing chunks for this document
    session.query(DocumentChunk).filter(DocumentChunk.doc_id == doc_id).delete()
    
    # Chunk the document
    chunks = chunk_text(content)
    
    # Create embeddings for each chunk
    for i, chunk in enumerate(chunks):
        time.sleep(RATE_LIMIT_DELAY)  # Rate limiting
        embedding = create_embedding(client, chunk)
        
        if embedding:
            chunk_obj = DocumentChunk(
                doc_id=doc_id,
                doc_title=doc_title,
                chunk_index=i,
                content=chunk,
                embedding=embedding
            )
            session.add(chunk_obj)
    
    # Commit after processing each document
    session.commit()
    return len(chunks)

def main():
    """Main execution function"""
    print("Initializing document embedding process...")
    
    # Create database session
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Ensure tables exist
    Base.metadata.create_all(engine)
    
    # Initialize OpenAI client
    client = get_client()
    
    # Get documents from CSR table (adjust query as needed for your schema)
    print("Fetching documents from database...")
    try:
        documents = session.query(CSR).filter(CSR.status == "approved").all()
    except Exception as e:
        print(f"Error fetching documents: {e}")
        documents = []
    
    total_documents = len(documents)
    print(f"Found {total_documents} documents to process")
    
    # Process documents
    total_chunks = 0
    
    for doc in tqdm(documents, desc="Processing documents", unit="doc"):
        if not doc.content:
            print(f"Skipping document {doc.id} - no content")
            continue
        
        doc_title = getattr(doc, 'title', f"Document {doc.id}")
        chunks = process_document(client, str(doc.id), doc_title, doc.content, session)
        total_chunks += chunks
        print(f"Processed document {doc.id} ({doc_title}) - created {chunks} chunks")
    
    print(f"Embedding process complete! {total_chunks} chunks created from {total_documents} documents")

if __name__ == "__main__":
    main()