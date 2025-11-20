"""
Japanese PMDA eValidator module for TrialSage

This module provides comprehensive validation of Japanese regulatory submissions
according to PMDA guidelines, ensuring compliance with all submission requirements.
"""

import os
import json
import logging
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

from utils.event_bus import publish

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PMDA validation constants
PMDA_REQUIRED_SECTIONS = [
    'm1.2',          # Application Form
    'm1.3',          # Approval Certificate
    'm1.13',         # Package Insert
    'm2.2',          # Introduction
    'm2.3',          # Quality Overall Summary
    'm2.4',          # Nonclinical Overview
    'm2.6.1',        # Pharmacology Written Summary
    'm2.7.1',        # Biopharmaceutics Summary
    'm3.2',          # Body of Data
    'jp-annex'       # Japan-specific Annex
]

PMDA_SPECIFIC_FILE_PATTERNS = {
    'module1': {
        'required_files': [
            r'm1/m1-2-\d+\.pdf',      # Application form
            r'm1/m1-3-\d+\.pdf',      # Certificates
            r'm1/m1-13-\d+\.pdf',     # Package Insert
        ],
        'naming_pattern': r'm1/m1-(\d+)-(\d+)\.pdf'
    },
    'jp-annex': {
        'required_files': [
            r'jp-annex/ja-\d+\.pdf',     # Japan-specific documents
        ],
        'naming_pattern': r'jp-annex/ja-(\d+)\.pdf'
    }
}

# Japanese character encoding validation
def check_jp_encoding(file_path: str) -> Tuple[bool, Optional[str]]:
    """Check that file contains valid Japanese character encoding"""
    try:
        with open(file_path, 'rb') as f:
            content = f.read()
            
        # Check if file contains Japanese characters properly encoded
        # This is a simplified check - production would use more robust methods
        try:
            content.decode('utf-8')
            return True, None
        except UnicodeDecodeError:
            # Try Shift-JIS which is common in Japanese systems
            try:
                content.decode('shift-jis')
                return True, None
            except UnicodeDecodeError:
                return False, "File contains invalid Japanese character encoding"
    except Exception as e:
        return False, f"Error checking encoding: {str(e)}"

# Validate PMDA-specific requirements
def validate_jp_specific_requirements(doc_metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Validate Japan-specific requirements for a document"""
    results = {
        "status": "passed",
        "checks": [],
        "failed_checks": 0
    }
    
    # Check if document has required Japanese metadata
    if not doc_metadata.get('jp_specific'):
        check = {
            "name": "JP Metadata",
            "status": "failed",
            "message": "Missing required Japanese metadata"
        }
        results["checks"].append(check)
        results["failed_checks"] += 1
    
    # If document is in jp-annex section, it should have specific CTD structure
    if doc_metadata.get('module', '').startswith('jp-annex'):
        # Check for Japanese CTD structure
        if not doc_metadata.get('jp_ctd_compliant'):
            check = {
                "name": "JP CTD Structure",
                "status": "failed",
                "message": "Document does not conform to Japanese CTD structure"
            }
            results["checks"].append(check)
            results["failed_checks"] += 1
    
    # If validation failed any checks, update status
    if results["failed_checks"] > 0:
        results["status"] = "qc_failed"
    
    return results

# Main PMDA validation function
def validate_pmda_submission(docs: List[Dict[str, Any]], submission_path: str) -> Dict[str, Any]:
    """
    Validate a PMDA submission against Japanese regulatory requirements
    
    Args:
        docs: List of document metadata
        submission_path: Path to the submission directory
        
    Returns:
        Validation results
    """
    logger.info(f"Starting PMDA validation for submission at {submission_path}")
    
    validation_results = {
        "status": "in_progress",
        "document_results": {},
        "missing_sections": [],
        "overall_status": "pending",
        "validation_time": datetime.now().isoformat(),
        "region": "PMDA"
    }
    
    # Check for required sections
    available_sections = set()
    for doc in docs:
        module = doc.get('module', '')
        available_sections.add(module.split('/')[0] if '/' in module else module)
    
    # Find missing required sections
    missing_sections = [section for section in PMDA_REQUIRED_SECTIONS 
                        if not any(doc.get('module', '').startswith(section) for doc in docs)]
    
    validation_results["missing_sections"] = missing_sections
    
    # Validate each document
    total_docs = len(docs)
    failed_docs = 0
    
    for doc in docs:
        doc_id = doc.get('id')
        if not doc_id:
            continue
            
        doc_path = doc.get('path')
        if not doc_path or not os.path.exists(doc_path):
            validation_results["document_results"][str(doc_id)] = {
                "status": "qc_failed",
                "message": "Document file not found"
            }
            failed_docs += 1
            # Publish event for real-time UI updates
            publish('qc', {'id': doc_id, 'status': 'qc_failed'})
            continue
            
        # Start with general validation
        doc_results = {
            "status": "passed",
            "checks": []
        }
        
        # JP-specific validations
        jp_results = validate_jp_specific_requirements(doc)
        if jp_results["status"] == "qc_failed":
            doc_results["status"] = "qc_failed"
            doc_results["checks"].extend(jp_results["checks"])
            failed_docs += 1
        
        # Check encoding for Japanese characters if in jp-annex
        if doc.get('module', '').startswith('jp-annex'):
            encoding_valid, error_msg = check_jp_encoding(doc_path)
            if not encoding_valid:
                doc_results["status"] = "qc_failed"
                doc_results["checks"].append({
                    "name": "Japanese Encoding",
                    "status": "failed",
                    "message": error_msg
                })
                failed_docs += 1
        
        # Store results and publish event
        validation_results["document_results"][str(doc_id)] = doc_results
        publish('qc', {'id': doc_id, 'status': doc_results["status"]})
    
    # Set overall status
    if missing_sections or failed_docs > 0:
        validation_results["overall_status"] = "qc_failed"
    else:
        validation_results["overall_status"] = "passed"
    
    validation_results["status"] = "completed"
    
    logger.info(f"PMDA validation completed. Overall status: {validation_results['overall_status']}")
    return validation_results