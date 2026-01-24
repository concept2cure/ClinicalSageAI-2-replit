# 🧠 SagePlus | CSR Vectorizer
# Generates and stores vector embeddings from CSR data for similarity search

import os
import json
import requests
import time
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("csr_vectorization.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("CSR-Vectorizer")

# API Configuration
HF_API_KEY = os.getenv("HF_API_KEY")
HF_EMBEDDING_URL = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2"
HEADERS = {"Authorization": f"Bearer {HF_API_KEY}"}

# Directories
PROCESSED_CSR_DIR = "data/processed_csrs"
VECTOR_DIR = "data/vector_store"

def generate_summary_text(csr_data: Dict[str, Any]) -> str:
    """Generate a natural language summary from structured CSR data for embedding"""
    summary_parts = []
    
    # Add title
    if csr_data.get("title"):
        summary_parts.append(f"Study: {csr_data['title']}")
    
    # Add indication
    if csr_data.get("indication"):
        summary_parts.append(f"Indication: {csr_data['indication']}")
    
    # Add phase
    if csr_data.get("phase"):
        summary_parts.append(f"Phase: {csr_data['phase']}")
    
    # Add study design and arms
    if csr_data.get("arms"):
        arms_str = ", ".join(csr_data["arms"])
        summary_parts.append(f"Arms: {arms_str}")
    
    # Add sample size
    if csr_data.get("sample_size"):
        summary_parts.append(f"Sample size: {csr_data['sample_size']}")
    
    # Add primary endpoints
    if csr_data.get("primary_endpoints"):
        endpoints_str = ", ".join(csr_data["primary_endpoints"])
        summary_parts.append(f"Primary endpoints: {endpoints_str}")
    
    # Add secondary endpoints
    if csr_data.get("secondary_endpoints"):
        endpoints_str = ", ".join(csr_data["secondary_endpoints"])
        summary_parts.append(f"Secondary endpoints: {endpoints_str}")
    
    # Add outcome summary
    if csr_data.get("outcome"):
        summary_parts.append(f"Outcome: {csr_data['outcome']}")
    
    # Add adverse events summary
    if csr_data.get("adverse_events") and isinstance(csr_data["adverse_events"], list):
        ae_summary = []
        for ae in csr_data["adverse_events"][:3]:  # Limit to first 3 AEs
            if isinstance(ae, dict):
                ae_str = f"{ae.get('event', 'Unknown event')} (Grade {ae.get('grade', 'NA')}, {ae.get('count', 0)} cases)"
                ae_summary.append(ae_str)
        
        if ae_summary:
            summary_parts.append(f"Key adverse events: {', '.join(ae_summary)}")
    
    return " ".join(summary_parts)

def get_embedding(text: str) -> List[float]:
    """Get vector embedding for a text using Hugging Face API"""
    if not HF_API_KEY:
        logger.error("HF_API_KEY not set. Cannot generate embeddings.")
        return []
    
    try:
        response = requests.post(
            HF_EMBEDDING_URL, 
            headers=HEADERS, 
            json={"inputs": text}
        )
        
        if response.status_code != 200:
            logger.error(f"Error from Hugging Face API: {response.text}")
            return []
        
        embedding = response.json()
        return embedding
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        return []

def process_csr_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Process a single CSR JSON file to add vector embeddings"""
    try:
        with open(file_path, 'r') as f:
            csr_data = json.load(f)
        
        # Check if already has embedding
        if "embedding" in csr_data and csr_data["embedding"]:
            logger.info(f"Embedding already exists for {file_path}, skipping")
            return csr_data
        
        # Generate summary for embedding if it doesn't exist
        if "vector_summary" not in csr_data or not csr_data["vector_summary"]:
            vector_summary = generate_summary_text(csr_data)
            csr_data["vector_summary"] = vector_summary
        else:
            vector_summary = csr_data["vector_summary"]
        
        # Get embedding
        embedding = get_embedding(vector_summary)
        
        if embedding:
            csr_data["embedding"] = embedding
            
            # Save updated CSR data
            with open(file_path, 'w') as f:
                json.dump(csr_data, f, indent=2)
            
            logger.info(f"Successfully added embedding to {file_path}")
            return csr_data
        else:
            logger.error(f"Failed to generate embedding for {file_path}")
            return None
    except Exception as e:
        logger.error(f"Error processing {file_path}: {e}")
        return None

def process_json_files(input_dir: str = PROCESSED_CSR_DIR, output_dir: str = VECTOR_DIR):
    """Process all JSON files in the input directory and create vector embeddings"""
    os.makedirs(output_dir, exist_ok=True)
    
    # Get all JSON files
    json_files = [os.path.join(input_dir, f) for f in os.listdir(input_dir) if f.endswith('.json')]
    logger.info(f"Found {len(json_files)} JSON files to process")
    
    processed_count = 0
    
    for file_path in json_files:
        try:
            result = process_csr_file(file_path)
            if result:
                processed_count += 1
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
        
        # Sleep to avoid rate limits
        time.sleep(1)
    
    logger.info(f"Successfully processed {processed_count} of {len(json_files)} CSR files")
    return processed_count

def store_vectors_in_database(from_dir: str = PROCESSED_CSR_DIR):
    """Import vectors from JSON files into the search database"""
    from csr_search import CSRSearchEngine
    
    logger.info("Importing vectors into search database...")
    search_engine = CSRSearchEngine()
    imported_count = search_engine.import_directory(from_dir)
    
    logger.info(f"Imported {imported_count} CSR vectors into the search database")
    return imported_count

if __name__ == "__main__":
    logger.info("Starting CSR vectorization process")
    
    # First process all JSON files to add embeddings
    processed = process_json_files()
    
    # Then import them into the search database
    if processed > 0:
        imported = store_vectors_in_database()
        logger.info(f"Completed vectorization process: {processed} processed, {imported} imported")