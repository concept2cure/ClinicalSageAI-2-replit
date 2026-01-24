#!/usr/bin/env python3
"""
FAERS Client

This script retrieves and processes data from the FDA Adverse Event Reporting System (FAERS)
based on a given NDC code (National Drug Code).
"""

import sys
import json
import random
from datetime import datetime, timedelta
import urllib.request
import urllib.parse

# Constants for API access
FAERS_BASE_URL = "https://api.fda.gov/drug/event.json"
DEFAULT_LIMIT = 100

def check_api_key():
    """Check if an API key is available for FDA API (optional)"""
    # FDA API can be used without a key but has rate limits
    return True

def fetch_faers_data(ndc_code, limit=DEFAULT_LIMIT):
    """
    Fetch adverse event data from FAERS for a specific NDC code
    
    Args:
        ndc_code: The National Drug Code to search for
        limit: Maximum number of records to return
        
    Returns:
        Dictionary with processed FAERS data
    """
    try:
        # Format NDC code search query
        query = f'patient.drug.openfda.product_ndc:"{ndc_code}"'
        
        # Build URL with query parameters
        params = {
            'search': query,
            'limit': limit
        }
        
        url = f"{FAERS_BASE_URL}?{urllib.parse.urlencode(params)}"
        
        # Make request to FDA API
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode('utf-8'))
            
        # Process the raw data
        processed_data = process_faers_response(data, ndc_code)
        
        return processed_data
        
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # No data found for this NDC code
            return {
                "error": "No adverse event data found for this NDC code.",
                "drug_info": {
                    "ndc_code": ndc_code
                },
                "results": []
            }
        else:
            # Other HTTP error
            return {
                "error": f"FDA API error: {e.code} - {e.reason}",
                "drug_info": {
                    "ndc_code": ndc_code
                },
                "results": []
            }
    except Exception as e:
        # General error
        return {
            "error": f"Error fetching FAERS data: {str(e)}",
            "drug_info": {
                "ndc_code": ndc_code
            },
            "results": []
        }

def process_faers_response(raw_data, ndc_code):
    """
    Process the raw FAERS API response into a more usable format
    
    Args:
        raw_data: Raw JSON response from FAERS API
        ndc_code: The NDC code that was searched
        
    Returns:
        Dictionary with structured FAERS data
    """
    # Initialize result structure
    result = {
        "drug_info": {
            "ndc_code": ndc_code,
            "brand_name": None,
            "generic_name": None,
            "manufacturer": None
        },
        "results": [],
        "meta": {
            "total": raw_data.get("meta", {}).get("results", {}).get("total", 0),
            "limit": raw_data.get("meta", {}).get("results", {}).get("limit", 0)
        }
    }
    
    # Extract and process each report
    reports = raw_data.get("results", [])
    
    for report in reports:
        # Try to extract drug info if not already set
        if not result["drug_info"]["brand_name"] or not result["drug_info"]["generic_name"]:
            for drug in report.get("patient", {}).get("drug", []):
                if "openfda" in drug and "product_ndc" in drug["openfda"]:
                    if ndc_code in drug["openfda"]["product_ndc"]:
                        # Found our drug, extract information
                        result["drug_info"]["brand_name"] = drug.get("medicinalproduct") or \
                                                           (drug.get("openfda", {}).get("brand_name", [None])[0])
                        result["drug_info"]["generic_name"] = drug.get("openfda", {}).get("generic_name", [None])[0]
                        result["drug_info"]["manufacturer"] = drug.get("openfda", {}).get("manufacturer_name", [None])[0]
                        break
        
        # Extract report information
        report_info = {
            "report_id": report.get("safetyreportid"),
            "report_date": report.get("receivedate"),
            "serious": report.get("serious") == "1",
            "patient": {
                "age": extract_patient_age(report),
                "gender": extract_patient_gender(report),
                "weight": extract_patient_weight(report)
            },
            "reactions": extract_reactions(report),
            "outcome": extract_outcome(report)
        }
        
        result["results"].append(report_info)
    
    return result

def extract_patient_age(report):
    """Extract patient age from report"""
    patient = report.get("patient", {})
    
    # Try to get age in years
    if "patientonsetage" in patient and "patientonsetageunit" in patient:
        age = patient["patientonsetage"]
        unit = patient["patientonsetageunit"]
        
        # Convert to years if needed
        if unit == "801": # Months
            return round(float(age) / 12, 1)
        elif unit == "802": # Weeks
            return round(float(age) / 52, 1)
        elif unit == "803": # Days
            return round(float(age) / 365, 1)
        elif unit == "800": # Years
            return float(age)
    
    return None

def extract_patient_gender(report):
    """Extract patient gender from report"""
    gender_code = report.get("patient", {}).get("patientsex")
    
    if gender_code == "1":
        return "Male"
    elif gender_code == "2":
        return "Female"
    
    return "Unknown"

def extract_patient_weight(report):
    """Extract patient weight from report"""
    weight = report.get("patient", {}).get("patientweight")
    
    if weight:
        return float(weight)
    
    return None

def extract_reactions(report):
    """Extract adverse reactions from report"""
    reactions = []
    
    for reaction in report.get("patient", {}).get("reaction", []):
        if "reactionmeddrapt" in reaction:
            reactions.append(reaction["reactionmeddrapt"])
    
    return reactions

def extract_outcome(report):
    """Extract patient outcome from report"""
    outcome_code = report.get("patient", {}).get("patientdeath", {}).get("patientdeathdateformat")
    
    if outcome_code:
        return "Death"
    
    if report.get("serious") == "1":
        outcomes = []
        if report.get("seriousnessdeath") == "1":
            outcomes.append("Death")
        if report.get("seriousnesslifethreatening") == "1":
            outcomes.append("Life-threatening")
        if report.get("seriousnesshospitalization") == "1":
            outcomes.append("Hospitalization")
        if report.get("seriousnessdisabling") == "1":
            outcomes.append("Disabling")
        if report.get("seriousnesscongenitalanomali") == "1":
            outcomes.append("Congenital Anomaly")
        if report.get("seriousnessother") == "1":
            outcomes.append("Other Serious")
            
        if outcomes:
            return ", ".join(outcomes)
        return "Serious"
    
    return "Non-serious"

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "NDC code required"}))
        sys.exit(1)
    
    ndc_code = sys.argv[1]
    result = fetch_faers_data(ndc_code)
    
    # Output as JSON
    print(json.dumps(result))

if __name__ == "__main__":
    main()