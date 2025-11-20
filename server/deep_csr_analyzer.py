#!/usr/bin/env python3
# trialsage/deep_csr_analyzer.py
# Deep CSR Analyzer for protocol risk assessment and analysis

import os
import sys
import json
import re
from typing import List, Dict, Any, Optional, Tuple
import random
from datetime import datetime

# Try to import optional dependencies
try:
    import openai
    
    # Set OpenAI API key if available
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        openai.api_key = api_key
        OPENAI_AVAILABLE = True
    else:
        OPENAI_AVAILABLE = False
except ImportError:
    OPENAI_AVAILABLE = False

def is_openai_api_key_available() -> bool:
    """Check if OpenAI API key is available"""
    return OPENAI_AVAILABLE and bool(os.environ.get("OPENAI_API_KEY"))

def extract_risk_factors_from_protocol(protocol_text: str) -> List[Dict[str, Any]]:
    """
    Extract potential risk factors and concerns from a protocol design
    
    Args:
        protocol_text: The protocol text to analyze
        
    Returns:
        List of identified risk factors with severity and justifications
    """
    if is_openai_api_key_available():
        try:
            # Use OpenAI to extract risk factors
            prompt = f"""
            Analyze this clinical trial protocol for potential risk factors and design concerns.
            
            Focus on these aspects:
            1. Statistical design issues (e.g., underpowered, problematic endpoints)
            2. Patient safety concerns
            3. Operational challenges
            4. Regulatory compliance issues
            5. Ethical considerations
            
            For each identified risk, provide:
            - A brief description of the risk
            - Severity (HIGH, MEDIUM, or LOW)
            - A specific recommendation to address it
            
            Respond with a JSON array of risk objects, with each object having these fields:
            - "description": a clear statement of the risk
            - "severity": "HIGH", "MEDIUM", or "LOW"
            - "recommendation": specific action to mitigate the risk
            
            Protocol text (excerpt):
            {protocol_text[:7000]}  # First 7000 chars to stay within token limits
            """
            
            response = openai.ChatCompletion.create(
                model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024
                messages=[
                    {"role": "system", "content": "You are an expert in clinical trial design, safety, and regulatory affairs."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # Check if the response has the expected format
            if isinstance(result, dict) and "risks" in result:
                return result["risks"]
            elif isinstance(result, list):
                return result
            else:
                return rule_based_risk_analysis(protocol_text)
        except Exception as e:
            print(f"Error using OpenAI for risk analysis: {str(e)}", file=sys.stderr)
            return rule_based_risk_analysis(protocol_text)
    else:
        return rule_based_risk_analysis(protocol_text)

def rule_based_risk_analysis(protocol_text: str) -> List[Dict[str, Any]]:
    """Rule-based risk analysis as a fallback method"""
    risks = []
    
    # Sample size concerns
    sample_size_match = re.search(r"(?:sample size|n\s*=|enroll(?:ing|ment)?)\s*(?:of|is|:)?\s*(\d+)", protocol_text, re.IGNORECASE)
    if sample_size_match:
        sample_size = int(sample_size_match.group(1))
        if sample_size < 30:
            risks.append({
                "description": f"Small sample size (n={sample_size}) may lead to underpowered study",
                "severity": "HIGH",
                "recommendation": "Consider increasing sample size based on power calculation or using adaptive design"
            })
        elif sample_size < 100:
            risks.append({
                "description": f"Potentially inadequate sample size (n={sample_size}) for reliable efficacy assessment",
                "severity": "MEDIUM",
                "recommendation": "Review power calculations to ensure adequate statistical power"
            })
    
    # Inclusion/exclusion criteria
    if not re.search(r"(?:inclusion|exclusion)\s+(?:criteria|criterion)", protocol_text, re.IGNORECASE):
        risks.append({
            "description": "Missing or unclear inclusion/exclusion criteria",
            "severity": "HIGH",
            "recommendation": "Clearly define and document inclusion and exclusion criteria"
        })
    
    # Placebo use in serious conditions
    placebo_match = re.search(r"placebo(?:-controlled)?", protocol_text, re.IGNORECASE)
    serious_condition_match = re.search(r"(?:cancer|oncology|terminal|life-threatening|severe)", protocol_text, re.IGNORECASE)
    if placebo_match and serious_condition_match:
        risks.append({
            "description": "Use of placebo control in potentially serious condition raises ethical concerns",
            "severity": "MEDIUM",
            "recommendation": "Consider active control or rescue medication provisions"
        })
    
    # Inadequate safety monitoring
    safety_monitoring_match = re.search(r"(?:safety monitoring|data monitoring committee|dmc|dsmc)", protocol_text, re.IGNORECASE)
    if not safety_monitoring_match:
        risks.append({
            "description": "Inadequate or unclear safety monitoring procedures",
            "severity": "HIGH",
            "recommendation": "Establish a Data Safety Monitoring Committee and clear stopping rules"
        })
    
    # Missing primary endpoint
    primary_endpoint_match = re.search(r"primary\s+(?:endpoint|outcome)", protocol_text, re.IGNORECASE)
    if not primary_endpoint_match:
        risks.append({
            "description": "Missing or unclear primary endpoint",
            "severity": "HIGH",
            "recommendation": "Clearly define a single primary endpoint with timeframe"
        })
    
    # Too many endpoints
    endpoints_count = len(re.findall(r"(?:primary|secondary|exploratory)\s+(?:endpoint|outcome)", protocol_text, re.IGNORECASE))
    if endpoints_count > 10:
        risks.append({
            "description": f"Excessive number of endpoints ({endpoints_count}) increases risk of false positives",
            "severity": "MEDIUM",
            "recommendation": "Reduce number of endpoints or implement statistical correction for multiple comparisons"
        })
    
    return risks

def analyze_protocol(file_path: str) -> Dict[str, Any]:
    """
    Analyze a protocol document and extract metadata and risk factors
    
    Args:
        file_path: Path to the protocol document or text
        
    Returns:
        Analysis results including metadata and risk factors
    """
    # Read the protocol text
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            protocol_text = f.read()
    except Exception as e:
        return {
            "error": f"Failed to read protocol file: {str(e)}",
            "risk_factors": []
        }
    
    # Extract basic metadata using pattern matching
    metadata = extract_metadata(protocol_text)
    
    # Extract risk factors
    risk_factors = extract_risk_factors_from_protocol(protocol_text)
    
    # Combine results
    result = {
        "title": metadata.get("title", "Untitled Protocol"),
        "indication": metadata.get("indication"),
        "phase": metadata.get("phase"),
        "sample_size": metadata.get("sample_size"),
        "duration_weeks": metadata.get("duration_weeks"),
        "arms": metadata.get("arms"),
        "primary_endpoint": metadata.get("primary_endpoint"),
        "risk_factors": risk_factors
    }
    
    return result

def extract_metadata(text: str) -> Dict[str, Any]:
    """
    Extract basic metadata from protocol text using pattern matching
    
    Args:
        text: Protocol text
        
    Returns:
        Dictionary of metadata
    """
    metadata = {}
    
    # Extract title
    title_match = re.search(r"(?:title|protocol title):\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    if title_match:
        metadata["title"] = title_match.group(1).strip()
    
    # Extract indication
    indication_match = re.search(r"(?:indication|disease|condition):\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    if indication_match:
        metadata["indication"] = indication_match.group(1).strip()
    
    # Extract phase
    phase_match = re.search(r"(?:phase):\s*(?:phase\s*)?([1-4I]+(?:/[1-4I]+)?)", text, re.IGNORECASE)
    if phase_match:
        phase = phase_match.group(1).strip()
        # Convert Roman numerals if needed
        if phase == "I":
            phase = "1"
        elif phase == "II":
            phase = "2"
        elif phase == "III":
            phase = "3"
        elif phase == "IV":
            phase = "4"
        metadata["phase"] = phase
    
    # Extract sample size
    sample_size_match = re.search(r"(?:sample size|participants|subjects):\s*(?:n\s*=\s*)?(\d+)", text, re.IGNORECASE)
    if sample_size_match:
        try:
            metadata["sample_size"] = int(sample_size_match.group(1).strip())
        except ValueError:
            pass
    
    # Extract duration
    duration_match = re.search(r"(?:duration|follow-up):\s*(\d+)\s*(?:weeks|week)", text, re.IGNORECASE)
    if duration_match:
        try:
            metadata["duration_weeks"] = int(duration_match.group(1).strip())
        except ValueError:
            pass
    
    # Extract number of arms
    arm_match = re.search(r"(\d+)[\s-]*arm(?:s|ed)?\s+(?:study|trial)", text, re.IGNORECASE)
    if arm_match:
        try:
            metadata["arms"] = int(arm_match.group(1).strip())
        except ValueError:
            pass
    
    # Extract primary endpoint
    endpoint_match = re.search(r"(?:primary endpoint|primary outcome):\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    if endpoint_match:
        metadata["primary_endpoint"] = endpoint_match.group(1).strip()
    
    return metadata

def main():
    """
    Main function to run when executed as a script
    """
    if len(sys.argv) < 2:
        print("Usage: python deep_csr_analyzer.py <protocol_file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found")
        sys.exit(1)
    
    result = analyze_protocol(file_path)
    
    # Print JSON result
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()