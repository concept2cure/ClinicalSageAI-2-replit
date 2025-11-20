#!/usr/bin/env python3
# Fix CSR Data script - Adds missing csr_id to CSR data files

import os
import json
import sys

# Constants
PROCESSED_CSR_DIR = "data/processed_csrs"

def fix_csr_data_files():
    """Add missing csr_id field to CSR data files"""
    print(f"🔍 Examining CSR files in {PROCESSED_CSR_DIR}")
    
    # Ensure directory exists
    if not os.path.exists(PROCESSED_CSR_DIR):
        print(f"Creating directory {PROCESSED_CSR_DIR}")
        os.makedirs(PROCESSED_CSR_DIR, exist_ok=True)
        return 0
    
    # Count of processed files
    fixed_count = 0
    total_count = 0
    
    # Process all JSON files
    for filename in os.listdir(PROCESSED_CSR_DIR):
        if filename.endswith('.json'):
            total_count += 1
            file_path = os.path.join(PROCESSED_CSR_DIR, filename)
            
            try:
                # Load the CSR data
                with open(file_path, 'r') as f:
                    data = json.load(f)
                
                # Check if csr_id is missing
                if "csr_id" not in data:
                    # Extract ID from filename (e.g., HC-1240.json -> HC-1240)
                    csr_id = os.path.splitext(filename)[0]
                    data["csr_id"] = csr_id
                    
                    # Save the updated data
                    with open(file_path, 'w') as f:
                        json.dump(data, f, indent=2)
                    
                    fixed_count += 1
                    print(f"✅ Added csr_id to {filename}")
            
            except Exception as e:
                print(f"❌ Error processing {filename}: {str(e)}")
    
    print(f"\n📊 Summary: Fixed {fixed_count} out of {total_count} CSR files")
    return fixed_count

if __name__ == "__main__":
    print("🔧 CSR Data Fixer - Adding missing csr_id fields")
    count = fix_csr_data_files()
    print(f"✨ Complete! Fixed {count} CSR files.")