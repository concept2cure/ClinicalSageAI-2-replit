#!/usr/bin/env python3
"""
Enhanced Clinical Trials Fetcher
This script fetches a batch of trials from ClinicalTrials.gov API v2
and processes them into a format ready for database import.
"""
import requests
import json
import random
import time
from datetime import datetime

def process_trial(study):
    """Process a single trial into our format"""
    protocol = study.get('protocolSection', {})
    
    # Extract basic information
    identification = protocol.get('identificationModule', {})
    status = protocol.get('statusModule', {})
    sponsor = protocol.get('sponsorCollaboratorsModule', {})
    conditions = protocol.get('conditionsModule', {})
    design = protocol.get('designModule', {})
    eligibility = protocol.get('eligibilityModule', {})
    description = protocol.get('descriptionModule', {})
    
    # Extract dates
    start_date = status.get('startDate', '')
    completion_date = status.get('completionDate', '')
    primary_completion_date = status.get('primaryCompletionDate', '')
    
    # Format study properly
    processed_study = {
        "nctrialId": identification.get('nctId', ''),
        "title": identification.get('briefTitle', ''),
        "officialTitle": identification.get('officialTitle', ''),
        "sponsor": sponsor.get('leadSponsor', {}).get('name', 'Unknown'),
        "indication": ', '.join(conditions.get('conditions', [])),
        "phase": design.get('phases', ['Unknown'])[0] if design.get('phases') else 'Unknown',
        "fileName": f"{identification.get('nctId', 'unknown')}.xml",
        "fileSize": 0,  # Placeholder
        "date": start_date,
        "completionDate": completion_date or primary_completion_date,
        "drugName": ', '.join([i.get('name', '') for i in design.get('interventions', []) if i and i.get('name')]) or 'Unknown',
        "source": "ClinicalTrials.gov API v2",
        "studyType": design.get('studyType', ''),
        "description": description.get('briefSummary', ''),
        "detailedDescription": description.get('detailedDescription', ''),
        "eligibilityCriteria": eligibility.get('eligibilityCriteria', '')
    }
    
    return processed_study

def main():
    """Main function to fetch and process clinical trials"""
    trials_per_batch = 100
    all_studies = []
    
    # For each fetch, use a random starting point to try to get different results
    random_offset = random.randint(0, 1000)
    
    try:
        # Fetch a batch of studies
        print(f"Fetching {trials_per_batch} trials from random offset {random_offset}...")
        
        # Try different approaches to get diverse studies
        params = {
            "format": "json",
            "pageSize": trials_per_batch
        }
        
        # Try to get a diverse set of studies by adding different filters each time
        approach = random.randint(1, 10)
        if approach == 1:
            print("Using completed studies filter...")
            params["query.term"] = "COMPLETED"
        elif approach == 2:
            print("Using phase filter...")
            phases = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]
            params["query.term"] = random.choice(phases)
        elif approach == 3:
            print("Using condition-based query...")
            conditions = ["cancer", "diabetes", "covid", "alzheimer", "asthma", "depression", 
                         "hypertension", "arthritis", "obesity", "parkinsons", "multiple sclerosis",
                         "copd", "stroke", "heart disease", "schizophrenia"]
            params["query.term"] = random.choice(conditions)
        elif approach == 4:
            print("Using specific sponsor filter...")
            sponsors = ["Pfizer", "Merck", "Novartis", "GSK", "AstraZeneca", "Roche", "Sanofi", 
                       "Johnson", "Bayer", "Boehringer", "Takeda", "Lilly", "Bristol", "Gilead", 
                       "Biogen", "Vertex", "Regeneron", "Moderna", "NIH", "FDA"]
            params["query.term"] = random.choice(sponsors)
        elif approach == 5:
            print("Using treatment-based query...")
            treatments = ["vaccine", "antibody", "surgery", "therapy", "drug", "gene therapy",
                         "immunotherapy", "stem cell", "device", "procedure", "radiation", 
                         "diagnostic", "screening", "prevention", "rehabilitation"]
            params["query.term"] = random.choice(treatments)
        elif approach == 6:
            print("Using year-based query...")
            years = [str(year) for year in range(2010, 2025)]
            params["query.term"] = random.choice(years)
        elif approach == 7:
            print("Using study type filter...")
            study_types = ["Interventional", "Observational", "Expanded Access"]
            params["query.term"] = random.choice(study_types)
        elif approach == 8:
            print("Using gender filter...")
            genders = ["male", "female"]
            params["query.term"] = random.choice(genders)
        elif approach == 9:
            print("Using country filter...")
            countries = ["United States", "China", "Germany", "UK", "Japan", "Canada", 
                        "France", "Australia", "Brazil", "India", "Italy", "Spain"]
            params["query.term"] = random.choice(countries)
        elif approach == 10:
            print("Using recruitment status filter...")
            statuses = ["Recruiting", "Completed", "Terminated", "Suspended", 
                       "Active", "Withdrawn", "Not yet recruiting"]
            params["query.term"] = random.choice(statuses)
            
        response = requests.get(
            "https://clinicaltrials.gov/api/v2/studies",
            params=params
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Error response: {response.text}")
            return
        
        data = response.json()
        studies = data.get("studies", [])
        
        if not studies:
            print("No studies available")
            return
        
        # Process each study
        processed_studies = [process_trial(study) for study in studies]
        all_studies.extend(processed_studies)
        
        print(f"Processed {len(processed_studies)} studies")
        
    except Exception as e:
        print(f"Error fetching or processing data: {e}")
    
    # Save to JSON file
    output = {
        "processed_count": len(all_studies),
        "processed_date": datetime.now().isoformat(),
        "studies": all_studies
    }
    
    with open('additional_trials.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Successfully processed and saved {len(all_studies)} studies to additional_trials.json")

if __name__ == "__main__":
    main()