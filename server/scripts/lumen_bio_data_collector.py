
#!/usr/bin/env python3
"""
Lumen Bio Pipeline-Specific Clinical Trials Data Collector

This script fetches clinical trial data from ClinicalTrials.gov API specifically 
for therapeutic areas in Lumen Bio's pipeline: neurological disorders (Parkinson's, ARDS)
and cancer (solid tumors, brain tumors).
"""

import os
import sys
import json
import time
from datetime import datetime
import requests
from tqdm import tqdm
import urllib.parse

# Add the current directory to the path so we can import existing scripts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the function from the existing script
from fetch_trials_v2_api import fetch_clinical_trials

# Create data directory if it doesn't exist
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Define Lumen Bio pipeline focus areas
LUMEN_BIO_INDICATIONS = [
    # Neurological disorders
    "Parkinson disease", 
    "Parkinson's disease",
    "Acute Respiratory Distress Syndrome", 
    "ARDS",
    
    # Cancer areas
    "solid tumor", 
    "solid tumors",
    "brain tumor", 
    "brain tumors",
    "glioblastoma",
    "glioma",
    "malignant brain neoplasm"
]

# Additional terms to enrich search
RELATED_TERMS = [
    # Related to Parkinson's
    "movement disorder",
    "dopaminergic",
    "levodopa",
    "deep brain stimulation",
    
    # Related to ARDS
    "pulmonary inflammation",
    "respiratory failure",
    "lung injury",
    "mechanical ventilation",
    
    # Related to tumors
    "oncology",
    "cancer therapy",
    "immunotherapy",
    "targeted therapy",
    "checkpoint inhibitor"
]

def fetch_lumen_bio_trials(records_per_indication=100):
    """Fetch clinical trials relevant to Lumen Bio's pipeline"""
    print(f"Starting batch fetch of clinical trials relevant to Lumen Bio's pipeline...")
    
    all_trials = []
    output_files = []
    
    # Combine primary indications and related terms for a comprehensive search
    all_search_terms = LUMEN_BIO_INDICATIONS + RELATED_TERMS
    
    # Create timestamp for file naming
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Fetch data for each indication
    for i, indication in enumerate(all_search_terms):
        print(f"Fetching data for term {i+1}/{len(all_search_terms)}: '{indication}'")
        
        output_file = os.path.join(DATA_DIR, f"lumen_bio_{indication.replace(' ', '_')}_{timestamp}.json")
        
        try:
            # Use existing fetch function
            result = fetch_clinical_trials(
                query=indication,
                max_records=records_per_indication,
                output_file=output_file
            )
            
            if result["success"]:
                print(f"Successfully fetched {result['fetched_count']} records for '{indication}'")
                output_files.append(output_file)
                
                # Add to our combined data
                try:
                    with open(output_file, 'r') as f:
                        data = json.load(f)
                        all_trials.extend(data.get("studies", []))
                except Exception as e:
                    print(f"Error reading file {output_file}: {e}")
            else:
                print(f"Failed to fetch data for '{indication}': {result.get('message', 'Unknown error')}")
                
            # Be polite to the API
            time.sleep(2)
            
        except Exception as e:
            print(f"Error fetching data for '{indication}': {e}")
    
    # Save consolidated data
    consolidated_file = os.path.join(DATA_DIR, f"lumen_bio_consolidated_{timestamp}.json")
    
    # Remove duplicates based on NCT ID
    unique_trials = {}
    for trial in all_trials:
        nct_id = None
        if "protocolSection" in trial and "identificationModule" in trial["protocolSection"]:
            nct_id = trial["protocolSection"]["identificationModule"].get("nctId")
        
        if nct_id and nct_id not in unique_trials:
            unique_trials[nct_id] = trial
    
    # Convert back to list
    unique_trials_list = list(unique_trials.values())
    
    with open(consolidated_file, 'w') as f:
        json.dump({
            "metadata": {
                "total_fetched": len(unique_trials_list),
                "fetch_date": datetime.now().isoformat(),
                "source": "ClinicalTrials.gov API v2",
                "pipeline_focus": "Lumen Bio"
            },
            "studies": unique_trials_list
        }, f, indent=2)
    
    output_files.append(consolidated_file)
    
    print(f"\nCompleted Lumen Bio data collection:")
    print(f"- Total trials before deduplication: {len(all_trials)}")
    print(f"- Unique trials after deduplication: {len(unique_trials_list)}")
    print(f"- Consolidated file: {consolidated_file}")
    
    return {
        "success": True,
        "total_fetched": len(unique_trials_list),
        "output_files": output_files,
        "consolidated_file": consolidated_file
    }

if __name__ == "__main__":
    # Get records per indication from command line, default to 100
    records_per_indication = 100
    if len(sys.argv) > 1:
        try:
            records_per_indication = int(sys.argv[1])
        except ValueError:
            print(f"Invalid records_per_indication value: {sys.argv[1]}. Using default: 100")
    
    result = fetch_lumen_bio_trials(records_per_indication=records_per_indication)
    
    if result["success"]:
        print(f"Successfully collected {result['total_fetched']} unique clinical trials for Lumen Bio's pipeline areas")
    else:
        print("Failed to collect data for Lumen Bio's pipeline")
        sys.exit(1)
