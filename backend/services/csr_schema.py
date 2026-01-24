# 🧠 SagePlus | CSR Schema Validation and Normalization
# Defines the standard schema for CSR data and provides validation/normalization functions

import os
import json
import re
from typing import Dict, List, Any, Optional, Union

# Define the standard CSR schema
CSR_SCHEMA = {
    "csr_id": str,  # Unique identifier for the CSR
    "title": str,  # Study title
    "indication": str,  # Medical condition being studied
    "phase": str,  # Clinical trial phase
    "arms": List[str],  # List of study arms
    "sample_size": int,  # Total number of participants
    "primary_endpoints": List[str],  # List of primary endpoints
    "secondary_endpoints": List[str],  # List of secondary endpoints
    "outcome": str,  # Overall outcome (e.g., "Positive", "Negative", "Inconclusive")
    "adverse_events": List[Dict],  # List of adverse events
    "raw_text": str,  # Original text content
    "vector_summary": str,  # Generated summary for vector embedding
    "embedding": List[float],  # Vector embedding
}

# Normalized values for standard fields
PHASE_MAPPING = {
    "1": "Phase 1",
    "1a": "Phase 1",
    "1b": "Phase 1",
    "i": "Phase 1",
    "2": "Phase 2",
    "2a": "Phase 2",
    "2b": "Phase 2",
    "ii": "Phase 2",
    "2/3": "Phase 2/3",
    "ii/iii": "Phase 2/3",
    "3": "Phase 3",
    "3a": "Phase 3",
    "3b": "Phase 3",
    "iii": "Phase 3",
    "4": "Phase 4",
    "iv": "Phase 4",
    "0": "Phase 0",
    "phase 1": "Phase 1",
    "phase 2": "Phase 2",
    "phase 3": "Phase 3",
    "phase 4": "Phase 4",
    "phase 0": "Phase 0",
    "phase 2/3": "Phase 2/3",
}

OUTCOME_MAPPING = {
    "positive": "Positive",
    "negative": "Negative",
    "met": "Positive",
    "failed": "Negative",
    "mixed": "Mixed",
    "inconclusive": "Inconclusive",
    "not met": "Negative",
    "success": "Positive",
    "failure": "Negative",
    "terminated": "Terminated",
    "successful": "Positive",
    "unsuccessful": "Negative",
}

def extract_csr_id(file_path: str, title: str) -> str:
    """Extract a unique CSR ID from filename or title"""
    # First try to get ID from filename
    filename = os.path.basename(file_path)
    filename_no_ext = os.path.splitext(filename)[0]
    
    # Look for patterns like A0081186, NCT01234567
    nct_match = re.search(r'(NCT\d{8})', filename_no_ext)
    if nct_match:
        return nct_match.group(1)
    
    alpha_num_match = re.search(r'([A-Z]\d{7})', filename_no_ext)
    if alpha_num_match:
        return alpha_num_match.group(1)
    
    # Try to find NCT ID in title
    nct_in_title = re.search(r'(NCT\d{8})', title)
    if nct_in_title:
        return nct_in_title.group(1)
    
    # If all else fails, use the filename as ID
    return filename_no_ext

def normalize_phase(phase_str: Optional[str]) -> str:
    """Normalize clinical trial phase to standard format"""
    if not phase_str:
        return "Unknown"
    
    # Convert to lowercase for matching
    phase_lower = phase_str.lower().strip()
    
    # Try direct mapping
    if phase_lower in PHASE_MAPPING:
        return PHASE_MAPPING[phase_lower]
    
    # Try to extract phase number
    phase_match = re.search(r'phase\s*(\d+(?:/\d+)?)', phase_lower)
    if phase_match:
        phase_num = phase_match.group(1)
        key = phase_num.replace(" ", "")
        if key in PHASE_MAPPING:
            return PHASE_MAPPING[key]
    
    # If Roman numerals are used
    roman_match = re.search(r'phase\s*(i{1,3}v?)', phase_lower)
    if roman_match:
        roman = roman_match.group(1)
        if roman in PHASE_MAPPING:
            return PHASE_MAPPING[roman]
    
    # If all else fails, return the original with proper capitalization
    words = phase_str.split()
    if words and words[0].lower() == "phase":
        return "Phase " + " ".join(words[1:])
    
    return "Phase " + phase_str

def normalize_outcome(outcome_str: Optional[str]) -> str:
    """Normalize outcome string to standard format"""
    if not outcome_str:
        return "Unknown"
    
    # Check for direct mapping
    outcome_lower = outcome_str.lower().strip()
    
    for key, value in OUTCOME_MAPPING.items():
        if key in outcome_lower:
            return value
    
    # Look for significant p-values
    p_value_match = re.search(r'p\s*[<≤=]\s*0*[.]?0*(\d+)', outcome_lower)
    if p_value_match:
        p_value = float("0." + p_value_match.group(1))
        if p_value <= 0.05:
            return "Positive (p<0.05)"
        
    # Default to original if no match
    return outcome_str

