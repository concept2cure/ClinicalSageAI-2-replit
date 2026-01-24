"""
Semantic Aligner Module for LumenTrialGuide.AI

This module compares protocol fields against historical CSR data,
calculating semantic similarity and providing alignment scores.

Dependencies:
- scikit-learn for TF-IDF vectorization and cosine similarity
- semantic_normalizer for term standardization
"""

import os
import json
import numpy as np
from typing import Dict, List, Any, Tuple, Optional
import semantic_normalizer as normalizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer

# Constants for field weighting in alignment scores
FIELD_WEIGHTS = {
    "primary_endpoint": 0.30,
    "duration_weeks": 0.20,
    "sample_size": 0.15,
    "inclusion_criteria": 0.15,
    "exclusion_criteria": 0.10,
    "dose": 0.05,
    "frequency": 0.05
}

def semantic_similarity(text_a: str, text_b: str) -> float:
    """Calculate semantic similarity between two text strings using TF-IDF"""
    vectorizer = TfidfVectorizer().fit([text_a, text_b])
    tfidf_matrix = vectorizer.transform([text_a, text_b])
    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])
    return round(float(similarity[0][0]), 4)

def compute_text_similarity(text_a: str, text_b: str) -> float:
    """Compute similarity between two text strings with normalization"""
    # Normalize terms first
    norm_a = normalizer.normalize_term(text_a)
    norm_b = normalizer.normalize_term(text_b)
    
    # Calculate similarity
    return semantic_similarity(norm_a, norm_b)

def compare_numeric_fields(protocol_value: float, csr_value: float, field_type: str) -> float:
    """Compare numeric fields and return similarity score (0-1)"""
    if field_type == "duration_weeks":
        # For duration, closer is better but we allow some variance
        ratio = min(protocol_value, csr_value) / max(protocol_value, csr_value)
        # Apply sigmoid-like scaling to make small differences less impactful
        return 2 / (1 + np.exp(-5 * ratio)) - 1
    
    elif field_type == "sample_size":
        # For sample size, protocol should generally be similar or larger than successful CSRs
        if protocol_value >= csr_value:
            return 1.0
        else:
            # Scale by ratio, but be more forgiving than with duration
            return protocol_value / csr_value
    
    # Default comparison for other numeric fields
    return 1.0 - min(abs(protocol_value - csr_value) / max(protocol_value, csr_value), 1.0)

def get_risk_flags(matched_fields: List[Dict[str, Any]]) -> List[str]:
    """Generate risk flags based on field comparisons"""
    risk_flags = []
    
    for field in matched_fields:
        field_name = field["field"]
        similarity = field["similarity"]
        
        if similarity < 0.5:
            if field_name == "primary_endpoint":
                risk_flags.append("Primary endpoint mismatch")
            elif field_name == "duration_weeks":
                risk_flags.append("Duration mismatch")
            elif field_name == "sample_size":
                risk_flags.append("Sample size concern")
            elif field_name == "inclusion_criteria":
                risk_flags.append("Inclusion criteria divergence")
            elif field_name == "exclusion_criteria":
                risk_flags.append("Exclusion criteria divergence")
    
    return risk_flags

def generate_recommendations(matched_fields: List[Dict[str, Any]], 
                            risk_flags: List[str]) -> List[str]:
    """Generate recommendations based on matched fields and risk flags"""
    recommendations = []
    
    for field in matched_fields:
        field_name = field["field"]
        protocol_val = field["protocol"]
        csr_val = field["csr"]
        similarity = field["similarity"]
        
        if similarity < 0.7:
            if field_name == "duration_weeks" and isinstance(protocol_val, (int, float)) and isinstance(csr_val, (int, float)):
                if protocol_val < csr_val:
                    recommendations.append(f"Consider extending to {csr_val} weeks based on similar CSR patterns.")
            
            elif field_name == "sample_size" and isinstance(protocol_val, (int, float)) and isinstance(csr_val, (int, float)):
                if protocol_val < csr_val:
                    recommendations.append(f"Consider increasing sample size to at least {csr_val} participants.")
            
            elif field_name == "primary_endpoint":
                recommendations.append(f"Review primary endpoint definition to align with standard measurements.")
    
    return recommendations

