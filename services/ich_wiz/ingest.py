#!/usr/bin/env python
"""
ICH Wiz Ingestion Module

This module provides functionality to ingest ICH guidelines documents from
various sources, extract text, and index them for semantic search.
"""
import os
import sys
import glob
import re
import time
import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Tuple, Set

import PyPDF2
import structlog

from services.ich_wiz.config import settings
from services.ich_wiz.indexer import PineconeIndexer
from services.ich_wiz.metrics import DOCUMENT_CHUNKS, time_and_count

# Initialize structured logging
logger = structlog.get_logger(__name__)

# Initialize the indexer
indexer = PineconeIndexer(
    api_key=settings.PINECONE_API_KEY,
    environment=settings.PINECONE_ENVIRONMENT,
    index_name=settings.PINECONE_INDEX_NAME,
)

def clean_text(text: str) -> str:
    """
    Clean up text extracted from documents.
    
    Args:
        text: The text to clean
        
    Returns:
        Cleaned text
    """
    # Replace multiple newlines with a single newline
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Replace multiple spaces with a single space
    text = re.sub(r' {2,}', ' ', text)
    
    # Remove form feed characters
    text = text.replace('\f', '')
    
    # Strip leading/trailing whitespace
    return text.strip()

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract text from a PDF file.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        Extracted text
    """
    logger.info(f"Extracting text from PDF: {file_path}")
    try:
        text = ""
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text() + "\n\n"
        
        return clean_text(text)
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        return ""

def extract_text_from_file(file_path: str) -> str:
    """
    Extract text from a file based on its extension.
    
    Args:
        file_path: Path to the file
        
    Returns:
        Extracted text
    """
    file_ext = os.path.splitext(file_path)[1].lower()
    
    if file_ext == '.pdf':
        return extract_text_from_pdf(file_path)
    elif file_ext in ['.txt', '.md']:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return clean_text(f.read())
        except Exception as e:
            logger.error(f"Error reading text file: {str(e)}")
            return ""
    elif file_ext in ['.json']:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return clean_text(json.dumps(data, indent=2))
                elif isinstance(data, list):
                    return clean_text("\n\n".join(json.dumps(item, indent=2) for item in data))
                else:
                    return clean_text(str(data))
        except Exception as e:
            logger.error(f"Error reading JSON file: {str(e)}")
            return ""
    else:
        logger.warning(f"Unsupported file extension: {file_ext}")
        return ""

def split_text_into_chunks(text: str, max_chunk_size: int = 1000, overlap: int = 100) -> List[str]:
    """
    Split text into overlapping chunks for indexing.
    
    Args:
        text: The text to split
        max_chunk_size: Maximum size of each chunk
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of text chunks
    """
    if not text:
        return []
    
    # Split text into paragraphs
    paragraphs = [p for p in text.split('\n\n') if p.strip()]
    
    chunks = []
    current_chunk = ""
    
    for paragraph in paragraphs:
        # If adding this paragraph would exceed max_chunk_size
        if len(current_chunk) + len(paragraph) > max_chunk_size:
            # Save the current chunk
            if current_chunk:
                chunks.append(current_chunk)
            
            # Start a new chunk
            current_chunk = paragraph
        else:
            # Add the paragraph to the current chunk
            if current_chunk:
                current_chunk += "\n\n"
            current_chunk += paragraph
    
    # Add the last chunk if it's not empty
    if current_chunk:
        chunks.append(current_chunk)
    
    # If we only have one chunk, just return it
    if len(chunks) <= 1:
        return chunks
    
    # Create overlapping chunks
    overlapping_chunks = []
    prev_chunk_end = ""
    
    for i, chunk in enumerate(chunks):
        # Add overlap from previous chunk
        if i > 0 and prev_chunk_end:
            overlapping_chunks.append(prev_chunk_end + "\n\n" + chunk)
        else:
            overlapping_chunks.append(chunk)
        
        # Save the end of the current chunk for the next iteration
        words = chunk.split()
        if len(words) > overlap:
            prev_chunk_end = " ".join(words[-overlap:])
        else:
            prev_chunk_end = chunk
    
    return overlapping_chunks

def get_metadata_from_filename(file_path: str) -> Dict[str, Any]:
    """
    Extract metadata from the filename.
    
    Args:
        file_path: Path to the file
        
    Returns:
        Metadata dictionary
    """
    file_name = os.path.basename(file_path)
    file_ext = os.path.splitext(file_name)[1].lower()
    
    # Extract document type from filename
    doc_type = "Unknown"
    if "implementation" in file_name.lower():
        doc_type = "Implementation Report"
    elif "q" in file_name.lower() and any(str(i) for i in range(10) if str(i) in file_name):
        doc_type = "Quality Guideline"
    elif "e" in file_name.lower() and any(str(i) for i in range(10) if str(i) in file_name):
        doc_type = "Efficacy Guideline"
    elif "s" in file_name.lower() and any(str(i) for i in range(10) if str(i) in file_name):
        doc_type = "Safety Guideline"
    elif "m" in file_name.lower() and any(str(i) for i in range(10) if str(i) in file_name):
        doc_type = "Multidisciplinary Guideline"
    elif "ectd" in file_name.lower() or "ctd" in file_name.lower():
        doc_type = "eCTD/CTD Guideline"
    elif "definition" in file_name.lower():
        doc_type = "Definitions"
    
    # Extract date if available in filename (format: YYYY_MMDD)
    date_match = re.search(r'(\d{4})_(\d{2})(\d{2})', file_name)
    publication_date = None
    if date_match:
        year, month, day = date_match.groups()
        publication_date = f"{year}-{month}-{day}"
    
    return {
        "source": file_name,
        "document_type": doc_type,
        "publication_date": publication_date,
        "file_extension": file_ext,
    }

def index_document(file_path: str) -> bool:
    """
    Index a document in the vector database.
    
    Args:
        file_path: Path to the document
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Extract text from the document
        text = extract_text_from_file(file_path)
        if not text:
            logger.warning(f"No text extracted from {file_path}")
            return False
        
        # Get metadata
        metadata = get_metadata_from_filename(file_path)
        
        # Split text into chunks
        chunks = split_text_into_chunks(text)
        
        # Index each chunk
        for i, chunk in enumerate(chunks):
            # Generate a unique ID for this chunk
            chunk_id = f"{os.path.basename(file_path)}-{i}"
            
            # Add chunk-specific metadata
            chunk_metadata = metadata.copy()
            chunk_metadata["chunk_index"] = i
            chunk_metadata["chunk_count"] = len(chunks)
            
            # Index the chunk
            with time_and_count(DOCUMENT_CHUNKS, source=metadata.get("document_type", "Unknown")):
                success = indexer.index_document(
                    document_id=chunk_id,
                    text=chunk,
                    metadata=chunk_metadata
                )
            
            if not success:
                logger.error(f"Failed to index chunk {i} of {file_path}")
        
        logger.info(f"Successfully indexed {file_path} as {len(chunks)} chunks")
        return True
    except Exception as e:
        logger.error(f"Error indexing document {file_path}: {str(e)}")
        return False

