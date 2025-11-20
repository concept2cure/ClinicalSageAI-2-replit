"""
Explanation Router for RegIntel API

This module provides endpoints for rule explanations and fix suggestions.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
import logging
import json
import os
from backend.app.dependencies import get_current_user

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Define explanation database (in a real implementation, this would be in a database)
RULE_EXPLANATIONS = {
    "REG001": {
        "title": "Document Structure Validation",
        "description": "This rule validates that the document follows the required structure according to regulatory guidelines. The document must contain all the mandatory sections in the correct order.",
        "requirement": "ICH M4 Common Technical Document guidelines specify a specific structure for regulatory submissions.",
        "impact": "Failure to follow the required structure may lead to delays or rejection of the submission."
    },
    "REG002": {
        "title": "Regulatory Header Verification",
        "description": "This rule checks that all regulatory headers contain the required information such as document ID, version number, date, and approval signatures.",
        "requirement": "FDA Guidance for Industry: eCTD Technical Conformance Guide requires specific header formats.",
        "impact": "Missing or incorrect header information may delay review or lead to requests for additional information."
    },
    "REG003": {
        "title": "Section Completeness Check",
        "description": "This rule verifies that all required sections are present and contain appropriate content according to the document type.",
        "requirement": "ICH E3 Structure and Content of Clinical Study Reports defines required sections for CSRs.",
        "impact": "Incomplete sections may result in reviewers being unable to properly assess the submission."
    },
    "REG004": {
        "title": "Format Consistency Validation",
        "description": "This rule checks for consistent formatting throughout the document, including fonts, headings, tables, and figures.",
        "requirement": "Regulatory agencies expect professional, consistently formatted documents for efficient review.",
        "impact": "Inconsistent formatting reduces readability and may indicate careless document preparation."
    },
    "REG005": {
        "title": "Cross-reference Validation",
        "description": "This rule verifies that all cross-references within the document are valid and point to the correct sections or tables.",
        "requirement": "Good documentation practices require accurate internal referencing for clarity.",
        "impact": "Broken cross-references reduce document navigability and can suggest incomplete quality control."
    },
    "PDF001": {
        "title": "PDF/A Compliance Check",
        "description": "This rule checks whether the PDF document complies with the PDF/A standard, which ensures long-term archival quality.",
        "requirement": "FDA recommends PDF/A format for submissions to ensure long-term readability.",
        "impact": "Non-compliant PDFs may not be readable in the future or may not work with regulatory review tools."
    }
}

# Fix suggestions
FIX_SUGGESTIONS = {
    "REG001": [
        "Review ICH M4 guidelines to ensure your document follows the required structure",
        "Use the TrialSage document template which has pre-configured correct structure",
        "Implement the missing sections: Executive Summary, Introduction, and Methods"
    ],
    "REG002": [
        "Add the required header elements: Document ID, Version Number, Date, and Status",
        "Ensure all pages contain consistent header information",
        "Use the RegIntel Header Wizard to generate compliant headers"
    ],
    "REG003": [
        "Add the missing sections identified in the validation report",
        "Ensure each section contains the minimum required content",
        "Reference the appropriate regulatory guidance document for each section's requirements"
    ],
    "REG004": [
        "Apply consistent heading styles throughout the document",
        "Use the document's style guide for all formatting",
        "Run the RegIntel Format Checker to identify and fix all inconsistencies"
    ],
    "REG005": [
        "Update cross-references to point to the correct sections",
        "Use automatic cross-referencing features in your document editor",
        "Run the cross-reference validator tool to find and fix all broken references"
    ],
    "PDF001": [
        "Convert your document to PDF/A format using Adobe Acrobat's PDF/A compliance tool",
        "Check for embedded fonts and remove any non-embedded fonts",
        "Use the RegIntel PDF Converter to create compliant PDF/A documents"
    ]
}

@router.get("/explain/{rule_id}")
async def explain_rule(
    rule_id: str,
    user_token: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get detailed explanation for a validation rule
    
    Args:
        rule_id: The ID of the rule to explain
        
    Returns:
        Dict: Detailed explanation of the rule
    """
    try:
        if rule_id not in RULE_EXPLANATIONS:
            logger.warning(f"Rule explanation not found: {rule_id}")
            raise HTTPException(status_code=404, detail="Rule explanation not found")
            
        return RULE_EXPLANATIONS[rule_id]
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving rule explanation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving rule explanation: {str(e)}")

@router.get("/fix/{rule_id}")
async def suggest_fix(
    rule_id: str,
    user_token: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get fix suggestions for a validation rule
    
    Args:
        rule_id: The ID of the rule to get fix suggestions for
        
    Returns:
        Dict: List of fix suggestions
    """
    try:
        if rule_id not in FIX_SUGGESTIONS:
            logger.warning(f"Fix suggestions not found: {rule_id}")
            raise HTTPException(status_code=404, detail="Fix suggestions not found")
            
        return {"suggestions": FIX_SUGGESTIONS[rule_id]}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving fix suggestions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving fix suggestions: {str(e)}")

@router.get("/rules")
async def list_rules(
    user_token: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get a list of all validation rules
    
    Returns:
        List: All validation rules with their explanations
    """
    try:
        return RULE_EXPLANATIONS
            
    except Exception as e:
        logger.error(f"Error retrieving rule list: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving rule list: {str(e)}")