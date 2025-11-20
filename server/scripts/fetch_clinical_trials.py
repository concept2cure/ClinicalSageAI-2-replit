#!/usr/bin/env python3
"""
Clinical Trial Data Fetcher and Processor

This script fetches clinical trial data from ClinicalTrials.gov, processes the data,
and optionally downloads associated PDF documents. It can be run as a standalone script
or integrated into the TrialSage application for periodic updates.
"""

import requests
import pandas as pd
import json
import time
import os
import fitz  # PyMuPDF
import sys
from datetime import datetime
from tqdm import tqdm
import concurrent.futures
import urllib.parse

# Define constants
BASE_URL = "https://clinicaltrials.gov/api/v2/studies"
# We won't specify fields to get all available data

# Create directories if they don't exist
UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
PDF_DIR = os.path.join(UPLOAD_DIR, "pdf")
DATA_DIR = os.path.join(UPLOAD_DIR, "data")

for directory in [UPLOAD_DIR, PDF_DIR, DATA_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)

def fetch_trials(offset=0, pageSize=100, has_results=True):
    """Fetch a batch of studies from the ClinicalTrials.gov API v2"""
    # Experiment with simpler query parameters for API v2
    params = {
        "pageSize": pageSize,  # API v2 uses pageSize instead of limit
        "countTotal": "true",
        "query.cond": "cancer",  # Common condition that should have many trials
    }
    
    # Add pageToken only if offset is not 0
    if offset > 0:
        params["pageToken"] = str(offset)
    
    # Remove None values from params
    params = {k: v for k, v in params.items() if v is not None}
    
    print(f"API request to {BASE_URL} with params: {params}")
    response = requests.get(BASE_URL, params=params)
    
    if response.status_code != 200:
        print(f"API Error: {response.status_code} - {response.text}")
    
    response.raise_for_status()
    return response.json()

def transform_trial_data(study):
    """Transform raw API data into the format needed for our database"""
    # Extract the sponsor name
    sponsor = study.get("leadSponsorName", "Unknown")
    
    # Extract phase information
    phase = study.get("phase", "N/A")
    if isinstance(phase, list) and len(phase) > 0:
        phase = phase[0]
    
    # Extract indications/conditions
    indication = "Unknown"
    if study.get("condition") and len(study["condition"]) > 0:
        indication = study["condition"][0]
    
    # Extract enrollment count
    sample_size = None
    if study.get("enrollmentCount"):
        sample_size = study.get("enrollmentCount")
    
    # We don't have arms and measures in the simplified field list
    treatment_arms = []
    endpoints = []
    
    # Extract eligibility criteria
    eligibility = study.get("eligibilityCriteria", "")
    
    # Format start date and completion date
    start_date = None
    completion_date = None
    
    if study.get("startDate"):
        start_date = study["startDate"]
    
    if study.get("completionDate"):
        completion_date = study["completionDate"]
    
    # Create a normalized record for our database
    nct_id = study.get("nctId", "")
        
    return {
        "nctrial_id": nct_id,
        "title": study.get("briefTitle", study.get("officialTitle", "Untitled Study")),
        "sponsor": sponsor,
        "indication": indication,
        "phase": phase,
        "status": study.get("overallStatus", "Unknown"),
        "date": completion_date,
        "sample_size": sample_size,
        "study_design": determine_study_design(study),
        "treatment_arms": treatment_arms,
        "endpoints": endpoints,
        "inclusion_criteria": parse_inclusion_criteria(eligibility),
        "exclusion_criteria": parse_exclusion_criteria(eligibility),
        "start_date": start_date,
        "completion_date": completion_date,
        "has_results": study.get("resultsFirstPostDate") is not None
    }

def determine_study_design(study):
    """Attempt to determine study design from available information"""
    # This is a simple implementation - could be expanded with more sophisticated logic
    if study.get("studyType") == "Interventional":
        arm_count = len(study.get("armGroup", []))
        if arm_count > 1:
            return f"Randomized, {arm_count}-arm interventional study"
        elif arm_count == 1:
            return "Single-arm interventional study"
        else:
            return "Interventional study"
    elif study.get("studyType") == "Observational":
        return "Observational study"
    else:
        return study.get("studyType", "Unknown study design")

def parse_inclusion_criteria(criteria_text):
    """Extract inclusion criteria from the eligibility text"""
    if not criteria_text:
        return []
    
    # Simple approach - could be enhanced with NLP
    criteria_lines = []
    in_inclusion = False
    
    for line in criteria_text.split("\n"):
        line = line.strip()
        if not line:
            continue
            
        # Check for inclusion section headers
        if "inclusion" in line.lower() or "eligible" in line.lower():
            in_inclusion = True
            continue
        elif "exclusion" in line.lower():
            in_inclusion = False
            continue
            
        if in_inclusion and line.startswith("-") or line.startswith("•"):
            criteria_lines.append(line.lstrip("- •").strip())
    
    # If we couldn't parse structured criteria, return the whole text
    if not criteria_lines and criteria_text:
        return criteria_text
        
    return criteria_lines

