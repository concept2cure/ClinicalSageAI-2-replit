
#!/usr/bin/env python3
"""
Client-specific Clinical Trial Data Fetcher

This script fetches and organizes clinical trial data specifically relevant to 
Lumen Bio's pipeline and therapeutic areas.
"""

import sys
import os
import json
import time
import requests
from datetime import datetime
from tqdm import tqdm

# Add the current directory to the path so we can import from existing scripts
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the function from the existing script
from fetch_trials_v2_api import fetch_clinical_trials, fetch_multiple_trials

def fetch_lumen_bio_trials():
    """
    Fetch clinical trials relevant to Lumen Bio's pipeline areas.
    
    Based on Lumen Bio's pipeline (https://www.lumen.bio/pipeline/):
    - LMB-100: Recombinant Immunotoxin for Solid Tumors
    - LMB-764/BER-T01: Claudin 6 Targeted Immunotoxin for Ovarian Cancer
    - TC-1 Targeted: Targeted Immunotherapy for HPV+ Cancers
    - XNW-5001: ROR1-Targeted Immunotoxin for Hematological/Solid Tumors
    """
    print("Starting specialized data collection for Lumen Bio's pipeline...")
    
    # Create output directory
    output_dir = os.path.join(os.getcwd(), "server/scripts/data/clients/lumen_bio")
    os.makedirs(output_dir, exist_ok=True)
    
    # Define queries based on Lumen Bio's therapeutic areas and pipeline
    client_queries = {
        "immunotoxin_trials": {
            "query": "immunotoxin OR recombinant immunotoxin",
            "records": 30,
            "description": "Trials investigating immunotoxins similar to LMB-100"
        },
        "claudin_6_trials": {
            "query": "claudin 6 OR CLDN6",
            "records": 30,
            "description": "Trials targeting Claudin 6 like LMB-764/BER-T01"
        },
        "ovarian_cancer": {
            "query": "ovarian cancer immunotherapy",
            "records": 30,
            "description": "Trials for ovarian cancer immunotherapy"
        },
        "hpv_cancer": {
            "query": "HPV positive cancer OR HPV+ cancer immunotherapy",
            "records": 30,
            "description": "Trials for HPV+ cancers like TC-1 Targeted"
        },
        "ror1_cancer": {
            "query": "ROR1 cancer OR ROR1 targeted",
            "records": 30,
            "description": "Trials targeting ROR1 like XNW-5001"
        },
        "solid_tumors": {
            "query": "targeted immunotherapy solid tumors",
            "records": 30,
            "description": "Trials for solid tumors using targeted immunotherapies"
        }
    }
    
    # Track results
    all_results = {
        "metadata": {
            "client": "Lumen Bio",
            "generated_date": datetime.now().isoformat(),
            "query_categories": list(client_queries.keys())
        },
        "queries": client_queries,
        "stats": {},
        "trial_categories": {},
        "all_trials": []
    }
    
    # Fetch data for each query category
    total_fetched = 0
    output_files = []
    
    for category, query_info in client_queries.items():
        print(f"\nFetching {category} data: {query_info['description']}")
        
        # Construct query and fetch the data
        query = query_info["query"]
        max_records = query_info["records"]
        
        result = fetch_clinical_trials(
            query=query,
            max_records=max_records,
            output_file=f"{category}_trials.json",
            output_dir=output_dir
        )
        
        if result["success"]:
            output_files.append(result["output_file"])
            
            # Load the data for this category and add to the combined results
            with open(result["output_file"], 'r') as f:
                category_data = json.load(f)
                
                # Track trials by category for easier analysis
                all_results["trial_categories"][category] = []
                
                for study in category_data.get("studies", []):
                    # Get NCT ID and check if we already have this trial
                    nct_id = None
                    for identifier in study.get("protocolSection", {}).get("identificationModule", {}).get("nctId", ""):
                        nct_id = identifier
                        break
                    
                    if nct_id:
                        # Add to category tracking
                        all_results["trial_categories"][category].append(nct_id)
                        
                        # Check if already in all_trials before adding
                        if not any(t.get("nct_id") == nct_id for t in all_results["all_trials"]):
                            # Extract key information
                            protocol = study.get("protocolSection", {})
                            identification = protocol.get("identificationModule", {})
                            status = protocol.get("statusModule", {})
                            sponsor = protocol.get("sponsorCollaboratorsModule", {})
                            
                            # Add simplified trial info to the consolidated list
                            all_results["all_trials"].append({
                                "nct_id": nct_id,
                                "title": identification.get("briefTitle", ""),
                                "official_title": identification.get("officialTitle", ""),
                                "phase": protocol.get("designModule", {}).get("phases", ["Unknown"])[0],
                                "status": status.get("overallStatus", "Unknown"),
                                "sponsor": sponsor.get("leadSponsor", {}).get("name", "Unknown"),
                                "conditions": protocol.get("conditionsModule", {}).get("conditions", []),
                                "start_date": status.get("startDateStruct", {}).get("date", ""),
                                "completion_date": status.get("completionDateStruct", {}).get("date", ""),
                                "interventions": protocol.get("armsInterventionsModule", {}).get("interventions", []),
                                "categories": [category]
                            })
                        else:
                            # If already exists, just add this category to its categories list
                            for trial in all_results["all_trials"]:
                                if trial.get("nct_id") == nct_id and category not in trial.get("categories", []):
                                    trial["categories"].append(category)
            
            total_fetched += result["records_fetched"]
            print(f"✓ Successfully fetched {result['records_fetched']} records for {category}")
        else:
            print(f"✗ Failed to fetch data for {category}: {result['message']}")
    
    # Update stats
    all_results["stats"] = {
        "total_trials": len(all_results["all_trials"]),
        "trials_by_category": {k: len(v) for k, v in all_results["trial_categories"].items()},
        "trials_by_phase": {},
        "trials_by_status": {},
        "trials_by_sponsor": {},
        "total_fetched": total_fetched
    }
    
    # Count trials by phase, status, and sponsor
    for trial in all_results["all_trials"]:
        # Count by phase
        phase = trial.get("phase", "Unknown")
        all_results["stats"]["trials_by_phase"][phase] = all_results["stats"]["trials_by_phase"].get(phase, 0) + 1
        
        # Count by status
        status = trial.get("status", "Unknown")
        all_results["stats"]["trials_by_status"][status] = all_results["stats"]["trials_by_status"].get(status, 0) + 1
        
        # Count by sponsor
        sponsor = trial.get("sponsor", "Unknown")
        all_results["stats"]["trials_by_sponsor"][sponsor] = all_results["stats"]["trials_by_status"].get(sponsor, 0) + 1
    
    # Save consolidated results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    consolidated_file = os.path.join(output_dir, f"lumen_bio_consolidated_{timestamp}.json")
    
    with open(consolidated_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print(f"\nSuccessfully consolidated {len(all_results['all_trials'])} unique trials across {len(client_queries)} categories")
    print(f"Saved consolidated data to: {consolidated_file}")
    
    # Generate competitor analysis
    print("\nGenerating competitor landscape analysis...")
    competitor_analysis = analyze_competitor_landscape(all_results)
    
    competitor_file = os.path.join(output_dir, f"lumen_bio_competitor_analysis_{timestamp}.json")
    with open(competitor_file, 'w') as f:
        json.dump(competitor_analysis, f, indent=2)
    
    print(f"Saved competitor analysis to: {competitor_file}")
    
    return {
        "success": True,
        "total_fetched": total_fetched,
        "unique_trials": len(all_results["all_trials"]),
        "output_files": output_files,
        "consolidated_file": consolidated_file,
        "competitor_file": competitor_file
    }

def analyze_competitor_landscape(data):
    """Analyze the competitive landscape from the consolidated data"""
    
    # Extract all sponsors
    sponsors = {}
    for trial in data["all_trials"]:
        sponsor = trial.get("sponsor", "Unknown")
        if sponsor not in sponsors:
            sponsors[sponsor] = {
                "trials": [],
                "categories": set(),
                "phases": {},
                "status": {}
            }
        
        # Add trial to this sponsor
        sponsors[sponsor]["trials"].append(trial["nct_id"])
        
        # Track categories
        for category in trial.get("categories", []):
            sponsors[sponsor]["categories"].add(category)
        
        # Track phases
        phase = trial.get("phase", "Unknown")
        sponsors[sponsor]["phases"][phase] = sponsors[sponsor]["phases"].get(phase, 0) + 1
        
        # Track status
        status = trial.get("status", "Unknown")
        sponsors[sponsor]["status"][status] = sponsors[sponsor]["status"].get(status, 0) + 1
    
    # Convert sets to lists for JSON serialization
    for sponsor in sponsors:
        sponsors[sponsor]["categories"] = list(sponsors[sponsor]["categories"])
    
    # Filter to major competitors (those with multiple trials)
    major_competitors = {k: v for k, v in sponsors.items() if len(v["trials"]) >= 2}
    
    # Find competitors specifically in Lumen's main areas
    lumen_core_areas = ["immunotoxin_trials", "claudin_6_trials", "ror1_cancer"]
    direct_competitors = {}
    
    for sponsor, data in sponsors.items():
        if sponsor != "Lumen Bio" and any(area in data["categories"] for area in lumen_core_areas):
            direct_competitors[sponsor] = data
    
    return {
        "all_sponsors": len(sponsors),
        "major_competitors": len(major_competitors),
        "direct_competitors": len(direct_competitors),
        "sponsor_details": sponsors,
        "major_competitor_details": major_competitors,
        "direct_competitor_details": direct_competitors
    }

if __name__ == "__main__":
    results = fetch_lumen_bio_trials()
    print(f"\nSUMMARY: {results['unique_trials']} unique trials fetched and categorized for Lumen Bio.")
