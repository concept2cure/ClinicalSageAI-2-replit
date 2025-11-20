"""
Embedding routes for document processing
"""
import os
import subprocess
import hashlib
import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from server.db import get_db
from server.models.doc_chunk import DocChunk
from server.models.csr import CSR

router = APIRouter(prefix="/api/embeddings")

def run_embed_delta_script():
    """Run the delta embedding script as a background task"""
    process_marker_path = os.path.join(os.path.dirname(__file__), "../scripts/.embedding_in_progress")
    
    try:
        result = subprocess.run(
            ["python", "-m", "server.scripts.embed_delta"], 
            capture_output=True, 
            text=True,
            check=True
        )
        print(f"Embedding script output: {result.stdout}")
        
        # Remove the process marker file when done
        if os.path.exists(process_marker_path):
            os.remove(process_marker_path)
            
        # Update metadata with completion timestamp
        metadata_path = os.path.join(os.path.dirname(__file__), "../scripts/.embedding_metadata")
        with open(metadata_path, 'w') as f:
            f.write(str(datetime.datetime.now()))
            
        return {"success": True, "message": "Embedding completed successfully"}
    except subprocess.CalledProcessError as e:
        print(f"Embedding script error: {e.stderr}")
        
        # Remove the process marker file on error too
        if os.path.exists(process_marker_path):
            os.remove(process_marker_path)
            
        return {"success": False, "message": f"Embedding failed: {e.stderr}"}

@router.get("/status")
async def get_embedding_status(db: Session = Depends(get_db)):
    """
    Get the current status of document embeddings
    """
    try:
        # Count total documents
        total_documents = db.query(func.count(CSR.id)).scalar()
        
        # Count documents with embeddings by checking for non-null content_hash
        embedded_documents = db.query(func.count(CSR.id)).filter(CSR.content_hash != None).scalar()
        
        # Count total chunks
        total_chunks = db.query(func.count(DocChunk.id)).scalar()
        
        # Check for pending changes - documents with content_hash but no chunks
        documents_with_chunks = db.query(CSR.id).join(
            DocChunk, CSR.id == DocChunk.document_id
        ).distinct().subquery()
        
        documents_without_chunks = db.query(func.count(CSR.id)).filter(
            CSR.content_hash != None,
            ~CSR.id.in_(documents_with_chunks)
        ).scalar()
        
        # Check if embedding process is currently running by looking for a marker file
        process_marker_path = os.path.join(os.path.dirname(__file__), "../scripts/.embedding_in_progress")
        is_processing = os.path.exists(process_marker_path)
        
        # Get last processed time from a metadata file
        last_processed = None
        metadata_path = os.path.join(os.path.dirname(__file__), "../scripts/.embedding_metadata")
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    metadata = f.read().strip()
                    if metadata:
                        last_processed = metadata
            except Exception as e:
                print(f"Error reading metadata file: {e}")
        
        return {
            "totalDocuments": total_documents,
            "embeddedDocuments": embedded_documents,
            "totalChunks": total_chunks,
            "pendingChanges": documents_without_chunks,
            "isProcessing": is_processing,
            "lastProcessed": last_processed
        }
    except Exception as e:
        print(f"Error getting embedding status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get embedding status: {str(e)}")

@router.post("/process-changed")
async def process_changed_documents(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Process documents that have changes by running the delta embedding script.
    This runs the script in the background to avoid blocking the API request.
    """
    # Create a marker file to indicate processing is happening
    process_marker_path = os.path.join(os.path.dirname(__file__), "../scripts/.embedding_in_progress")
    with open(process_marker_path, 'w') as f:
        f.write(str(datetime.datetime.now()))
    
    # Update metadata with current timestamp
    metadata_path = os.path.join(os.path.dirname(__file__), "../scripts/.embedding_metadata")
    with open(metadata_path, 'w') as f:
        f.write(str(datetime.datetime.now()))
    
    # Queue the task to run in the background
    background_tasks.add_task(run_embed_delta_script)
    
    # Return immediately with status
    return {"status": "processing", "message": "Delta embedding started in the background"}