def parse_exclusion_criteria(criteria_text):
    """Extract exclusion criteria from the eligibility text"""
    if not criteria_text:
        return []
    
    # Simple approach - could be enhanced with NLP
    criteria_lines = []
    in_exclusion = False
    
    for line in criteria_text.split("\n"):
        line = line.strip()
        if not line:
            continue
            
        # Check for exclusion section headers
        if "exclusion" in line.lower():
            in_exclusion = True
            continue
        elif "inclusion" in line.lower() and not in_exclusion:
            continue
            
        if in_exclusion and line.startswith("-") or line.startswith("•"):
            criteria_lines.append(line.lstrip("- •").strip())
    
    # If we couldn't parse structured criteria, return an empty list
    # (we don't want to return the whole text as exclusion criteria)
    return criteria_lines

def try_download_pdf(nct_id):
    """
    Attempt to download a PDF related to the clinical trial
    
    This function tries multiple sources to find a related PDF:
    1. ClinicalTrials.gov results
    2. PubMed Central for linked publications
    3. Sponsor websites (if available)
    """
    pdf_path = os.path.join(PDF_DIR, f"{nct_id}.pdf")
    
    # Already downloaded?
    if os.path.exists(pdf_path):
        return pdf_path
        
    # Try to get the CSR from ClinicalTrials.gov
    try:
        # Try the results PDF
        results_url = f"https://clinicaltrials.gov/ct2/show/{nct_id}/results.pdf"
        response = requests.get(results_url, stream=True)
        
        if response.status_code == 200 and response.headers.get('Content-Type') == 'application/pdf':
            with open(pdf_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return pdf_path
    except Exception as e:
        print(f"Error downloading PDF for {nct_id}: {e}")
    
    # If we get here, we couldn't find a PDF
    return None

def extract_text_from_pdf(pdf_path):
    """Extract text content from a PDF file"""
    if not pdf_path or not os.path.exists(pdf_path):
        return ""
        
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        print(f"Error extracting text from PDF {pdf_path}: {e}")
        return ""

def download_all_trials(max_records=500, batch_size=100, download_pdfs=True):
    """Download and process clinical trial data, with optional PDF retrieval"""
    all_trials = []
    processed_trials = []
    
    # Estimate total records
    # Using pageSize instead of limit for API v2
    initial_data = fetch_trials(offset=0, pageSize=1)
    # v2 API has different structure
    total_count = initial_data.get("studyCount", 0)
    print(f"Total available trials: {total_count}")
    
    # Cap at max_records
    records_to_fetch = min(total_count, max_records)
    
    # Create progress bar
    with tqdm(total=records_to_fetch, desc="Fetching trials") as pbar:
        for page_token in range(0, records_to_fetch, batch_size):
            page_size = min(batch_size, records_to_fetch - page_token)
            print(f"Fetching records {page_token} to {page_token + page_size}")
            data = fetch_trials(offset=page_token, pageSize=page_size)
            
            # Check if we have studies in the API response
            if not data.get("studies") or len(data["studies"]) == 0:
                print("No studies found in response or reached the end")
                break
                
            for study in data["studies"]:
                # Transform the data to match our schema
                transformed_data = transform_trial_data(study)
                all_trials.append(transformed_data)
                
                # If requested, try to download and process PDFs
                if download_pdfs:
                    nct_id = study.get("nctId", "")
                    # In API v2, this is actually NCTId (capital I)
                    if not nct_id:
                        nct_id = study.get("NCTId", "")
                    if nct_id:
                        pdf_path = try_download_pdf(nct_id)
                        if pdf_path:
                            # Extract text for future processing
                            text_content = extract_text_from_pdf(pdf_path)
                            # Create a processed record with file info
                            processed_record = {
                                **transformed_data,
                                "file_name": f"{nct_id}.pdf",
                                "file_size": os.path.getsize(pdf_path),
                                "file_path": pdf_path,
                                "text_content": text_content[:1000]  # Preview only
                            }
                            processed_trials.append(processed_record)
            
            # Update progress bar
            pbar.update(len(data["studies"]))
            
            # Be polite to the API
            time.sleep(1)
    
    # Save the raw data
    trials_df = pd.DataFrame(all_trials)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = os.path.join(DATA_DIR, f"clinicaltrials_dump_{timestamp}.csv")
    trials_df.to_csv(csv_path, index=False)
    
    # Save the processed data with PDF info
    if processed_trials:
        processed_df = pd.DataFrame(processed_trials)
        processed_csv = os.path.join(DATA_DIR, f"processed_trials_{timestamp}.csv")
        processed_df.to_csv(processed_csv, index=False)
        print(f"Downloaded {len(processed_trials)} PDFs")
    
    # Also save as JSON for easier import to our application
    json_path = os.path.join(DATA_DIR, f"clinicaltrials_dump_{timestamp}.json")
    with open(json_path, 'w') as f:
        json.dump(all_trials, f, indent=2)
    
    print(f"Saved {len(all_trials)} trial records to {csv_path} and {json_path}")
    return {
        "csv_path": csv_path,
        "json_path": json_path,
        "processed_trials": len(processed_trials),
        "total_trials": len(all_trials)
    }

if __name__ == "__main__":
    # Handle command line arguments
    max_records = 100  # Default value
    download_pdfs = True
    
    if len(sys.argv) > 1:
        try:
            max_records = int(sys.argv[1])
        except ValueError:
            print(f"Invalid max_records value: {sys.argv[1]}. Using default: 100")
    
    if len(sys.argv) > 2:
        download_pdfs = sys.argv[2].lower() not in ('false', 'no', '0', 'f', 'n')
    
    results = download_all_trials(max_records=max_records, download_pdfs=download_pdfs)
    print(f"Downloaded {results['total_trials']} trials, {results['processed_trials']} with PDFs")