#!/usr/bin/env python3
"""
Final parse after fully validated CSR files confirmed
"""
import os
import json
import pandas as pd

csr_dir = "data/processed_csrs"
records = []

print("Starting final parse with validated CSR files...")
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
        # Correctly detect success or failure
        is_failure = "failed" in outcome or "failure" in outcome or "no significant" in outcome
        is_success = 0 if is_failure else (1 if ("significant" in outcome or 
                        "met endpoint" in outcome or 
                        "primary endpoint met" in outcome or
                        "endpoint met" in outcome) else 0)
        
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
            "success": is_success,
            "failure_reason": csr.get("failure_reason", "") if is_failure else "N/A"
        }
        records.append(record)
        print(f"Successfully processed {fname}: {'Success' if record['success'] else 'Failure'}")
    except Exception as e:
        print(f"Error in {fname}: {e}")

df = pd.DataFrame(records)
csv_path = "data/csr_dataset.csv"
df.to_csv(csv_path, index=False)

print(f"\nDataset saved to {csv_path} with {len(records)} records")
print("\nVerifying sample CSRs:")
sample_csrs = []
for nct_id in ["NCT12345678", "NCT12345679", "NCT12345680"]:
    sample_row = df[df["nct_id"] == nct_id]
    if not sample_row.empty:
        sample_csrs.append({
            "nct_id": nct_id,
            "indication": sample_row["indication"].values[0],
            "sample_size": sample_row["sample_size"].values[0],
            "success": bool(sample_row["success"].values[0])
        })
        print(f"Found {nct_id}: {sample_csrs[-1]}")

print(f"\nTotal validated sample CSRs: {len(sample_csrs)}")