"""Document chunking utilities for vector search

This module handles:
1. Extracting text from PDFs and other document formats
2. Chunking text into appropriate sizes for embedding
3. Tracking metadata about chunk origins (page, section)
4. Creating document hashes for version tracking
"""
import os
import re
import hashlib
from typing import List, Dict, Any, Tuple, Optional
import fitz  # PyMuPDF
from sqlalchemy.orm import Session
import logging

from server.models.doc_chunk import DocChunk
from server.utils.cer_retriever import embed

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Chunk size parameters
MAX_CHUNK_SIZE = 1500  # characters
MIN_CHUNK_SIZE = 200  # characters
CHUNK_OVERLAP = 150  # characters

def extract_text_from_pdf(pdf_path: str) -> Dict[int, str]:
    """
    Extract text from a PDF file, returning a dict of page numbers to text content
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Dict mapping page numbers (1-indexed) to text content
    """
    page_texts = {}
    
    try:
        doc = fitz.open(pdf_path)
        for i, page in enumerate(doc):
            page_text = page.get_text("text")
            # Clean up text - remove excessive whitespace
            page_text = re.sub(r'\s+', ' ', page_text).strip()
            page_texts[i + 1] = page_text  # 1-indexed pages
        doc.close()
    except Exception as e:
        logger.error(f"Error extracting text from PDF {pdf_path}: {e}")
        raise
        
    return page_texts

def extract_document_metadata(pdf_path: str) -> Dict[str, Any]:
    """
    Extract metadata from a PDF document
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Dict with metadata fields
    """
    metadata = {}
    
    try:
        doc = fitz.open(pdf_path)
        pdf_metadata = doc.metadata
        
        if pdf_metadata:
            metadata = {
                "title": pdf_metadata.get("title", ""),
                "author": pdf_metadata.get("author", ""),
                "subject": pdf_metadata.get("subject", ""),
                "keywords": pdf_metadata.get("keywords", ""),
                "creator": pdf_metadata.get("creator", ""),
                "producer": pdf_metadata.get("producer", ""),
                "page_count": len(doc),
                "file_size": os.path.getsize(pdf_path)
            }
        doc.close()
    except Exception as e:
        logger.error(f"Error extracting metadata from PDF {pdf_path}: {e}")
    
    return metadata

def chunk_text(text: str, source_page: int = None) -> List[Dict[str, Any]]:
    """
    Split text into chunks appropriate for embedding
    
    Args:
        text: Text to chunk
        source_page: Optional page number for tracking
        
    Returns:
        List of chunk dicts with content and metadata
    """
    chunks = []
    
    # Simple paragraph-based chunking
    paragraphs = [p for p in re.split(r'\n{2,}', text) if p.strip()]
    
    current_chunk = ""
    
    for para in paragraphs:
        # If adding this paragraph exceeds max chunk size and we already have content,
        # save the current chunk and start a new one
        if len(current_chunk) + len(para) > MAX_CHUNK_SIZE and len(current_chunk) >= MIN_CHUNK_SIZE:
            chunk_hash = hashlib.sha256(current_chunk.encode()).hexdigest()
            chunks.append({
                "content": current_chunk,
                "source_page": source_page,
                "chunk_hash": chunk_hash
            })
            
            # Start new chunk with overlap from previous chunk
            if len(current_chunk) > CHUNK_OVERLAP:
                words = current_chunk.split()
                overlap_words = words[-min(30, len(words)):]  # Take last ~30 words for context
                current_chunk = " ".join(overlap_words) + " " + para
            else:
                current_chunk = para
        else:
            if current_chunk:
                current_chunk += " " + para
            else:
                current_chunk = para
    
    # Add the final chunk if it's not empty and meets minimum size
    if current_chunk and len(current_chunk) >= MIN_CHUNK_SIZE:
        chunk_hash = hashlib.sha256(current_chunk.encode()).hexdigest()
        chunks.append({
            "content": current_chunk,
            "source_page": source_page,
            "chunk_hash": chunk_hash
        })
    
    return chunks

def process_document(
    pdf_path: str, 
    document_id: int, 
    db: Session,
    sequence_id: Optional[int] = None
) -> Tuple[int, int]:
    """
    Process a document for vector search by:
    1. Extracting text
    2. Chunking text
    3. Creating embeddings
    4. Storing in database
    
    Args:
        pdf_path: Path to the PDF file
        document_id: ID of the document in the database
        db: Database session
        sequence_id: Optional sequence ID for tracking
        
    Returns:
        Tuple of (chunks_processed, chunks_created)
    """
    try:
        logger.info(f"Processing document: {pdf_path}")
        
        # Extract text from PDF by page
        page_texts = extract_text_from_pdf(pdf_path)
        
        chunks_created = 0
        chunks_processed = 0
        
        # Process each page
        for page_num, page_text in page_texts.items():
            # Skip empty pages
            if not page_text.strip():
                continue
                
            # Chunk the page text
            page_chunks = chunk_text(page_text, page_num)
            chunks_processed += len(page_chunks)
            
            # Create embeddings and store in DB
            for chunk_data in page_chunks:
                # Check if chunk already exists (by hash)
                existing_chunk = db.query(DocChunk).filter_by(
                    chunk_hash=chunk_data["chunk_hash"],
                    document_id=document_id
                ).first()
                
                if existing_chunk:
                    continue
                
                # Create embedding
                embedding_vector = embed(chunk_data["content"])
                
                # Create new chunk
                new_chunk = DocChunk(
                    content=chunk_data["content"],
                    embedding=embedding_vector,
                    document_id=document_id,
                    source_page=chunk_data["source_page"],
                    sequence_id=sequence_id,
                    chunk_hash=chunk_data["chunk_hash"]
                )
                
                db.add(new_chunk)
                chunks_created += 1
        
        # Commit the changes
        db.commit()
        logger.info(f"Document processed: {chunks_processed} chunks processed, {chunks_created} new chunks created")
        
        return chunks_processed, chunks_created
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing document: {e}")
        raise