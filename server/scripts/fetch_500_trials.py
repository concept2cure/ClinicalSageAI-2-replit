
#!/usr/bin/env python3
"""
Script to fetch 500 clinical trial records from ClinicalTrials.gov API v2
"""

import sys
import os
import json
from datetime import datetime

# Add the current directory to the path so we can import from the existing script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the function from the existing script
from fetch_trials_v2_api import fetch_clinical_trials, fetch_multiple_trials

if __name__ == "__main__":
    print("Starting batch fetch of 500 clinical trials...")
    
    # Create output directory
    output_dir = os.path.join(os.getcwd(), "server/scripts/data")
    os.makedirs(output_dir, exist_ok=True)
    
    # Fetch data for multiple indications to get more diverse data and increase our chances
    # of getting unique trials not already in the database
    indications = [
        "cancer", "diabetes", "hypertension", "alzheimer", 
        "covid", "asthma", "arthritis", "depression",
        "obesity", "parkinson", "multiple sclerosis", "hiv",
        "hepatitis", "lupus", "rheumatoid arthritis", "copd",
        "stroke", "heart failure", "leukemia", "lymphoma"
    ]
    
    # Calculate how many records per indication to fetch to reach approximately 500
    records_per_indication = 30  # This should give us ~600 records with some overlap
    
    print(f"Fetching approximately {records_per_indication} records for each of {len(indications)} indications")
    
    # Fetch data for multiple queries
    result = fetch_multiple_trials(
        queries=indications,
        records_per_query=records_per_indication,
        output_dir=output_dir
    )
    
    if result["success"]:
        print(f"\nSUMMARY: Successfully fetched a total of {result['total_fetched']} records")
        for i, file_path in enumerate(result["output_files"]):
            print(f"  - File {i+1}: {file_path}")
        
        # Create a consolidated file with all the data
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        consolidated_file = os.path.join(output_dir, f"consolidated_trials_{timestamp}.json")
        
        all_studies = []
        for file_path in result["output_files"]:
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    studies = data.get("studies", [])
                    all_studies.extend(studies)
            except Exception as e:
                print(f"Error reading file {file_path}: {e}")
        
        # Save consolidated data
        with open(consolidated_file, 'w') as f:
            json.dump({
                "metadata": {
                    "total_fetched": len(all_studies),
                    "fetch_date": datetime.now().isoformat(),
                    "consolidation_source": "multiple indications"
                },
                "studies": all_studies
            }, f, indent=2)
        
        print(f"Saved {len(all_studies)} consolidated studies to {consolidated_file}")
    else:
        print("Failed to fetch clinical trial data")
        sys.exit(1)
