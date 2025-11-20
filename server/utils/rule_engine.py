"""Rule Engine for submission validation and intelligent guidance

This module provides real-time rule checking and guidance for documents
as they are added to or moved within a submission sequence.
"""
import logging
import json
from typing import Dict, List, Optional, Any, Tuple
import os
from openai import OpenAI

# Configure logging
logger = logging.getLogger(__name__)

# Initialize OpenAI client
client = OpenAI()

# Load regulatory rules
def load_regulatory_rules(region: str = "FDA") -> Dict:
    """
    Load regulatory rules for the specified region
    
    Args:
        region: Regulatory region (FDA, EMA, PMDA)
        
    Returns:
        Dictionary of rules
    """
    try:
        rules_path = os.path.join(
            os.path.dirname(__file__), 
            f"../data/regulatory_rules/{region.lower()}_rules.json"
        )
        
        if not os.path.exists(rules_path):
            # If specific region rules don't exist, use default
            rules_path = os.path.join(
                os.path.dirname(__file__), 
                "../data/regulatory_rules/default_rules.json"
            )
            
        with open(rules_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load rules for {region}: {e}")
        # Return empty rules if file load fails
        return {"modules": {}, "dependencies": {}}

# Basic rule-based checks
def check_module_rules(module_id: str, doc_type: str, region: str) -> List[Dict]:
    """
    Check if a document type is valid for the specified module
    
    Args:
        module_id: Module identifier (e.g., 'm3.2.p')
        doc_type: Document type
        region: Regulatory region
        
    Returns:
        List of rule violation dictionaries
    """
    rules = load_regulatory_rules(region)
    violations = []
    
    # Check module placement rules
    if module_id in rules.get("modules", {}):
        module_rules = rules["modules"][module_id]
        
        # Check allowed document types
        if "allowed_types" in module_rules and doc_type not in module_rules["allowed_types"]:
            violations.append({
                "rule": "invalid_document_type",
                "severity": "warning",
                "message": f"Document type '{doc_type}' may not be appropriate for module {module_id}",
                "suggestion": f"Consider placing in {', '.join(module_rules.get('suggested_redirect', ['appropriate module']))}"
            })
            
        # Check required naming conventions
        if "naming_pattern" in module_rules:
            pattern = module_rules["naming_pattern"]
            # Implementation of regex pattern matching would go here
            
    return violations

def check_dependency_rules(module_id: str, existing_modules: List[str], region: str) -> List[Dict]:
    """
    Check if dependencies for a module are satisfied
    
    Args:
        module_id: Module identifier
        existing_modules: List of existing module IDs in the submission
        region: Regulatory region
        
    Returns:
        List of rule violation dictionaries
    """
    rules = load_regulatory_rules(region)
    violations = []
    
    # Check dependencies
    if "dependencies" in rules and module_id in rules["dependencies"]:
        required_modules = rules["dependencies"][module_id]
        for req in required_modules:
            if req not in existing_modules:
                violations.append({
                    "rule": "missing_dependency",
                    "severity": "error",
                    "message": f"Module {req} is required when including {module_id}",
                    "suggestion": f"Add the required {req} document before finalizing"
                })
                
    return violations

# AI-powered rule checking
async def check_ai_guidance(
    module_id: str, 
    doc_type: str, 
    doc_title: str, 
    doc_content: Optional[str] = None,
    region: str = "FDA"
) -> List[Dict]:
    """
    Use AI to generate intelligent guidance based on document content and placement
    
    Args:
        module_id: Module identifier
        doc_type: Document type
        doc_title: Document title
        doc_content: Optional document content excerpt
        region: Regulatory region
        
    Returns:
        List of AI guidance dictionaries
    """
    try:
        # Prepare the prompt with context
        content_excerpt = ""
        if doc_content:
            # Truncate content to avoid excessive token usage
            content_excerpt = f"Content excerpt: {doc_content[:1000]}..."
        
        # Define the system prompt with regulatory expertise
        system_prompt = f"""You are a regulatory affairs expert specialized in {region} submissions.
Evaluate if this document belongs in the specified module and provide guidance.
Respond with JSON only containing:
1. "appropriate": boolean - Is this an appropriate placement?
2. "reasoning": string - Brief explanation (max 100 words)
3. "suggestions": array of strings - Alternative locations or improvements
4. "missing_dependencies": array of strings - Required documents that might be missing"""
        
        # Define the user prompt with document details
        user_prompt = f"""Document: "{doc_title}" (Type: {doc_type})
Target module: {module_id}
Regulatory region: {region}
{content_excerpt}"""
        
        # Make the API call with JSON response format
        response = client.chat.completions.create(
            model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        # Parse the response
        guidance = json.loads(response.choices[0].message.content)
        
        # Format the guidance for frontend display
        results = []
        
        # Add appropriateness check
        if not guidance.get("appropriate", True):
            results.append({
                "rule": "ai_placement_check",
                "severity": "warning",
                "message": guidance.get("reasoning", "This document may not be appropriate for this module"),
                "suggestion": "Consider: " + ", ".join(guidance.get("suggestions", ["Review placement"]))
            })
            
        # Add missing dependencies
        for dep in guidance.get("missing_dependencies", []):
            results.append({
                "rule": "ai_missing_dependency",
                "severity": "info",
                "message": f"You may need to include: {dep}",
                "suggestion": "Consider adding this document to complete the submission"
            })
            
        return results
    except Exception as e:
        logger.error(f"AI guidance error: {e}")
        return [{
            "rule": "ai_guidance_error",
            "severity": "info",
            "message": "Could not generate AI guidance at this time",
            "suggestion": "Continue with standard regulatory guidelines"
        }]

async def evaluate_document_placement(
    doc_id: int,
    module_id: str,
    doc_type: str,
    doc_title: str,
    existing_modules: List[str] = None,
    doc_content: Optional[str] = None,
    region: str = "FDA"
) -> Dict[str, Any]:
    """
    Comprehensive evaluation of document placement
    
    Combines rule-based and AI-based checks
    
    Args:
        doc_id: Document ID
        module_id: Target module ID
        doc_type: Document type
        doc_title: Document title
        existing_modules: List of existing modules in submission
        doc_content: Optional document content excerpt
        region: Regulatory region
        
    Returns:
        Dictionary with evaluation results
    """
    if existing_modules is None:
        existing_modules = []
        
    # Perform rule-based checks
    module_violations = check_module_rules(module_id, doc_type, region)
    dependency_violations = check_dependency_rules(module_id, existing_modules, region)
    
    # Get AI guidance
    ai_guidance = await check_ai_guidance(module_id, doc_type, doc_title, doc_content, region)
    
    # Combine all results
    all_guidance = module_violations + dependency_violations + ai_guidance
    
    # Determine overall status
    has_errors = any(item["severity"] == "error" for item in all_guidance)
    has_warnings = any(item["severity"] == "warning" for item in all_guidance)
    
    if has_errors:
        status = "error"
    elif has_warnings:
        status = "warning"
    else:
        status = "ok"
        
    return {
        "document_id": doc_id,
        "module_id": module_id,
        "status": status,
        "guidance": all_guidance
    }