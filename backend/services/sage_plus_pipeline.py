# 🧠 SagePlus | Main Pipeline Orchestrator
# Orchestrates the full CSR extraction, vectorization, and search pipeline

import os
import time
import logging
from typing import Dict, List, Any, Optional
import json
from dotenv import load_dotenv

# Import pipeline components
from csr_extractor import process_csr_file, process_csr_folder
from csr_vectorizer import process_json_files, store_vectors_in_database
from csr_database import CSRDatabase
from csr_search import CSRSearchEngine

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("sageplus_pipeline.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("SagePlus-Pipeline")

class SagePlusPipeline:
    """Main pipeline orchestrator for SagePlus CSR processing"""
    
    def __init__(self, use_db=False):
        """Initialize the pipeline"""
        self.search_engine = CSRSearchEngine()
        self.db = CSRDatabase() if use_db else None
        
        # Ensure directories exist
        os.makedirs("csrs", exist_ok=True)
        os.makedirs("csr_json", exist_ok=True)
        os.makedirs("data/processed_csrs", exist_ok=True)
        os.makedirs("data/vector_store", exist_ok=True)
        
    def process_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """Process a single PDF through the entire pipeline"""
        logger.info(f"Starting pipeline for {pdf_path}")
        
        # Step 1: Extract structured data from PDF
        logger.info("Step 1: Extracting data...")
        csr_data = process_csr_file(pdf_path)
        
        if not csr_data:
            logger.error("Extraction failed")
            return {}
            
        csr_id = csr_data.get("csr_id", "unknown")
        logger.info(f"Extracted data for CSR ID: {csr_id}")
        
        # Step 2: Process JSON to add vector embeddings
        logger.info("Step 2: Generating vector embeddings...")
        json_path = f"data/processed_csrs/{csr_id}.json"
        if os.path.exists(json_path):
            with open(json_path, "r") as f:
                processed_csr = json.load(f)
                
            if "embedding" not in processed_csr or not processed_csr["embedding"]:
                logger.info("Generating embedding...")
                from csr_vectorizer import process_csr_file as process_vector
                processed_csr = process_vector(json_path)
        
        # Step 3: Import into search database
        logger.info("Step 3: Importing into search database...")
        self.search_engine.import_csr(json_path)
        
        # Step 4: Import into database if using it
        if self.db:
            logger.info("Step 4: Storing in database...")
            self.db.store_csr_data(csr_data)
            
            if "embedding" in csr_data and csr_data["embedding"]:
                logger.info("Storing vector data in database...")
                self.db.store_vector_data(
                    csr_id=csr_data["csr_id"],
                    summary=csr_data.get("vector_summary", ""),
                    embedding=csr_data["embedding"]
                )
        
        logger.info(f"Pipeline completed for {pdf_path}")
        return csr_data
        
    def process_directory(self, input_dir: str = "csrs") -> List[Dict[str, Any]]:
        """Process all PDFs in a directory"""
        logger.info(f"Processing directory: {input_dir}")
        
        # Step 1: Extract structured data from all PDFs
        logger.info("Step 1: Extracting data from PDFs...")
        processed_count = process_csr_folder(input_dir)
        logger.info(f"Extracted data from {processed_count} PDFs")
        
        # Step 2: Generate vector embeddings for all CSRs
        logger.info("Step 2: Generating vector embeddings...")
        embedded_count = process_json_files()
        logger.info(f"Generated embeddings for {embedded_count} CSRs")
        
        # Step 3: Import all into search database
        logger.info("Step 3: Importing into search database...")
        imported_count = store_vectors_in_database()
        logger.info(f"Imported {imported_count} CSRs into search database")
        
        # Return list of processed CSRs
        results = []
        processed_dir = "data/processed_csrs"
        for filename in os.listdir(processed_dir):
            if filename.endswith(".json"):
                file_path = os.path.join(processed_dir, filename)
                with open(file_path, "r") as f:
                    try:
                        csr_data = json.load(f)
                        results.append(csr_data)
                    except json.JSONDecodeError:
                        logger.error(f"Error loading {file_path}")
        
        logger.info(f"Pipeline completed. Processed {len(results)} CSRs")
        return results
    
    def import_existing_vectors(self) -> int:
        """Import existing vector files into the database"""
        logger.info("Importing existing vector files into search database...")
        return store_vectors_in_database()

def main():
    """Main function to run the pipeline"""
    logger.info("Starting SagePlus pipeline")
    
    pipeline = SagePlusPipeline()
    
    # Process all PDFs in csrs directory
    results = pipeline.process_directory()
    
    logger.info(f"Processed {len(results)} CSRs successfully")
    
    # Example search query
    if results:
        logger.info("Testing search functionality...")
        search_engine = CSRSearchEngine()
        
        # Text search
        query = "Phase 2 trial with positive outcome"
        text_results = search_engine.search_by_embedding(query, limit=3)
        logger.info(f"Found {len(text_results)} results for text query: '{query}'")
        
        # Field search
        field_results = search_engine.search_by_field(phase="Phase 2", limit=3)
        logger.info(f"Found {len(field_results)} results for Phase 2 trials")
        
        # Combined search
        combined_results = search_engine.combined_search(
            query_text="efficacy endpoint",
            phase="Phase 3",
            limit=3
        )
        logger.info(f"Found {len(combined_results)} results for combined search")
    
    logger.info("Pipeline execution completed")

if __name__ == "__main__":
    main()