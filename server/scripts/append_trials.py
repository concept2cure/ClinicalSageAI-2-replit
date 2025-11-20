#!/usr/bin/env python3
"""
Append trials to existing trials JSON file
This script runs the fetch_more_trials.py script multiple times,
each time appending to the existing trials in additional_trials.json
"""
import json
import os
import subprocess
import time
from datetime import datetime

def main():
    """Main function to fetch and append trials"""
    target_count = 400  # Reduced target since we already have ~170 in the database
    current_count = 0
    max_attempts = 15   # Increased max attempts
    attempt = 0
    
    # Attempt to load existing data from additional_trials.json
    if os.path.exists('additional_trials.json'):
        try:
            with open('additional_trials.json', 'r') as f:
                existing_data = json.load(f)
                existing_studies = existing_data.get('studies', [])
                current_count = len(existing_studies)
                print(f"Found {current_count} existing studies in additional_trials.json")
        except Exception as e:
            print(f"Error loading existing trials: {e}")
            existing_studies = []
    else:
        print("No existing additional_trials.json found")
        existing_studies = []
    
    while current_count < target_count and attempt < max_attempts:
        attempt += 1
        print(f"\nAttempt {attempt} to fetch more trials. Current count: {current_count}")
        
        # Run the fetch_more_trials.py script
        try:
            subprocess.run(['python3', 'server/scripts/fetch_more_trials.py'], check=True)
            
            # Load newly fetched trials
            with open('additional_trials.json', 'r') as f:
                new_data = json.load(f)
                new_studies = new_data.get('studies', [])
                
                print(f"Fetched {len(new_studies)} new studies")
                
                if not new_studies:
                    print("No new studies fetched, stopping")
                    break
                
                # Append new studies to existing studies if they have different NCT IDs
                existing_nct_ids = set(study.get('nctrialId', '').strip() for study in existing_studies)
                
                # Track unique titles as a backup deduplication method
                existing_titles = set(study.get('title', '').strip().lower() for study in existing_studies 
                                      if study.get('title'))
                
                added_count = 0
                                
                for study in new_studies:
                    nct_id = study.get('nctrialId', '').strip()
                    title = study.get('title', '').strip().lower()
                    
                    # Only add if both NCT ID and title are unique
                    if nct_id and nct_id not in existing_nct_ids and title and title not in existing_titles:
                        existing_studies.append(study)
                        existing_nct_ids.add(nct_id)
                        existing_titles.add(title)
                        added_count += 1
                
                print(f"Added {added_count} new unique studies")
                
                current_count = len(existing_studies)
                print(f"Current total: {current_count} studies (after deduplication)")
                
                # Save the updated data
                output = {
                    "processed_count": current_count,
                    "processed_date": datetime.now().isoformat(),
                    "studies": existing_studies
                }
                
                with open('additional_trials.json', 'w') as f:
                    json.dump(output, f, indent=2)
                
                print(f"Updated additional_trials.json with {current_count} total studies")
                
                # Wait a bit before the next attempt
                if current_count < target_count:
                    print(f"Waiting 5 seconds before next attempt...")
                    time.sleep(5)
        
        except Exception as e:
            print(f"Error during fetch attempt: {e}")
            time.sleep(5)
    
    print(f"\nFinal count: {current_count} studies")
    print(f"Attempts made: {attempt}")
    
    if current_count >= target_count:
        print(f"Successfully reached target of {target_count} studies!")
    else:
        print(f"Could not reach target of {target_count} studies after {attempt} attempts")

if __name__ == "__main__":
    main()