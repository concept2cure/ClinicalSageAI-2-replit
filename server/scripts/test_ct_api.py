#!/usr/bin/env python3
import requests
import json

def test_api_call():
    """Test a very basic API call to ClinicalTrials.gov API v2"""
    # Use the simplest possible call with no parameters
    base_url = "https://clinicaltrials.gov/api/v2/studies"
    
    # Try with absolutely minimal parameters
    params = {}
    
    print(f"Making API request to {base_url} with params: {params}")
    response = requests.get(base_url, params=params)
    
    print(f"Response status code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        total_count = data.get("studyCount", 0)
        print(f"Total studies found: {total_count}")
        
        if total_count > 0 and "studies" in data:
            print(f"First study NCT ID: {data['studies'][0].get('protocolSection', {}).get('identificationModule', {}).get('nctId', 'Unknown')}")
            print(f"First study title: {data['studies'][0].get('protocolSection', {}).get('identificationModule', {}).get('briefTitle', 'Unknown')}")
        else:
            print("No studies found or missing studies array")
    else:
        print(f"Error response: {response.text}")

if __name__ == "__main__":
    test_api_call()