#!/usr/bin/env python3
"""
Parse CSR JSON files to regenerate the dataset and proceed to training
"""
import os
import json
import pandas as pd

print("Parsing CSR JSON files to regenerate dataset...")

csr_dir = "data/processed_csrs"
records = []

os.makedirs("data", exist_ok=True)

for fname in os.listdir(csr_dir):
    if not fname.endswith(".json"):
        continue

    with open(os.path.join(csr_dir, fname)) as f:
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
            "outcome": outcome,
            "success": int("significant" in outcome or "met endpoint" in outcome or "primary endpoint met" in outcome),
            "failure_reason": csr.get("failure_reason", "")
        }
        records.append(record)
        print(f"Processed {fname}: {'Success' if record['success'] else 'Failure'}")
    except Exception as e:
        print(f"Error in {fname}: {e}")

df = pd.DataFrame(records)
csv_path = "data/csr_dataset.csv"
df.to_csv(csv_path, index=False)

print(f"Dataset saved to {csv_path} with {len(records)} records")