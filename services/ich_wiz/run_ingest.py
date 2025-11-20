#!/usr/bin/env python
"""
ICH Wiz Ingestion Script

This script runs the document ingestion process for ICH Wiz.
"""
import os
import sys
import argparse
import logging
from pathlib import Path

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ich-wiz-ingest")

# Add parent directory to path
parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(parent_dir)

try:
    from services.ich_wiz.config import settings
    from services.ich_wiz.ingest import run_ingest
except ImportError as e:
    logger.error(f"Failed to import required modules: {e}")
    logger.error("Make sure all dependencies are installed and the path is correct.")
    sys.exit(1)

def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description="Run ICH Wiz document ingestion.")
    parser.add_argument(
        "--guidelines-dir",
        help="Directory containing ICH guidelines documents",
        default=None
    )
    parser.add_argument(
        "--uploads-dir",
        help="Directory containing user uploads",
        default=None
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging"
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.debug("Verbose logging enabled")
    
    guidelines_dir = args.guidelines_dir or settings.GUIDELINES_DIR
    uploads_dir = args.uploads_dir or settings.UPLOADS_DIR
    
    logger.info(f"Guidelines directory: {guidelines_dir}")
    logger.info(f"Uploads directory: {uploads_dir}")
    
    # Create directories if they don't exist
    os.makedirs(guidelines_dir, exist_ok=True)
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Run ingestion
    logger.info("Starting ingestion process")
    success_count, failure_count = run_ingest(
        guidelines_dir=guidelines_dir,
        uploads_dir=uploads_dir
    )
    
    logger.info(f"Ingestion complete. Successes: {success_count}, Failures: {failure_count}")
    
    return 0 if failure_count == 0 else 1

if __name__ == "__main__":
    sys.exit(main())