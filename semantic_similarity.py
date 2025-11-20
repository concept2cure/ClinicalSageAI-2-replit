"""
Semantic Similarity Module for LumenTrialGuide.AI

This module compares raw protocol text to reference CSRs and provides
overall similarity metrics, with highlighted overlap areas and risk flagging.

Dependencies:
- semantic_normalizer for term standardization
- semantic_aligner for field-level comparisons
"""

import os
import json
import numpy as np
from typing import Dict, List, Any, Tuple, Optional, Union
import semantic_normalizer as normalizer
import semantic_aligner as aligner

def extract_protocol_components(protocol_text: str) -> Dict[str, Any]:
    """
    Extract structured components from protocol text
    
    This is a simple version for demonstration. In production, this would use
    a more sophisticated NER model to accurately extract fields.
    """
    # Placeholder field extraction with a naive pattern approach
    components = {}
    
    # Extract primary endpoint
    if "primary endpoint" in protocol_text.lower():
        # Find the sentence containing "primary endpoint"
        sentences = protocol_text.split(".")
        for sentence in sentences:
            if "primary endpoint" in sentence.lower():
                # Extract text after "primary endpoint"
                parts = sentence.lower().split("primary endpoint")
                if len(parts) > 1:
                    components["primary_endpoint"] = parts[1].strip().strip(":").strip()
    
    # Extract duration
    duration_keywords = ["duration", "trial length", "weeks", "months"]
    for keyword in duration_keywords:
        if keyword in protocol_text.lower():
            sentences = protocol_text.split(".")
            for sentence in sentences:
                if keyword in sentence.lower():
                    # Try to extract a number followed by "weeks" or "months"
                    import re
                    duration_match = re.search(r'(\d+)\s*(weeks|months)', sentence.lower())
                    if duration_match:
                        value = int(duration_match.group(1))
                        unit = duration_match.group(2)
                        # Convert months to weeks if needed
                        if unit == "months":
                            value = value * 4  # Approximate conversion
                        components["duration_weeks"] = value
                        break
    
    # Extract sample size
    size_keywords = ["sample size", "participants", "subjects", "patients", "n="]
    for keyword in size_keywords:
        if keyword in protocol_text.lower():
            sentences = protocol_text.split(".")
            for sentence in sentences:
                if keyword in sentence.lower():
                    # Try to extract a number
                    import re
                    size_match = re.search(r'(\d+)\s*(participants|subjects|patients|individuals)', 
                                          sentence.lower())
                    if size_match:
                        components["sample_size"] = int(size_match.group(1))
                        break
    
    # Add more field extractors as needed...
    
    return components

def find_matching_csrs(protocol_components: Dict[str, Any], 
                      csr_database: List[Dict[str, Any]],
                      top_n: int = 5) -> List[Dict[str, Any]]:
    """
    Find the most similar CSRs to a protocol
    
    Args:
        protocol_components: Extracted protocol components
        csr_database: List of CSR data dictionaries
        top_n: Number of top matches to return
    
    Returns:
        List of top matching CSRs with similarity scores
    """
    matches = []
    
    for csr in csr_database:
        # Get alignment metrics
        alignment = aligner.align_protocol_with_csr(protocol_components, csr)
        
        # Add to matches
        matches.append({
            "csr_id": csr.get("id", "unknown"),
            "title": csr.get("title", "Untitled CSR"),
            "alignment_score": alignment["alignment_score"],
            "matched_fields": alignment["matched_fields"],
            "risk_flags": alignment["risk_flags"]
        })
    
    # Sort by alignment score (descending)
    matches.sort(key=lambda x: x["alignment_score"], reverse=True)
    
    # Return top N matches
    return matches[:top_n]

