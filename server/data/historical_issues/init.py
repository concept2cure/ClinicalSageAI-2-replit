"""
Initialize historical issues data.

This module ensures that the historical issues data files exist.
"""
import os
import json

def ensure_historical_issues_exist():
    """
    Ensure that historical issues files exist.
    Creates default empty files if they don't exist.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # List of standard files
    files = [
        "default_issues.json",
        "fda_issues.json",
        "ema_issues.json",
        "pmda_issues.json"
    ]
    
    # Create empty issues array if files don't exist
    for file in files:
        file_path = os.path.join(base_dir, file)
        if not os.path.exists(file_path):
            with open(file_path, 'w') as f:
                json.dump([], f)

# Call the function at import time
ensure_historical_issues_exist()