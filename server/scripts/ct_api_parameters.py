#!/usr/bin/env python3
import requests
import json

def get_api_info():
    """Fetches metadata about the ClinicalTrials.gov API to determine correct parameters"""
    base_url = "https://clinicaltrials.gov/api/v2/api-info"
    
    print(f"Making API request to {base_url} for API info")
    response = requests.get(base_url)
    
    print(f"Response status code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        print("\nAvailable endpoints:")
        for endpoint in data.get("endpoints", []):
            print(f"- {endpoint}")
            
        print("\nAvailable parameters:")
        parameters = data.get("parameters", {})
        for param, details in parameters.items():
            param_type = details.get("type", "unknown")
            description = details.get("description", "No description")
            print(f"- {param} ({param_type}): {description}")
    else:
        print(f"Error response: {response.text}")

if __name__ == "__main__":
    get_api_info()