def assess_protocol_quality(protocol_components: Dict[str, Any], 
                           similar_csrs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Assess protocol quality based on similar CSRs
    
    Args:
        protocol_components: Extracted protocol components
        similar_csrs: List of similar CSRs with alignment data
    
    Returns:
        Assessment with metrics, strengths, weaknesses, and recommendations
    """
    if not similar_csrs:
        return {
            "overall_score": 0.0,
            "message": "No similar CSRs found for comparison"
        }
    
    # Calculate average alignment score
    avg_alignment = sum(csr["alignment_score"] for csr in similar_csrs) / len(similar_csrs)
    
    # Collect all risk flags from all matches
    all_risks = []
    for csr in similar_csrs:
        all_risks.extend(csr.get("risk_flags", []))
    
    # Count risk occurrences
    risk_counts = {}
    for risk in all_risks:
        risk_counts[risk] = risk_counts.get(risk, 0) + 1
    
    # Sort risks by frequency
    common_risks = sorted(risk_counts.items(), key=lambda x: x[1], reverse=True)
    
    # Generate recommendations based on most common risks
    recommendations = []
    for risk, count in common_risks:
        # Only include risks mentioned in multiple CSRs
        if count > 1:
            if "duration" in risk.lower():
                # Find most common duration in similar CSRs
                durations = [csr.get("duration_weeks", 0) for csr in similar_csrs 
                             if "duration_weeks" in csr]
                if durations:
                    avg_duration = sum(durations) / len(durations)
                    recommendations.append(
                        f"Consider adjusting study duration to {int(avg_duration)} weeks based on similar trials"
                    )
            
            elif "sample size" in risk.lower():
                # Find average sample size in similar CSRs
                sizes = [csr.get("sample_size", 0) for csr in similar_csrs 
                         if "sample_size" in csr]
                if sizes:
                    avg_size = sum(sizes) / len(sizes)
                    recommendations.append(
                        f"Consider increasing sample size to approximately {int(avg_size)} participants"
                    )
            
            elif "primary endpoint" in risk.lower():
                recommendations.append(
                    "Review primary endpoint specification to align with standard clinical trial endpoints"
                )
    
    # Create assessment result
    assessment = {
        "overall_score": round(avg_alignment, 2),
        "risk_frequency": dict(common_risks),
        "recommendations": recommendations,
        "similar_csr_count": len(similar_csrs)
    }
    
    return assessment

def compute_semantic_similarity(protocol_text: str, 
                               csr_database: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Main function to compute semantic similarity between protocol and CSRs
    
    Args:
        protocol_text: Raw protocol text
        csr_database: List of CSR data dictionaries
    
    Returns:
        Comprehensive similarity analysis with matches and recommendations
    """
    # Step 1: Extract protocol components
    protocol_components = extract_protocol_components(protocol_text)
    
    # Step 2: Find matching CSRs
    similar_csrs = find_matching_csrs(protocol_components, csr_database)
    
    # Step 3: Assess protocol quality
    assessment = assess_protocol_quality(protocol_components, similar_csrs)
    
    # Step 4: Create final result
    result = {
        "protocol_components": protocol_components,
        "similar_csrs": similar_csrs[:3],  # Limit to top 3 for brevity
        "quality_assessment": assessment,
        "timestamp": import_datetime.datetime.now().isoformat()
    }
    
    return result

# Example usage
if __name__ == "__main__":
    import datetime as import_datetime  # Import here to avoid circular import
    
    # Sample protocol text (this would be a much longer document in reality)
    protocol_text = """
    Clinical Trial Protocol for LUM-001
    
    Title: A Randomized, Double-Blind Study to Evaluate the Efficacy and Safety of LUM-001 in Obesity
    
    Primary endpoint: ALT reduction from baseline at Week 12
    
    Duration: 12 weeks
    
    Sample size: 100 participants
    
    Inclusion Criteria:
    - Adults aged 18 and older
    - BMI > 30 kg/m²
    - Elevated liver enzymes
    """
    
    # Sample CSR database (in reality, this would be loaded from a database)
    csr_database = [
        {
            "id": "CSR-001",
            "title": "Clinical Study Report for Drug X in NASH",
            "primary_endpoint": "ALT reduction",
            "duration_weeks": 24,
            "sample_size": 120
        },
        {
            "id": "CSR-002",
            "title": "Clinical Study Report for Drug Y in Obesity",
            "primary_endpoint": "Weight loss",
            "duration_weeks": 12,
            "sample_size": 150
        }
    ]
    
    # Compute similarity
    result = compute_semantic_similarity(protocol_text, csr_database)
    
    # Print result
    print(json.dumps(result, indent=2))