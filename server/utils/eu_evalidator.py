"""
EU eValidator Integration Module

This module provides integration with the European Medicines Agency (EMA) eValidator system
for validating eCTD submissions according to European regulatory requirements.

Key features:
1. Profile configuration for EU-specific validation rules
2. Execution of validation against submission packages
3. Processing and parsing of validation results
4. Integration with the application's broader validation framework
"""

import os
import json
import logging
from typing import Dict, List, Any, Optional
import subprocess
from pathlib import Path

# Set up logging
logger = logging.getLogger(__name__)

def get_validator_profile() -> Dict:
    """
    Returns the EU validator profile configuration.
    """
    return {
        "name": "EU eValidator",
        "version": "2.0",
        "description": "European Medicines Agency (EMA) eValidator for eCTD submissions",
        "supported_regions": ["EU", "EMA"],
        "file_format_rules": [
            {
                "id": "EU-FF-01",
                "description": "PDF documents must comply with PDF 1.4, 1.5, 1.6, or 1.7",
                "severity": "error"
            },
            {
                "id": "EU-FF-02",
                "description": "PDF files must not contain JavaScript",
                "severity": "error"
            },
            {
                "id": "EU-FF-03",
                "description": "PDF documents must not have security settings that prevent page extraction or printing",
                "severity": "error"
            },
            {
                "id": "EU-FF-04",
                "description": "PDF bookmarks must be provided for documents with 5 or more pages",
                "severity": "warning"
            },
            {
                "id": "EU-FF-05",
                "description": "PDF document file size should not exceed 400 MB",
                "severity": "warning"
            },
            {
                "id": "EU-FF-06",
                "description": "File paths must not exceed 180 characters",
                "severity": "error"
            },
        ],
        "document_rules": [
            {
                "id": "EU-DOC-01", 
                "description": "Mandatory documents for Module 1 must be provided",
                "severity": "error",
                "modules": ["m1"]
            },
            {
                "id": "EU-DOC-02", 
                "description": "Cover letter must be provided in section 1.0",
                "severity": "error",
                "modules": ["m1/eu/10-cover"]
            },
            {
                "id": "EU-DOC-03", 
                "description": "Application form must be provided in section 1.2",
                "severity": "error",
                "modules": ["m1/eu/12-form"]
            },
            {
                "id": "EU-DOC-04", 
                "description": "Product Information documents must be provided in section 1.3",
                "severity": "error",
                "modules": ["m1/eu/13-pi"]
            },
        ],
        "sequence_rules": [
            {
                "id": "EU-SEQ-01",
                "description": "Sequence number must be a 4-digit number",
                "severity": "error"
            },
            {
                "id": "EU-SEQ-02",
                "description": "eu-regional.xml must be present and valid",
                "severity": "error"
            },
            {
                "id": "EU-SEQ-03",
                "description": "index.xml and eu-regional.xml must have matching submission unit types",
                "severity": "error"
            },
        ],
        "metadata_rules": [
            {
                "id": "EU-META-01",
                "description": "Procedure number format must comply with EMA standards",
                "severity": "error"
            },
            {
                "id": "EU-META-02",
                "description": "Product name in metadata must match the SPC",
                "severity": "warning"
            },
        ],
        "required_modules": {
            "initial": [
                {"id": "m1/eu/10-cover", "name": "Cover Letter", "required": True},
                {"id": "m1/eu/12-form", "name": "Application Form", "required": True},
                {"id": "m1/eu/13-pi", "name": "Product Information", "required": True},
                {"id": "m2/23-qos", "name": "Quality Overall Summary", "required": True},
                {"id": "m2/24-nonclin-over", "name": "Nonclinical Overview", "required": True},
                {"id": "m2/25-clin-over", "name": "Clinical Overview", "required": True},
                {"id": "m3/32-body-data", "name": "Body of Data", "required": True},
                {"id": "m5/53-clin-stud-rep", "name": "Clinical Study Reports", "required": True}
            ],
            "variation": [
                {"id": "m1/eu/10-cover", "name": "Cover Letter", "required": True},
                {"id": "m1/eu/12-form", "name": "Application Form", "required": True},
                {"id": "m1/eu/13-pi", "name": "Product Information", "required": False}
            ],
            "renewal": [
                {"id": "m1/eu/10-cover", "name": "Cover Letter", "required": True},
                {"id": "m1/eu/12-form", "name": "Application Form", "required": True},
                {"id": "m1/eu/13-pi", "name": "Product Information", "required": True}
            ]
        }
    }

def validate_eu_specifics(sequence_path: str) -> List[Dict[str, Any]]:
    """
    Perform EU-specific validation checks on a sequence folder.
    
    Args:
        sequence_path: Path to the sequence folder
        
    Returns:
        List of validation issues specific to EU requirements
    """
    issues = []
    
    # Check for presence of eu-regional.xml
    regional_path = os.path.join(sequence_path, "eu-regional.xml")
    if not os.path.exists(regional_path):
        issues.append({
            "rule_id": "EU-SEQ-02",
            "severity": "error",
            "message": "eu-regional.xml is missing",
            "path": regional_path
        })
    
    # Check for valid file paths (max 180 chars)
    for root, dirs, files in os.walk(sequence_path):
        for file in files:
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, sequence_path)
            if len(rel_path) > 180:
                issues.append({
                    "rule_id": "EU-FF-06",
                    "severity": "error",
                    "message": f"File path exceeds 180 characters: {rel_path}",
                    "path": file_path
                })
    
    # Check for PDF compliance in Module 1
    module1_path = os.path.join(sequence_path, "m1")
    if os.path.exists(module1_path):
        for root, dirs, files in os.walk(module1_path):
            for file in files:
                if file.lower().endswith(".pdf"):
                    file_path = os.path.join(root, file)
                    # Check file size
                    size_mb = os.path.getsize(file_path) / (1024 * 1024)
                    if size_mb > 400:
                        issues.append({
                            "rule_id": "EU-FF-05",
                            "severity": "warning",
                            "message": f"PDF file size exceeds 400 MB: {size_mb:.2f} MB",
                            "path": file_path
                        })
    
    return issues

def parse_validation_report(report_path: str) -> Dict[str, Any]:
    """
    Parse an EU eValidator report file
    
    Args:
        report_path: Path to the validation report JSON file
        
    Returns:
        Dictionary containing parsed validation results
    """
    if not os.path.exists(report_path):
        return {"status": "error", "message": "Report file not found"}
    
    try:
        with open(report_path, 'r') as f:
            report_data = json.load(f)
        
        # Process the report data
        validation_results = {
            "status": "success" if report_data.get("pass_status", False) else "failed",
            "validator": "EU eValidator",
            "version": report_data.get("validator_version", "unknown"),
            "timestamp": report_data.get("validation_time", ""),
            "issues": []
        }
        
        # Extract issues from the report
        for issue in report_data.get("issues", []):
            validation_results["issues"].append({
                "rule_id": issue.get("rule_id", "unknown"),
                "severity": issue.get("severity", "error"),
                "message": issue.get("description", ""),
                "path": issue.get("file_path", ""),
                "details": issue.get("details", "")
            })
        
        return validation_results
    
    except Exception as e:
        logger.error(f"Error parsing validation report: {str(e)}")
        return {
            "status": "error",
            "message": f"Failed to parse validation report: {str(e)}"
        }