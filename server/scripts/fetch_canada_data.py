#!/usr/bin/env python3
"""
Health Canada Clinical Trials API Fetcher
This script fetches clinical trial data from the Health Canada API
and processes it for import into the TrialSage database.

API Documentation: https://health-products.canada.ca/api/documentation/cta-documentation-en.html
"""
import requests
import json
import time
from datetime import datetime

CANADA_API_BASE = "https://clinical-trials.canada.ca/api/v1"

def fetch_trials_batch(page=1, per_page=100):
    """
    Fetch a batch of trials from Health Canada API
    
    Args:
        page: Page number to fetch
        per_page: Number of records per page
        
    Returns:
        List of clinical trials
    """
    url = f"{CANADA_API_BASE}/trials"
    params = {
        "page": page,
        "perPage": per_page,
        "lang": "en"
    }
    
    print(f"Requesting URL: {url} with params: {params}")
    
    try:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            print(f"Response structure: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
            return data.get('records', []) if isinstance(data, dict) and 'records' in data else []
        else:
            print(f"Error fetching trials: {response.status_code}, Response: {response.text[:100]}")
            return []
    except Exception as e:
        print(f"Exception during API request: {e}")
        return []

def get_trial_details(protocol_number):
    """
    Get detailed information for a specific trial
    
    Args:
        protocol_number: The trial's protocol number
        
    Returns:
        Dictionary containing detailed trial information
    """
    url = f"{CANADA_API_BASE}/trials/{protocol_number}"
    params = {"lang": "en"}
    
    print(f"Requesting trial details URL: {url}")
    
    try:
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            print(f"Detail response structure: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}")
            return data
        else:
            print(f"Error fetching trial details for {protocol_number}: {response.status_code}, Response: {response.text[:100]}")
            return {}
    except Exception as e:
        print(f"Exception during API request for trial {protocol_number}: {e}")
        return {}

def process_trial(trial, detailed_info=None):
    """
    Process a single trial into our CSR Report format
    
    Args:
        trial: Basic trial data
        detailed_info: Detailed trial information
        
    Returns:
        Dictionary formatted for our database
    """
    # Extract basic information
    protocol_number = trial.get('protocolNumber', trial.get('protocol_id', ''))
    
    # Get additional details if not provided
    if not detailed_info and protocol_number:
        detailed_info = get_trial_details(protocol_number)
        # Be nice to the API
        time.sleep(0.1)
    
    # Initialize with basic info
    processed_trial = {
        "nctrialId": f"HC-{protocol_number}",  # Add HC prefix to distinguish from NCT IDs
        "title": trial.get('publicTitle', trial.get('title', 'Unknown')),
        "officialTitle": trial.get('scientificTitle', trial.get('title', 'Unknown')),
        "sponsor": trial.get('sponsorName', trial.get('sponsor', 'Unknown')),
        "indication": trial.get('healthCondition', trial.get('condition', 'Unknown')),
        "phase": trial.get('phase', 'Unknown'),
        "fileName": f"HC-{protocol_number}.json",
        "fileSize": 0,
        "date": trial.get('startDate', trial.get('date', '')),
        "completionDate": trial.get('endDate', trial.get('completion_date', '')),
        "drugName": trial.get('interventions', trial.get('drugs', 'Unknown')),
        "source": "Health Canada Clinical Trials Database",
        "studyType": trial.get('studyType', 'Interventional'),
        "status": trial.get('status', 'Unknown')
    }
    
    # Add detailed info if available
    if detailed_info:
        # Extract more information from detailed record
        processed_trial["description"] = detailed_info.get('description', 
            detailed_info.get('summary', 
                detailed_info.get('protocol_details', {}).get('trial_summary', '')))
        
        # Get eligibility criteria
        if 'eligibility' in detailed_info:
            inclusion = detailed_info.get('eligibility', {}).get('inclusionCriteria', [])
            exclusion = detailed_info.get('eligibility', {}).get('exclusionCriteria', [])
            
            inclusion_str = "\n".join(inclusion) if isinstance(inclusion, list) else str(inclusion)
            exclusion_str = "\n".join(exclusion) if isinstance(exclusion, list) else str(exclusion)
            
            processed_trial["eligibilityCriteria"] = "\nInclusion Criteria:\n" + inclusion_str + \
                                                    "\n\nExclusion Criteria:\n" + exclusion_str
    
    # Print what we found to debug
    print(f"Processed trial: {protocol_number}")
    print(f"Title: {processed_trial['title']}")
    print(f"Sponsor: {processed_trial['sponsor']}")
    
    return processed_trial

def main():
    """Main function to fetch and process clinical trials from Health Canada API"""
    max_pages = 5  # Adjust this to fetch more or fewer trials
    all_trials = []
    
    print(f"Fetching up to {max_pages} pages of trials from Health Canada API...")
    
    for page in range(1, max_pages + 1):
        print(f"Fetching page {page}...")
        
        trials_batch = fetch_trials_batch(page)
        if not trials_batch:
            print(f"No more trials found or error occurred, stopping at page {page}")
            break
        
        print(f"Processing {len(trials_batch)} trials from page {page}...")
        
        # Process each trial to extract basic info
        for trial in trials_batch:
            protocol_number = trial.get('protocolNumber', trial.get('protocol_id', ''))
            if protocol_number:
                # Get detailed information
                print(f"Fetching details for trial {protocol_number}...")
                detailed_info = get_trial_details(protocol_number)
                
                # Process trial with detailed info
                processed_trial = process_trial(trial, detailed_info)
                all_trials.append(processed_trial)
                
                # Be nice to the API
                time.sleep(0.2)
            else:
                print(f"Missing protocol number in trial: {trial}")
        
        # Pause between pages to avoid overloading the API
        if page < max_pages:
            print("Pausing before next page request...")
            time.sleep(1)
    
    # Save to JSON file
    output = {
        "processed_count": len(all_trials),
        "processed_date": datetime.now().isoformat(),
        "studies": all_trials
    }
    
    with open('canada_trials.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Successfully processed and saved {len(all_trials)} Health Canada trials to canada_trials.json")

if __name__ == "__main__":
    main()