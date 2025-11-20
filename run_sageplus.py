# 🧠 SagePlus | Main Runner Script
# Launches the SagePlus CSR processing pipeline

import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("sageplus_run.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("SagePlus-Runner")

def check_environment():
    """Check if the environment is properly set up"""
    required_dirs = ["csrs", "csr_json", "data/processed_csrs", "data/vector_store"]
    
    # Check required directories
    for directory in required_dirs:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            logger.info(f"Created directory: {directory}")
    
    # Check required environment variables
    hf_api_key = os.getenv("HF_API_KEY")
    if not hf_api_key:
        logger.error("HF_API_KEY environment variable is not set")
        logger.error("Please set this variable to use Hugging Face API for extraction and embeddings")
        return False
    
    # Check for PDF files
    pdf_count = len([f for f in os.listdir("csrs") if f.lower().endswith(".pdf")])
    if pdf_count == 0:
        logger.warning("No PDF files found in the 'csrs' directory")
        logger.warning("Please add some CSR PDF files to process")
    else:
        logger.info(f"Found {pdf_count} PDF files to process")
    
    return True

def main():
    """Main function to run the SagePlus pipeline"""
    # Check the environment
    if not check_environment():
        logger.error("Environment check failed. Exiting.")
        sys.exit(1)
    
    # Launch the pipeline
    from sage_plus_pipeline import SagePlusPipeline
    
    logger.info("Starting SagePlus pipeline...")
    pipeline = SagePlusPipeline(use_db=False)
    
    # Process all PDFs
    results = pipeline.process_directory()
    
    # Report results
    if results:
        logger.info(f"Successfully processed {len(results)} CSRs")
        logger.info("Pipeline execution completed successfully")
        
        # Display first 3 CSR IDs
        for i, result in enumerate(results[:3]):
            logger.info(f"Processed CSR #{i+1}: {result.get('csr_id', 'Unknown')} - {result.get('title', 'Untitled')}")
    else:
        logger.warning("No CSRs were processed successfully")
    
    logger.info("To search or query the processed CSRs, use the API server:")
    logger.info("python csr_api.py")

if __name__ == "__main__":
    main()