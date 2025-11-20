"""
Route handler for retrieving a history of generated Module 3.2 CMC document versions.
Scans the generated documents directory and returns metadata and content previews.
"""

from fastapi import APIRouter, HTTPException
import os
import glob
import json
from typing import List, Dict, Any
import re
from datetime import datetime
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Directory where generated documents are stored
EXPORT_DIR = "generated_documents"

@router.get("/versions", response_model=List[Dict[str, Any]], tags=["Version History"])
async def get_versions():
    """
    Retrieve version history of generated Module 3.2 CMC documents.
    Returns a list of document metadata including paths, creation dates, and content previews.
    """
    try:
        if not os.path.exists(EXPORT_DIR):
            logger.warning(f"Export directory {EXPORT_DIR} does not exist")
            return []
        
        # Get all txt files in the export directory
        txt_files = glob.glob(f"{EXPORT_DIR}/module32_*.txt")
        versions = []
        
        for txt_file in txt_files:
            try:
                # Extract information from filename
                file_basename = os.path.basename(txt_file)
                match = re.match(r"module32_(.+)_(.+)\.txt", file_basename)
                
                if not match:
                    continue
                
                drug_name = match.group(1).replace('_', ' ')
                file_id = match.group(2)
                
                # Get corresponding PDF filename
                pdf_file = f"{EXPORT_DIR}/module32_{drug_name.replace(' ', '_')}_{file_id}.pdf"
                
                # Get creation time
                created_at = datetime.fromtimestamp(os.path.getctime(txt_file)).isoformat()
                
                # Read beginning of file for preview
                with open(txt_file, 'r', encoding='utf-8') as f:
                    content = f.read(1000)  # Read first 1000 chars for preview
                
                # Add to versions list
                versions.append({
                    "version_id": file_id,
                    "drug_name": drug_name,
                    "draft_text": content,
                    "txt_path": txt_file,
                    "pdf_path": pdf_file,
                    "created_at": created_at
                })
            
            except Exception as e:
                logger.error(f"Error processing file {txt_file}: {str(e)}")
                # Continue with next file
        
        # Sort by creation date, newest first
        versions.sort(key=lambda x: x['created_at'], reverse=True)
        
        return versions
    
    except Exception as e:
        logger.error(f"Failed to retrieve versions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve version history")