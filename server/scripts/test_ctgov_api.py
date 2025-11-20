#!/usr/bin/env python3
import requests
import json

def test_api_call():
    """Test a very basic API call to ClinicalTrials.gov Data API v1"""
    # Use the v1 Data API from the official documentation
    base_url = "https://clinicaltrials.gov/data-api/v1/studies"
    
    # Basic parameters as shown in docs
    params = {
        "fields": "NCTId,BriefTitle,Condition,Phase,LeadSponsorName",
        "query.cond": "cancer",
        "pageSize": 5
    }
    
    print(f"Making API request to {base_url} with params: {params}")
    response = requests.get(base_url, params=params)
    
    print(f"Response status code: {response.status_code}")
    
    # Print raw response for debugging
    print(f"Raw response content: {response.text[:1000]}...")
    
    if response.status_code == 200 and response.text:
        try:
            data = response.json()
            total_count = data.get("totalCount", 0)
            print(f"Total studies found: {total_count}")
        except Exception as e:
            print(f"Error parsing JSON: {e}")
        
        if total_count > 0 and "studies" in data:
            print("\nFirst few studies:")
            for study in data["studies"][:3]:
                print(f"- NCT ID: {study.get('protocolSection', {}).get('identificationModule', {}).get('nctId', 'Unknown')}")
                print(f"  Title: {study.get('protocolSection', {}).get('identificationModule', {}).get('briefTitle', 'Unknown')}")
                print(f"  Phase: {study.get('protocolSection', {}).get('designModule', {}).get('phases', ['Unknown'])[0]}")
                print()
        else:
            print("No studies found or missing studies array")
    else:
        print(f"Error response: {response.text}")

if __name__ == "__main__":
    test_api_call()