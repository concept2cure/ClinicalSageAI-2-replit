"""
Setup Test Environment Script

This script prepares directories and demo data for testing the RegIntel validation API.
"""
import os
import json
import logging
import shutil
from datetime import datetime
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Create directories
def create_directories():
    """Create all necessary directories for the application"""
    # Path definitions
    dirs = [
        "uploads",
        "validation_logs",
        "define_outputs"
    ]
    
    for dir in dirs:
        full_path = f"backend/{dir}"
        os.makedirs(full_path, exist_ok=True)
        logger.info(f"Directory created or verified: {full_path}")
        
    return True

# Create sample validation results
def create_sample_validations():
    """Create sample validation results for testing"""
    # Sample validation ID
    validation_id = str(uuid.uuid4())
    
    # Sample result data
    result = {
        "id": validation_id,
        "filename": "sample_protocol.pdf",
        "engineId": "regintel-protocol",
        "engineName": "Protocol Validator",
        "timestamp": datetime.now().isoformat(),
        "status": "completed",
        "validations": [
            {
                "id": "REG001",
                "rule": "Document structure validation",
                "status": "success",
                "message": "Document structure meets requirements"
            },
            {
                "id": "REG002",
                "rule": "Regulatory header verification",
                "status": "success",
                "message": "Headers contain required information"
            },
            {
                "id": "REG003",
                "rule": "Section completeness check",
                "status": "success",
                "message": "All required sections present"
            },
            {
                "id": "REG004",
                "rule": "Format consistency validation",
                "status": "warning",
                "message": "Inconsistent formatting detected in section 3.2"
            },
            {
                "id": "REG005",
                "rule": "Cross-reference validation",
                "status": "error",
                "message": "Missing cross-references in section 4.1",
                "path": "Section 4.1",
                "lineNumber": 42
            },
            {
                "id": "PDF001",
                "rule": "PDF/A compliance check",
                "status": "warning",
                "message": "Document is not PDF/A compliant"
            }
        ],
        "summary": {
            "success": 3,
            "warning": 2,
            "error": 1
        }
    }
    
    # Save result to file
    result_path = f"backend/validation_logs/{validation_id}.json"
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)
        
    logger.info(f"Sample validation result created: {result_path}")
    
    # Create empty define XML output
    define_path = f"backend/define_outputs/{validation_id}.xml"
    with open(define_path, "w") as f:
        f.write(f"<define-xml id='{validation_id}'>Sample Define-XML content</define-xml>")
        
    logger.info(f"Sample define XML created: {define_path}")
    
    return validation_id

def main():
    """Main function to setup the test environment"""
    logger.info("Setting up test environment for RegIntel API...")
    
    # Create directories
    create_directories()
    
    # Create sample validations
    validation_id = create_sample_validations()
    
    logger.info("Test environment setup complete!")
    logger.info(f"Sample validation ID: {validation_id}")
    logger.info("Make sure to set your JWT token in localStorage for authentication")
    logger.info("You can use 'python generate_test_token.py 1 admin' to generate a token")

if __name__ == "__main__":
    main()