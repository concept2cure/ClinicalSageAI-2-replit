#!/usr/bin/env python3
# trialsage/extract_protocol.py
# Extract text and metadata from uploaded protocol documents

import os
import sys
import json
import re
from typing import Dict, Any, List, Optional, Tuple

# Try to import PDF handling libraries
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    print("Warning: PyMuPDF not available. PDF extraction will be limited.")

# Check if we have OpenAI available for enhanced extraction
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

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract text from a PDF file using PyMuPDF (if available)
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        Extracted text from the PDF
    """
    if not os.path.exists(file_path):
        return f"Error: File {file_path} not found"
    
    if PYMUPDF_AVAILABLE:
        try:
            # Use PyMuPDF for high-quality extraction
            doc = fitz.open(file_path)
            text = ""
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text += page.get_text()
            
            doc.close()
            return text
        except Exception as e:
            return f"Error extracting text with PyMuPDF: {str(e)}"
    else:
        # Fall back to a simpler method or return a message
        return "PDF text extraction requires PyMuPDF. Please install it with 'pip install pymupdf'."

def extract_metadata_from_text(text: str) -> Dict[str, Any]:
    """
    Extract clinical trial protocol metadata from text using pattern matching
    
    Args:
        text: The extracted text from the protocol document
        
    Returns:
        Dictionary of extracted metadata
    """
    metadata = {
        "title": None,
        "indication": None,
        "phase": None,
        "sample_size": None,
        "duration_weeks": None,
        "arms": None,
        "primary_endpoint": None
    }
    
    # Extract title (usually at beginning of document)
    title_patterns = [
        r"(?:TITLE|Protocol Title):\s*(.+?)(?:\n|$)",
        r"(?:PROTOCOL TITLE|Study Title):\s*(.+?)(?:\n|$)",
        r"(?:^|\n)(?:TITLE|Title):\s*(.+?)(?:\n|$)"
    ]
    
    for pattern in title_patterns:
        title_match = re.search(pattern, text, re.IGNORECASE)
        if title_match:
            metadata["title"] = title_match.group(1).strip()
            break
    
    # Extract indication/disease
    indication_patterns = [
        r"(?:INDICATION|Disease|Condition):\s*(.+?)(?:\n|$)",
        r"(?:THERAPEUTIC AREA|Therapeutic Area|Disease Area):\s*(.+?)(?:\n|$)",
        r"(?:disease|condition)(?:\s+studied|\s+to\s+be\s+studied):\s*(.+?)(?:\n|$)"
    ]
    
    for pattern in indication_patterns:
        indication_match = re.search(pattern, text, re.IGNORECASE)
        if indication_match:
            metadata["indication"] = indication_match.group(1).strip()
            break
    
    # Extract phase
    phase_patterns = [
        r"(?:PHASE|Study Phase):\s*(?:Phase\s*)?([1-4I]+(?:/[1-4I]+)?)",
        r"(?:Phase|PHASE)\s*([1-4I]+(?:/[1-4I]+)?)\s+(?:Clinical Trial|Study)"
    ]
    
    for pattern in phase_patterns:
        phase_match = re.search(pattern, text, re.IGNORECASE)
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
            break
    
    # Extract sample size
    sample_size_patterns = [
        r"(?:SAMPLE SIZE|Number of Participants|Subjects):\s*(?:n\s*=\s*)?(\d+)",
        r"(?:total\s+of|approximately|target(?:ed)?|planned)\s+(\d+)\s+(?:patients|participants|subjects)",
        r"(?:sample size|enrollment target)(?:\s+of|\s+is)?\s+(\d+)"
    ]
    
    for pattern in sample_size_patterns:
        sample_match = re.search(pattern, text, re.IGNORECASE)
        if sample_match:
            try:
                metadata["sample_size"] = int(sample_match.group(1).strip())
                break
            except ValueError:
                continue
    
    # Extract duration
    duration_patterns = [
        r"(?:DURATION|Study Duration|Treatment Duration):\s*(\d+)\s*(?:weeks|week)",
        r"(?:duration|period)\s+of\s+(\d+)\s*(?:weeks|week)",
        r"followed\s+for\s+(\d+)\s*(?:weeks|week)"
    ]
    
    for pattern in duration_patterns:
        duration_match = re.search(pattern, text, re.IGNORECASE)
        if duration_match:
            try:
                metadata["duration_weeks"] = int(duration_match.group(1).strip())
                break
            except ValueError:
                continue
    
    # Extract number of arms
    arm_patterns = [
        r"(\d+)[\s-]*arm(?:s|ed)?\s+(?:study|trial)",
        r"(?:ARMS|Study Arms|Treatment Arms):\s*(\d+)",
        r"(?:patients|subjects|participants).+?(?:will be|randomized to)\s+(\d+)\s+(?:arms|groups)"
    ]
    
    for pattern in arm_patterns:
        arm_match = re.search(pattern, text, re.IGNORECASE)
        if arm_match:
            try:
                metadata["arms"] = int(arm_match.group(1).strip())
                break
            except ValueError:
                continue
    
    # Extract primary endpoint
    endpoint_patterns = [
        r"(?:PRIMARY ENDPOINT|Primary Endpoint|Primary Outcome):\s*(.+?)(?:\n|$)",
        r"(?:primary\s+endpoint|primary\s+outcome\s+measure)\s+(?:is|will be)\s+(.+?)(?:\n|$)",
        r"(?:primary\s+endpoint|primary\s+outcome)\s*(?::|is)\s*(.+?)(?:\n|$)"
    ]
    
    for pattern in endpoint_patterns:
        endpoint_match = re.search(pattern, text, re.IGNORECASE)
        if endpoint_match:
            metadata["primary_endpoint"] = endpoint_match.group(1).strip()
            break
    
    return metadata

def enhance_extraction_with_ai(text: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Use OpenAI to enhance metadata extraction if available
    
    Args:
        text: The extracted text from the protocol document
        metadata: The metadata extracted using pattern matching
        
    Returns:
        Enhanced metadata dictionary
    """
    if not OPENAI_AVAILABLE:
        return metadata
    
    try:
        # Prepare a summary of the first portion of the text
        text_sample = text[:10000]  # Use first 10K characters to stay within token limits
        
        # Create the prompt
        prompt = f"""
        Extract key information from this clinical trial protocol. If the information is not present, respond with null.
        
        Use this format for your response (JSON):
        {{
          "title": "full study title",
          "indication": "disease or condition being studied",
          "phase": "clinical trial phase (1, 2, 3, or 4)",
          "sample_size": number of participants (numeric only),
          "duration_weeks": study duration in weeks (numeric only),
          "arms": number of treatment arms (numeric only),
          "primary_endpoint": "primary outcome measure"
        }}
        
        Protocol text:
        {text_sample}
        """
        
        # Call the OpenAI API
        response = openai.ChatCompletion.create(
            model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages=[
                {"role": "system", "content": "You are a clinical research expert who extracts protocol metadata accurately."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        # Parse the response
        ai_metadata = json.loads(response.choices[0].message.content)
        
        # Merge with existing metadata, preferring AI-extracted values when available
        enhanced_metadata = metadata.copy()
        for key, value in ai_metadata.items():
            if value is not None and value != "":
                enhanced_metadata[key] = value
        
        return enhanced_metadata
    except Exception as e:
        print(f"Error enhancing metadata with AI: {str(e)}", file=sys.stderr)
        return metadata

def main():
    """
    Extract text and metadata from a protocol document
    
    Usage:
        python extract_protocol.py <file_path>
    """
    if len(sys.argv) < 2:
        print("Usage: python extract_protocol.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    # Check if file exists
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found")
        sys.exit(1)
    
    # Extract text based on file type
    if file_path.lower().endswith('.pdf'):
        text = extract_text_from_pdf(file_path)
    else:
        # For demo purposes, just read the file as text
        # In a real implementation, you'd handle different file types
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
    
    # Extract metadata using pattern matching
    metadata = extract_metadata_from_text(text)
    
    # Enhance extraction with AI if available
    enhanced_metadata = enhance_extraction_with_ai(text, metadata)
    
    # Add the extracted text to the result
    result = enhanced_metadata.copy()
    result["extracted_text"] = text
    
    # Output as JSON
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()