def compare_fields(protocol_field: Any, csr_field: Any, field_type: str) -> Tuple[float, str]:
    """Compare protocol and CSR field values, returning similarity score and reasoning"""
    
    # Handle numeric fields
    if isinstance(protocol_field, (int, float)) and isinstance(csr_field, (int, float)):
        similarity = compare_numeric_fields(protocol_field, csr_field, field_type)
        reasoning = f"Numeric comparison: {protocol_field} vs {csr_field}"
        return similarity, reasoning
    
    # Handle text fields with TF-IDF similarity
    if isinstance(protocol_field, str) and isinstance(csr_field, str):
        # Normalize terms first
        protocol_normalized = normalizer.normalize_term(protocol_field)
        csr_normalized = normalizer.normalize_term(csr_field)
        
        # Calculate semantic similarity using TF-IDF and cosine similarity
        similarity = semantic_similarity(protocol_normalized, csr_normalized)
        reasoning = f"TF-IDF semantic comparison between normalized terms"
        return similarity, reasoning
    
    # Handle list fields (e.g., inclusion criteria)
    if isinstance(protocol_field, list) and isinstance(csr_field, list):
        # Compare each item in the list and average the similarities
        similarities = []
        for p_item in protocol_field:
            best_match = 0
            for c_item in csr_field:
                if isinstance(p_item, str) and isinstance(c_item, str):
                    # Normalize and compute semantic similarity using TF-IDF
                    p_norm = normalizer.normalize_term(p_item)
                    c_norm = normalizer.normalize_term(c_item)
                    sim = semantic_similarity(p_norm, c_norm)
                    best_match = max(best_match, sim)
            if best_match > 0:
                similarities.append(best_match)
        
        if not similarities:
            return 0.0, "No comparable items found in lists"
        
        avg_similarity = sum(similarities) / len(similarities)
        reasoning = f"Averaged TF-IDF similarity across {len(similarities)} list items"
        return avg_similarity, reasoning
    
    # Default case - types don't match
    return 0.0, f"Incomparable types: {type(protocol_field)} vs {type(csr_field)}"

def align_protocol_with_csr(protocol_data: Dict[str, Any], 
                           csr_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare protocol data with CSR data and generate alignment metrics
    
    Args:
        protocol_data: Dictionary containing protocol field values
        csr_data: Dictionary containing CSR field values
    
    Returns:
        Dictionary with alignment score, matched fields, risk flags, and recommendations
    """
    matched_fields = []
    reasoning_trace = []
    overall_weighted_score = 0.0
    total_weight = 0.0
    
    # Process each field in the protocol
    for field_name, protocol_value in protocol_data.items():
        if field_name in csr_data:
            csr_value = csr_data[field_name]
            
            # Skip if either value is None/null
            if protocol_value is None or csr_value is None:
                continue
            
            # Compare the fields
            similarity, reasoning = compare_fields(protocol_value, csr_value, field_name)
            
            # Track the comparison
            matched_fields.append({
                "field": field_name,
                "protocol": protocol_value,
                "csr": csr_value,
                "similarity": round(similarity, 2)
            })
            
            # Add to reasoning trace
            reasoning_trace.append({
                "field": field_name,
                "reasoning": reasoning,
                "similarity": round(similarity, 2)
            })
            
            # Add to weighted score
            weight = FIELD_WEIGHTS.get(field_name, 0.1)  # Default weight 0.1
            overall_weighted_score += similarity * weight
            total_weight += weight
    
    # Calculate final alignment score
    alignment_score = round(overall_weighted_score / max(total_weight, 0.01), 2)
    
    # Generate risk flags
    risk_flags = get_risk_flags(matched_fields)
    
    # Generate recommendations
    recommendations = generate_recommendations(matched_fields, risk_flags)
    
    # Create and return the alignment results
    return {
        "alignment_score": alignment_score,
        "matched_fields": matched_fields,
        "risk_flags": risk_flags,
        "recommended_adjustments": recommendations,
        "reasoning_trace": reasoning_trace
    }

def save_trace_log(alignment_data: Dict[str, Any], protocol_id: str, csr_id: str) -> None:
    """Save the alignment trace to a log file for auditing and debugging"""
    log_entry = {
        "timestamp": str(import_datetime.datetime.now()),
        "protocol_id": protocol_id,
        "csr_id": csr_id,
        "alignment_data": alignment_data
    }
    
    try:
        # Create logs directory if it doesn't exist
        os.makedirs("logs", exist_ok=True)
        
        # Write to log file
        log_file = f"logs/semantic_trace_log_{protocol_id}.json"
        
        existing_logs = []
        if os.path.exists(log_file):
            with open(log_file, "r") as f:
                try:
                    existing_logs = json.load(f)
                except json.JSONDecodeError:
                    existing_logs = []
        
        existing_logs.append(log_entry)
        
        with open(log_file, "w") as f:
            json.dump(existing_logs, f, indent=2)
            
    except Exception as e:
        print(f"Error saving trace log: {e}")

# Example usage
if __name__ == "__main__":
    import datetime as import_datetime  # Import here to avoid circular import
    
    # Sample data
    protocol_data = {
        "primary_endpoint": "ALT",
        "duration_weeks": 12,
        "sample_size": 100,
        "inclusion_criteria": ["Adults 18+", "BMI > 30", "Elevated liver enzymes"]
    }
    
    csr_data = {
        "primary_endpoint": "ALT reduction",
        "duration_weeks": 24,
        "sample_size": 120,
        "inclusion_criteria": ["Adult subjects", "BMI >= 30 kg/m²", "Elevated ALT"]
    }
    
    # Run alignment
    result = align_protocol_with_csr(protocol_data, csr_data)
    
    # Save trace
    save_trace_log(result, "protocol_123", "csr_456")
    
    # Print result
    print(json.dumps(result, indent=2))