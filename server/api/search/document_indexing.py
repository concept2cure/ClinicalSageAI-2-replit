"""Document indexing API for vector search"""
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import os
import tempfile
import logging

from server.db import get_db
from server.utils.doc_chunker import process_document, extract_document_metadata

router = APIRouter()
logger = logging.getLogger(__name__)

class DocumentIndexResponse(BaseModel):
    """Response for document indexing requests"""
    status: str
    document_id: int
    chunks_processed: int
    chunks_created: int
    message: str

@router.post("/api/documents/index", response_model=DocumentIndexResponse)
async def index_document(
    background_tasks: BackgroundTasks,
    document_id: int = Form(...),
    sequence_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Index a document for vector search
    
    Args:
        background_tasks: FastAPI background tasks
        document_id: ID of the document in the database
        sequence_id: Optional sequence ID
        file: Uploaded document (PDF)
        db: Database session
        
    Returns:
        Document indexing status
    """
    # Check if it's a PDF
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Save the uploaded file temporarily
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
    temp_file_path = temp_file.name
    
    try:
        # Copy content from uploaded file to temp file
        with temp_file:
            content = await file.read()
            temp_file.write(content)
        
        # Schedule background processing
        def process_in_background(file_path: str, doc_id: int, seq_id: Optional[int]):
            try:
                # Extract metadata
                metadata = extract_document_metadata(file_path)
                logger.info(f"Extracted metadata: {metadata}")
                
                # Process for vector search
                chunks_processed, chunks_created = process_document(
                    file_path, doc_id, db, seq_id
                )
                
                logger.info(f"Document {doc_id} indexed: {chunks_processed} chunks processed, {chunks_created} new chunks")
                
                # TODO: Update document status in the database
            except Exception as e:
                logger.error(f"Error in background document processing: {e}")
            finally:
                # Clean up the temporary file
                if os.path.exists(file_path):
                    os.unlink(file_path)
        
        # Start background processing
        background_tasks.add_task(
            process_in_background, 
            temp_file_path, 
            document_id, 
            sequence_id
        )
        
        return DocumentIndexResponse(
            status="processing",
            document_id=document_id,
            chunks_processed=0,
            chunks_created=0,
            message="Document indexing has been scheduled"
        )
        
    except Exception as e:
        # Clean up the temporary file in case of error
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        
        logger.error(f"Error in document indexing: {e}")
        raise HTTPException(status_code=500, detail=str(e))