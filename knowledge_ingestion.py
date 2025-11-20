
import os
import sys
import json
import logging
import hashlib
import PyPDF2
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("knowledge_ingestion")

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONTENT_DIR = os.path.join(DATA_DIR, "processed_knowledge")
METADATA_DIR = os.path.join(DATA_DIR, "knowledge_metadata")
PDF_DIR = os.path.join(BASE_DIR, "attached_assets")

# Create directories if they don't exist
os.makedirs(CONTENT_DIR, exist_ok=True)
os.makedirs(METADATA_DIR, exist_ok=True)

def extract_text_from_pdf(pdf_path):
    """Extract text from a PDF file using PyPDF2."""
    text = ""
    try:
        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            num_pages = len(reader.pages)
            
            # Extract text from each page
            for page_num in range(num_pages):
                page = reader.pages[page_num]
                text += page.extract_text() + "\n\n"
                
            logger.info(f"Successfully extracted text from {pdf_path} ({num_pages} pages)")
            return text
    except Exception as e:
        logger.error(f"Error extracting text from {pdf_path}: {str(e)}")
        return None

def detect_ich_guideline_type(text, filename):
    """Detect ICH guideline type and specific attributes."""
    # Defaults
    guideline_type = "unknown"
    document_category = "regulatory"
    document_class = "ich_guideline"
    region = "global"
    version = "unknown"
    status = "unknown"
    
    # Identify guideline based on content and filename
    if "Q1" in filename:
        guideline_type = "stability"
        if "Q1A" in filename:
            document_class = "ich_q1a_stability_testing"
        elif "Q1B" in filename:
            document_class = "ich_q1b_photostability"
    elif "Q2" in filename:
        guideline_type = "analytical_validation"
        document_class = "ich_q2_validation"
    elif "Q3" in filename:
        guideline_type = "impurities"
        if "Q3A" in filename:
            document_class = "ich_q3a_impurities"
        elif "Q3C" in filename:
            document_class = "ich_q3c_residual_solvents"
        elif "Q3D" in filename:
            document_class = "ich_q3d_elemental_impurities"
    elif "Q12" in filename:
        guideline_type = "lifecycle_management"
        document_class = "ich_q12_lifecycle"
    
    # Detect status from content
    if "step 4" in text.lower():
        status = "adopted"
    elif "step 2" in text.lower():
        status = "draft"
        
    # Detect version info
    if "(R2)" in filename or "R2" in filename:
        version = "R2"
    elif "(R1)" in filename or "R1" in filename:
        version = "R1"
        
    return {
        "guideline_type": guideline_type,
        "document_category": document_category,
        "document_class": document_class,
        "region": region,
        "version": version,
        "status": status
    }

def process_pdf(pdf_path):
    """Process a PDF file and extract structured data."""
    filename = os.path.basename(pdf_path)
    logger.info(f"Processing PDF: {filename}")
    
    # Extract text from PDF
    text = extract_text_from_pdf(pdf_path)
    if not text:
        logger.error(f"Failed to extract text from {filename}")
        return None
    
    # Generate document ID using MD5 hash of content
    doc_id = hashlib.md5(text.encode('utf-8')).hexdigest()
    
    # Detect ICH guideline type and attributes
    guideline_info = detect_ich_guideline_type(text, filename)
    
    # Create metadata
    metadata = {
        "document_id": doc_id,
        "filename": filename,
        "source_path": pdf_path,
        "extraction_date": datetime.now().isoformat(),
        "document_type": "ich_guideline",
        "document_title": filename.replace('.pdf', ''),
        **guideline_info
    }
    
    # Save text content
    content_path = os.path.join(CONTENT_DIR, f"{doc_id}.txt")
    with open(content_path, 'w', encoding='utf-8') as f:
        f.write(text)
    
    # Save metadata
    metadata_path = os.path.join(METADATA_DIR, f"{doc_id}.json")
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"Successfully processed {filename} (ID: {doc_id})")
    return doc_id

def process_directory(directory=PDF_DIR):
    """Process all PDF files in a directory."""
    processed_files = []
    
    # Get all PDF files in the directory
    pdf_files = [f for f in os.listdir(directory) if f.lower().endswith('.pdf')]
    
    # Focus on ICH guidelines first
    ich_guidelines = [f for f in pdf_files if any(x in f for x in ["ICH", "Q1", "Q2", "Q3", "Q12"])]
    other_pdfs = [f for f in pdf_files if f not in ich_guidelines]
    
    # Process ICH guidelines first, then other PDFs
    for pdf_list in [ich_guidelines, other_pdfs]:
        for pdf_file in pdf_list:
            pdf_path = os.path.join(directory, pdf_file)
            doc_id = process_pdf(pdf_path)
            if doc_id:
                processed_files.append({
                    "filename": pdf_file,
                    "document_id": doc_id
                })
    
    # Generate summary report
    summary = {
        "timestamp": datetime.now().isoformat(),
        "processed_files": len(processed_files),
        "files": processed_files
    }
    
    summary_path = os.path.join(METADATA_DIR, "ingestion_summary.json")
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    
    logger.info(f"Processed {len(processed_files)} files. Summary saved to {summary_path}")
    return summary

if __name__ == "__main__":
    logger.info("Starting knowledge ingestion process")
    summary = process_directory()
    logger.info(f"Ingestion complete. Processed {summary['processed_files']} files.")