def scan_directory(directory: str, processed_files: Optional[Set[str]] = None) -> List[str]:
    """
    Scan a directory for documents to index.
    
    Args:
        directory: Directory path to scan
        processed_files: Set of already processed files to skip
        
    Returns:
        List of file paths to process
    """
    if processed_files is None:
        processed_files = set()
    
    logger.info(f"Scanning directory: {directory}")
    
    # Get all PDF, TXT, MD, and JSON files
    file_patterns = [
        os.path.join(directory, "**", "*.pdf"),
        os.path.join(directory, "**", "*.txt"),
        os.path.join(directory, "**", "*.md"),
        os.path.join(directory, "**", "*.json"),
    ]
    
    files = []
    for pattern in file_patterns:
        files.extend(glob.glob(pattern, recursive=True))
    
    # Filter out already processed files
    new_files = [f for f in files if f not in processed_files]
    
    logger.info(f"Found {len(new_files)} new files to process")
    return new_files

def run_ingest(
    guidelines_dir: Optional[str] = None,
    uploads_dir: Optional[str] = None
) -> Tuple[int, int]:
    """
    Run the ingestion process.
    
    Args:
        guidelines_dir: Directory containing ICH guidelines
        uploads_dir: Directory containing user uploads
        
    Returns:
        Tuple of (success_count, failure_count)
    """
    if guidelines_dir is None:
        guidelines_dir = settings.GUIDELINES_DIR
    
    if uploads_dir is None:
        uploads_dir = settings.UPLOADS_DIR
    
    logger.info("Starting ingestion process")
    
    # Load list of already processed files
    processed_files_path = os.path.join(settings.DATA_DIR, "processed_files.json")
    processed_files = set()
    
    if os.path.exists(processed_files_path):
        try:
            with open(processed_files_path, 'r') as f:
                processed_files = set(json.load(f))
        except Exception as e:
            logger.error(f"Error loading processed files: {str(e)}")
    
    # Scan directories for files to process
    files_to_process = []
    files_to_process.extend(scan_directory(guidelines_dir, processed_files))
    files_to_process.extend(scan_directory(uploads_dir, processed_files))
    
    if not files_to_process:
        logger.info("No new files to process")
        return 0, 0
    
    # Process each file
    success_count = 0
    failure_count = 0
    
    for file_path in files_to_process:
        logger.info(f"Processing file: {file_path}")
        
        if index_document(file_path):
            success_count += 1
            processed_files.add(file_path)
            
            # Save progress after each successful file
            try:
                with open(processed_files_path, 'w') as f:
                    json.dump(list(processed_files), f)
            except Exception as e:
                logger.error(f"Error saving processed files: {str(e)}")
        else:
            failure_count += 1
    
    logger.info(f"Ingestion complete. Successes: {success_count}, Failures: {failure_count}")
    return success_count, failure_count

if __name__ == "__main__":
    run_ingest()