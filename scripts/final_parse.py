#!/usr/bin/env python3
"""
Final re-parse after valid CSR uploaded
"""
import os
import json
import pandas as pd

csr_dir = "data/processed_csrs"
records = []

os.makedirs("data", exist_ok=True)

for fname in os.listdir(csr_dir):
    if not fname.endswith(".json"):
        continue
        
    full_path = os.path.join(csr_dir, fname)
    print(f"Processing {full_path}")

    with open(full_path) as f:
        csr = json.load(f)

    try:
        outcome = csr.get("outcome_summary", "").lower()
        record = {
            "nct_id": csr.get("nct_id", fname.replace(".json", "")),
            "indication": csr.get("indication", "").strip(),
            "phase": csr.get("phase", "").replace("Phase ", "").strip(),
            "sample_size": csr.get("sample_size", 0),
            "duration_weeks": csr.get("duration_weeks", 0),
            "dropout_rate": csr.get("dropout_rate", 0),
            "endpoint_primary": csr.get("primary_endpoints", [""])[0] if isinstance(csr.get("primary_endpoints", [""]), list) else "",
            "control_type": csr.get("control_arm", "Unknown"),
            "blinding": csr.get("blinding", "None"),
            "success": int("significant" in outcome or "met endpoint" in outcome),
            "failure_reason": csr.get("failure_reason", outcome)
        }
        records.append(record)
        print(f"Successfully processed {fname}: {'Success' if record['success'] else 'Failure'}")
    except Exception as e:
        print(f"Error in {fname}: {e}")

df = pd.DataFrame(records)
csv_path = "data/csr_dataset.csv"
df.to_csv(csv_path, index=False)

print(f"Dataset saved to {csv_path} with {len(records)} records")
print("\nSample of the dataset:")
print(df.head())