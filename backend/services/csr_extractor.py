# 🧠 SagePlus | Batch CSR Extractor to Structured JSON (Phase 1: Extraction)
# Uses PyMuPDF (fitz) to parse PDFs, Hugging Face LLM to extract structured fields

import os
import fitz  # PyMuPDF
import json
import requests
import time
import logging
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Import schema validation
from csr_schema import validate_and_normalize_csr, save_normalized_csr

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("csr_extraction.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("CSR-Extractor")

# API Configuration
HF_API_KEY = os.getenv("HF_API_KEY")
HF_MODEL_URL = "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1"
HEADERS = {"Authorization": f"Bearer {HF_API_KEY}"}

# Output directories
INTERIM_DIR = "csr_json"
PROCESSED_DIR = "data/processed_csrs"

# Improved prompt template for extracting structured trial data from raw text
PROMPT_TEMPLATE = """
You are a clinical trial report parser specialized in extracting structured data from Clinical Study Reports (CSRs).
Extract the following fields from the text, maintaining accuracy and detail:

- study_title: The full title of the clinical trial
- indication: The disease or condition being studied
- phase: The clinical trial phase (e.g., Phase 1, Phase 2, Phase 3)
- sample_size: The total number of participants (just the number)
- study_arms: List of treatment groups or study arms
- primary_endpoints: List of primary outcome measures
- secondary_endpoints: List of secondary outcome measures
- outcome_summary: Brief summary of the trial's outcome (whether primary/secondary endpoints were met)
- adverse_events: Summary of adverse events observed during the study

Return ONLY valid JSON with these exact keys. Each field should be properly typed (strings, arrays, etc.).
If a field cannot be determined from the text, use null or an empty array as appropriate.

CSR TEXT:
{text}
"""

# Advanced section-aware prompt that can extract data from specific sections
SECTION_AWARE_PROMPT = """
You are a clinical trial report parser specialized in extracting structured data from Clinical Study Reports (CSRs).
The following text is from the {section_name} section of a CSR.

Extract the following fields that would be found in this section:
{fields_to_extract}

Return ONLY valid JSON with these exact keys. Each field should be properly typed (strings, arrays, etc.).
If a field cannot be determined from the text, use null or an empty array as appropriate.

SECTION TEXT:
{text}
"""

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text content from a PDF file"""
    try:
        doc = fitz.open(pdf_path)
        text = "\n".join([page.get_text() for page in doc])
        logger.info(f"Successfully extracted {len(text)} characters from {pdf_path}")
        return text
    except Exception as e:
        logger.error(f"Error extracting text from {pdf_path}: {e}")
        return ""

def extract_sections_from_text(text: str) -> Dict[str, str]:
    """Attempt to split text into logical sections based on common CSR headings"""
    sections = {}
    
    # Common section headings in CSRs
    section_patterns = [
        ("title", ["title", "protocol title", "study title"]),
        ("introduction", ["introduction", "background"]),
        ("methods", ["methods", "methodology", "study design", "materials and methods"]),
        ("results", ["results", "study results", "efficacy results"]),
        ("discussion", ["discussion"]),
        ("adverse_events", ["adverse events", "safety", "safety results"]),
        ("conclusions", ["conclusion", "conclusions"]),
    ]
    
    # Simple section extraction based on headings
    lines = text.split('\n')
    current_section = "unknown"
    sections[current_section] = ""
    
    for line in lines:
        line_lower = line.lower().strip()
        matched = False
        
        for section_key, patterns in section_patterns:
            if any(pattern in line_lower for pattern in patterns) and len(line.strip()) < 100:
                current_section = section_key
                if current_section not in sections:
                    sections[current_section] = ""
                matched = True
                break
                
        if not matched:
            sections[current_section] += line + "\n"
    
    return sections

def extract_structured_data(text: str) -> Dict[str, Any]:
    """Extract structured data from text using Hugging Face LLM"""
    if not HF_API_KEY:
        logger.error("HF_API_KEY not set. Cannot extract structured data.")
        return {}
        
    # Use only the first 8000 characters to avoid exceeding model's context length
    prompt = PROMPT_TEMPLATE.replace("{text}", text[:8000])
    
    try:
        response = requests.post(
            HF_MODEL_URL, 
            headers=HEADERS, 
            json={"inputs": prompt}
        )
        
        if response.status_code != 200:
            logger.error(f"Error from Hugging Face API: {response.text}")
            return {}
            
        # Extract the generated JSON from the response
        response_json = response.json()
        
        if isinstance(response_json, list) and len(response_json) > 0:
            generated_text = response_json[0].get('generated_text', '')
            # Find JSON in the generated text
            try:
                start_idx = generated_text.find('{')
                end_idx = generated_text.rfind('}') + 1
                
                if start_idx >= 0 and end_idx > start_idx:
                    json_str = generated_text[start_idx:end_idx]
                    data = json.loads(json_str)
                    logger.info("Successfully extracted structured data")
                    return data
                else:
                    logger.error("No JSON found in API response")
            except json.JSONDecodeError:
                logger.error("Failed to parse JSON from API response")
        else:
            logger.error(f"Unexpected response format from API: {response_json}")
            
        return {}
    except Exception as e:
        logger.error(f"Error querying Hugging Face API: {e}")
        return {}

def extract_section_data(section_text: str, section_name: str, fields: List[str]) -> Dict[str, Any]:
    """Extract data from a specific section using a focused prompt"""
    if not HF_API_KEY:
        return {}
        
    fields_text = "\n".join([f"- {field}" for field in fields])
    
    prompt = SECTION_AWARE_PROMPT.replace("{section_name}", section_name)
    prompt = prompt.replace("{fields_to_extract}", fields_text)
    prompt = prompt.replace("{text}", section_text[:4000])  # Use shorter context for sections
    
    try:
        response = requests.post(
            HF_MODEL_URL,
            headers=HEADERS,
            json={"inputs": prompt}
        )
        
        if response.status_code != 200:
            logger.error(f"Error from Hugging Face API for section {section_name}: {response.text}")
            return {}
            
        response_json = response.json()
        
        if isinstance(response_json, list) and len(response_json) > 0:
            generated_text = response_json[0].get('generated_text', '')
            
            # Find JSON in the generated text
            try:
                start_idx = generated_text.find('{')
                end_idx = generated_text.rfind('}') + 1
                
                if start_idx >= 0 and end_idx > start_idx:
                    json_str = generated_text[start_idx:end_idx]
                    return json.loads(json_str)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse JSON from section {section_name}")
                
        return {}
    except Exception as e:
        logger.error(f"Error processing section {section_name}: {e}")
        return {}

def process_csr_file(pdf_path: str, output_dir: str = INTERIM_DIR, processed_dir: str = PROCESSED_DIR) -> Optional[Dict[str, Any]]:
    """Process a single CSR PDF file"""
    filename = os.path.basename(pdf_path)
    logger.info(f"🔍 Processing {filename}...")
    
    # Extract text from PDF
    text = extract_text_from_pdf(pdf_path)
    if not text:
        logger.error(f"Failed to extract text from {filename}")
        return None
        
    # Extract sections from text (optional, for more advanced extraction)
    sections = extract_sections_from_text(text)
    
    # Extract structured data from full text
    data = extract_structured_data(text)
    
    # Enhance with section-specific extraction if needed
    if "adverse_events" in sections and (not data.get("adverse_events") or data.get("adverse_events") == ""):
        ae_data = extract_section_data(
            sections["adverse_events"], 
            "Adverse Events", 
            ["adverse_events"]
        )
        if ae_data.get("adverse_events"):
            data["adverse_events"] = ae_data["adverse_events"]
    
    if "results" in sections and not data.get("outcome_summary"):
        results_data = extract_section_data(
            sections["results"],
            "Results",
            ["outcome_summary", "primary_endpoints", "secondary_endpoints"]
        )
        if results_data.get("outcome_summary"):
            data["outcome_summary"] = results_data["outcome_summary"]
    
    # Store the raw text for future use
    data["raw_text"] = text[:10000]  # Store first 10K chars to keep file size reasonable
    
    # Save interim results
    os.makedirs(output_dir, exist_ok=True)
    interim_path = os.path.join(output_dir, filename.replace(".pdf", ".json"))
    with open(interim_path, "w") as f:
        json.dump(data, f, indent=2)
    logger.info(f"Saved interim data to {interim_path}")
    
    # Validate and normalize the data
    normalized_data = validate_and_normalize_csr(data, pdf_path)
    
    # Save normalized results
    os.makedirs(processed_dir, exist_ok=True)
    processed_path = save_normalized_csr(normalized_data, processed_dir)
    logger.info(f"Saved processed data to {processed_path}")
    
    return normalized_data

def process_csr_folder(input_dir: str = "csrs", 
                       output_dir: str = INTERIM_DIR, 
                       processed_dir: str = PROCESSED_DIR) -> int:
    """Batch process folder of CSR PDFs"""
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)
    
    files = [f for f in os.listdir(input_dir) if f.lower().endswith(".pdf")]
    logger.info(f"Found {len(files)} PDF files in {input_dir}")
    
    processed_count = 0
    
    for file in files:
        pdf_path = os.path.join(input_dir, file)
        try:
            result = process_csr_file(pdf_path, output_dir, processed_dir)
            if result:
                processed_count += 1
        except Exception as e:
            logger.error(f"Error processing {file}: {e}")
            
        # Avoid rate limits
        time.sleep(2)
    
    logger.info(f"Successfully processed {processed_count} of {len(files)} CSR files")
    return processed_count

# Run the batch job
if __name__ == "__main__":
    logger.info("Starting CSR batch extraction process")
    processed = process_csr_folder()
    logger.info(f"Completed processing {processed} CSR files")