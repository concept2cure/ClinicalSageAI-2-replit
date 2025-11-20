# 🧠 SagePlus | Test Script for CSR Pipeline
# Tests the CSR extraction and embedding pipeline with a sample CSR

import os
import sys
import logging
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SagePlus-Test")

def test_pipeline():
    """Test the SagePlus pipeline with sample data"""
    # Check if HF_API_KEY is set
    hf_api_key = os.getenv("HF_API_KEY")
    if not hf_api_key:
        logger.error("❌ HF_API_KEY not found in environment variables!")
        logger.error("Please set HF_API_KEY in your .env file or environment.")
        return False

    # Check if we have any PDFs in the csrs directory
    if not os.path.exists("csrs"):
        os.makedirs("csrs")
        logger.warning("⚠️ 'csrs' directory created, but no PDFs found.")
        logger.info("Please add at least one CSR PDF to the 'csrs' directory.")
        return False

    pdf_files = [f for f in os.listdir("csrs") if f.lower().endswith(".pdf")]
    if not pdf_files:
        logger.warning("⚠️ No PDF files found in 'csrs' directory.")
        logger.info("Please add at least one CSR PDF to the 'csrs' directory.")
        return False

    # Import our modules
    logger.info("Importing pipeline modules...")
    try:
        from csr_extractor import extract_text_from_pdf, extract_structured_data
        from csr_vectorizer import generate_summary_text, get_embedding
    except ImportError as e:
        logger.error(f"❌ Error importing pipeline modules: {e}")
        return False

    # Select first PDF for testing
    test_pdf = os.path.join("csrs", pdf_files[0])
    logger.info(f"Testing with PDF: {test_pdf}")

    # Test PDF extraction
    logger.info("Testing PDF text extraction...")
    try:
        text = extract_text_from_pdf(test_pdf)
        text_sample = text[:500] + "..." if len(text) > 500 else text
        logger.info(f"✅ Successfully extracted text ({len(text)} characters)")
        logger.info(f"Text sample: {text_sample}")
    except Exception as e:
        logger.error(f"❌ Error extracting text from PDF: {e}")
        return False

    # Test structured data extraction
    logger.info("Testing structured data extraction with LLM...")
    try:
        data = extract_structured_data(text[:8000])  # Use first 8000 chars to avoid token limits
        logger.info(f"✅ Successfully extracted structured data")
        logger.info(f"Extracted fields: {list(data.keys())}")
    except Exception as e:
        logger.error(f"❌ Error extracting structured data: {e}")
        return False

    # Test summary generation
    logger.info("Testing summary generation...")
    try:
        summary = generate_summary_text(data)
        logger.info(f"✅ Successfully generated summary")
        logger.info(f"Summary: {summary}")
    except Exception as e:
        logger.error(f"❌ Error generating summary: {e}")
        return False

    # Test embedding generation
    logger.info("Testing embedding generation...")
    try:
        embedding = get_embedding(summary)
        logger.info(f"✅ Successfully generated embedding vector of dimension {len(embedding)}")
    except Exception as e:
        logger.error(f"❌ Error generating embedding: {e}")
        return False

    # All tests passed
    logger.info("🎉 All pipeline tests passed successfully!")
    return True

if __name__ == "__main__":
    logger.info("🧪 Starting SagePlus pipeline test...")
    success = test_pipeline()
    if success:
        logger.info("✅ Pipeline test completed successfully!")
        sys.exit(0)
    else:
        logger.error("❌ Pipeline test failed!")
        sys.exit(1)