def normalize_arms(arms: Union[str, List[str]]) -> List[str]:
    """Normalize arms to a standard list format"""
    if not arms:
        return []
    
    # If arms is already a list
    if isinstance(arms, list):
        return [arm.strip() for arm in arms if arm.strip()]
    
    # If arms is a string, try to split it
    if isinstance(arms, str):
        # Handle comma-separated lists
        if "," in arms:
            return [arm.strip() for arm in arms.split(",") if arm.strip()]
        # Handle semicolon-separated lists
        elif ";" in arms:
            return [arm.strip() for arm in arms.split(";") if arm.strip()]
        # Handle newline-separated lists
        elif "\n" in arms:
            return [arm.strip() for arm in arms.split("\n") if arm.strip()]
        # Single arm
        else:
            return [arms.strip()]
    
    return []

def normalize_endpoints(endpoints: Union[str, List[str]]) -> List[str]:
    """Normalize endpoints to a standard list format"""
    # Similar logic to normalize_arms
    if not endpoints:
        return []
    
    if isinstance(endpoints, list):
        return [endpoint.strip() for endpoint in endpoints if endpoint.strip()]
    
    if isinstance(endpoints, str):
        # Handle comma-separated lists
        if "," in endpoints:
            return [endpoint.strip() for endpoint in endpoints.split(",") if endpoint.strip()]
        # Handle semicolon-separated lists
        elif ";" in endpoints:
            return [endpoint.strip() for endpoint in endpoints.split(";") if endpoint.strip()]
        # Handle newline-separated lists
        elif "\n" in endpoints:
            return [endpoint.strip() for endpoint in endpoints.split("\n") if endpoint.strip()]
        # Single endpoint
        else:
            return [endpoints.strip()]
    
    return []

def normalize_adverse_events(ae_data: Any) -> List[Dict]:
    """Normalize adverse events to standard format"""
    result = []
    
    # If it's already a list of dictionaries
    if isinstance(ae_data, list) and all(isinstance(item, dict) for item in ae_data):
        for event in ae_data:
            # Ensure each event has required fields
            normalized_event = {
                "event": event.get("event", "Unknown"),
                "grade": event.get("grade", "Not specified"),
                "count": event.get("count", 0)
            }
            result.append(normalized_event)
        return result
    
    # If it's a string, try to parse it
    if isinstance(ae_data, str):
        # Simple format: just add as a single entry
        return [{"event": ae_data, "grade": "Not specified", "count": 0}]
    
    # Default empty list if input is invalid
    return []

def validate_and_normalize_csr(csr_data: Dict[str, Any], file_path: str) -> Dict[str, Any]:
    """Validate and normalize CSR data according to schema"""
    normalized = {}
    
    # Extract or create an ID
    normalized["csr_id"] = extract_csr_id(file_path, csr_data.get("study_title", ""))
    
    # Map and normalize the standard fields
    normalized["title"] = csr_data.get("study_title", csr_data.get("title", "Unknown"))
    normalized["indication"] = csr_data.get("indication", "Unknown")
    normalized["phase"] = normalize_phase(csr_data.get("phase", ""))
    normalized["arms"] = normalize_arms(csr_data.get("study_arms", csr_data.get("arms", [])))
    normalized["sample_size"] = int(csr_data.get("sample_size", 0)) if csr_data.get("sample_size") else 0
    normalized["primary_endpoints"] = normalize_endpoints(csr_data.get("primary_endpoints", []))
    normalized["secondary_endpoints"] = normalize_endpoints(csr_data.get("secondary_endpoints", []))
    normalized["outcome"] = normalize_outcome(csr_data.get("outcome_summary", csr_data.get("outcome", "")))
    normalized["adverse_events"] = normalize_adverse_events(csr_data.get("adverse_events", []))
    
    # Preserve raw text if available
    normalized["raw_text"] = csr_data.get("raw_text", "")
    
    # Copy vector data if available
    if "vector_summary" in csr_data:
        normalized["vector_summary"] = csr_data["vector_summary"]
    if "embedding" in csr_data:
        normalized["embedding"] = csr_data["embedding"]
    
    return normalized

def save_normalized_csr(csr_data: Dict[str, Any], output_dir: str = "data/processed_csrs") -> str:
    """Save normalized CSR data to the specified directory"""
    os.makedirs(output_dir, exist_ok=True)
    
    # Use CSR ID for filename
    csr_id = csr_data["csr_id"]
    filename = f"{csr_id}.json"
    output_path = os.path.join(output_dir, filename)
    
    with open(output_path, "w") as f:
        json.dump(csr_data, f, indent=2)
    
    return output_path

if __name__ == "__main__":
    # Test normalization with sample data
    sample_data = {
        "study_title": "A Phase 2 Study of Drug X in Multiple Sclerosis",
        "indication": "Multiple Sclerosis",
        "phase": "2",
        "study_arms": ["Placebo", "50mg", "100mg"],
        "sample_size": "180",
        "primary_endpoints": "Change in EDSS score over 24 weeks",
        "secondary_endpoints": "MRI lesion count, Patient reported outcomes",
        "outcome_summary": "Primary endpoint met with p<0.01",
        "adverse_events": "15 cases of grade 2 nausea, 10 cases of grade 1 headache"
    }
    
    normalized = validate_and_normalize_csr(sample_data, "A0081186.pdf")
    print(json.dumps(normalized, indent=2))