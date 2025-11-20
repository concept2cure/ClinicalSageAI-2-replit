#!/usr/bin/env python3
import os
import json
import pandas as pd
import argparse
from pathlib import Path

def parse_csrs_to_csv(input_dir="data/processed_csrs", output_file="data/csr_dataset.csv"):
    """
    Parse CSR JSON files to a CSV file for ML model training
    """
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    records = []
    input_path = Path(input_dir)
    
    if not input_path.exists():
        print(f"Input directory {input_dir} does not exist. Creating it...")
        os.makedirs(input_dir, exist_ok=True)
        print(f"You'll need to add CSR JSON files to {input_dir} before running this script.")
        return None
    
    json_files = list(input_path.glob("*.json"))
    
    if not json_files:
        print(f"No JSON files found in {input_dir}. Use generate_sample_csrs.py to create test data.")
        return None
    
    print(f"Processing {len(json_files)} JSON files from {input_dir}...")
    
    for file_path in json_files:
        try:
            with open(file_path) as f:
                csr = json.load(f)
            
            # Extract the outcome text and normalize it
            outcome = csr.get("outcome_summary", "").lower()
            
            # Create a record for the CSV
            record = {
                "nct_id": csr.get("nct_id", file_path.stem),
                "indication": csr.get("indication", "").strip(),
                "phase": csr.get("phase", "").replace("Phase ", "").strip(),
                "sample_size": csr.get("sample_size", 0),
                "duration_weeks": csr.get("duration_weeks", 0),
                "dropout_rate": csr.get("dropout_rate", None),
                "endpoint_primary": csr.get("primary_endpoints", [""])[0] if isinstance(csr.get("primary_endpoints", []), list) else "",
                "control_type": csr.get("control_arm", "Unknown"),
                "blinding": csr.get("blinding", "None"),
                # Determine success based on keywords in the outcome summary
                "success": int("significant" in outcome or 
                               "met endpoint" in outcome or 
                               "positive results" in outcome or
                               "successfully met" in outcome),
                "failure_reason": csr.get("failure_reason", "") if not ("significant" in outcome or 
                                                                        "met endpoint" in outcome or 
                                                                        "positive results" in outcome or
                                                                        "successfully met" in outcome) else ""
            }
            records.append(record)
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    
    if not records:
        print("No valid records extracted from CSR files.")
        return None
    
    # Create a DataFrame and save to CSV
    df = pd.DataFrame(records)
    df.to_csv(output_file, index=False)
    
    print(f"Successfully created {output_file} with {len(df)} records")
    print("\nDataset summary:")
    print(f"- Success rate: {df['success'].mean():.2f} ({df['success'].sum()} successful trials)")
    print(f"- Failure count: {len(df) - df['success'].sum()} trials")
    print(f"- Unique indications: {df['indication'].nunique()}")
    print(f"- Phase distribution: {df['phase'].value_counts().to_dict()}")
    print(f"- Average sample size: {df['sample_size'].mean():.1f}")
    print(f"- Average duration: {df['duration_weeks'].mean():.1f} weeks")
    print(f"- Average dropout rate: {df['dropout_rate'].mean():.2f}")
    
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parse CSR JSON files to CSV for ML model training")
    parser.add_argument("--input", default="data/processed_csrs", help="Input directory containing CSR JSON files")
    parser.add_argument("--output", default="data/csr_dataset.csv", help="Output CSV file path")
    args = parser.parse_args()
    
    parse_csrs_to_csv(input_dir=args.input, output_file=args.output)