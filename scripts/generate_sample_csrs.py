#!/usr/bin/env python3
import os
import json
import random
from datetime import datetime, timedelta
import uuid

def generate_sample_csrs(num_samples=50, output_dir="data/processed_csrs"):
    """
    Generate sample CSR JSON files for ML model development and testing.
    These samples are based on realistic patterns from clinical trials.
    """
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Common indications
    indications = [
        "COPD", "Hypertension", "Rheumatoid Arthritis", "Non-Small Cell Lung Cancer",
        "Type 2 Diabetes", "Multiple Sclerosis", "Alzheimer's Disease", "Asthma",
        "Crohn's Disease", "Major Depressive Disorder", "Parkinson's Disease",
        "Breast Cancer", "Psoriasis", "Epilepsy", "Heart Failure"
    ]
    
    # Trial phases
    phases = ["1", "1/2", "2", "2/3", "3", "4"]
    phase_weights = [0.1, 0.1, 0.3, 0.1, 0.3, 0.1]  # Most trials are phase 2 or 3
    
    # Blinding options
    blinding_options = ["double-blind", "single-blind", "open-label"]
    blinding_weights = [0.6, 0.1, 0.3]
    
    # Control arm types
    control_types = ["placebo", "active comparator", "standard of care", "none"]
    control_weights = [0.4, 0.3, 0.2, 0.1]
    
    # Primary endpoints by indication
    endpoint_by_indication = {
        "COPD": ["Exacerbation reduction", "FEV1 improvement", "Quality of life score"],
        "Hypertension": ["SBP reduction", "DBP reduction", "CV events reduction"],
        "Rheumatoid Arthritis": ["ACR20 response", "DAS28 score reduction", "Joint damage progression"],
        "Non-Small Cell Lung Cancer": ["Overall survival", "Progression-free survival", "Objective response rate"],
        "Type 2 Diabetes": ["HbA1c reduction", "Fasting plasma glucose", "Weight change"],
        "Multiple Sclerosis": ["Relapse rate", "MRI lesion count", "EDSS progression"],
        "Alzheimer's Disease": ["ADAS-Cog score", "CDR-SB score", "Cognitive function"],
        "Asthma": ["FEV1 improvement", "Exacerbation rate", "Symptom-free days"],
        "Crohn's Disease": ["CDAI score", "Mucosal healing", "Steroid-free remission"],
        "Major Depressive Disorder": ["MADRS score", "HAM-D score", "Response rate"],
        "Parkinson's Disease": ["UPDRS score", "OFF time reduction", "PDQ-39 score"],
        "Breast Cancer": ["Overall survival", "Disease-free survival", "Objective response rate"],
        "Psoriasis": ["PASI 75 response", "IGA score", "Quality of life improvement"],
        "Epilepsy": ["Seizure frequency", "Seizure-free days", "Quality of life"],
        "Heart Failure": ["CV death or HF hospitalization", "NYHA class improvement", "6MWT distance"]
    }
    
    # Failure reasons based on indication and success
    failure_reasons = [
        "Inadequate statistical power",
        "High placebo response rate",
        "Unexpected safety findings",
        "Insufficient efficacy",
        "Poor recruitment/enrollment",
        "Dosing limitations due to side effects",
        "Low compliance/adherence",
        "Pharmacokinetic issues with drug exposure",
        "Target engagement not achieved",
        "Endpoint selection issues",
        "Formulation problems"
    ]
    
    # Generate the sample CSRs
    generated_files = []
    
    for i in range(num_samples):
        # Choose a random indication
        indication = random.choice(indications)
        
        # Determine sample size
        sample_size = int(random.normalvariate(300, 100))
        if sample_size < 50:
            sample_size = 50
        
        # Determine duration (weeks)
        duration_weeks = int(random.normalvariate(52, 25))
        if duration_weeks < 4:
            duration_weeks = 4
        
        # Select other parameters
        phase = random.choices(phases, weights=phase_weights)[0]
        blinding = random.choices(blinding_options, weights=blinding_weights)[0]
        control_arm = random.choices(control_types, weights=control_weights)[0]
        
        # Calculate dropout rate (normal distribution centered around 0.25)
        dropout_rate = random.normalvariate(0.25, 0.1)
        dropout_rate = max(0.05, min(0.6, dropout_rate))  # Clamp between 5% and 60%
        dropout_rate = round(dropout_rate, 2)
        
        # Select primary endpoint based on indication
        primary_endpoint = random.choice(endpoint_by_indication[indication])
        
        # Determine success (30% chance of success, biased by phase)
        # Phase 3 trials have higher chance of success
        phase_success_modifier = 1.0
        if phase in ["3", "4"]:
            phase_success_modifier = 1.5
        elif phase in ["1", "1/2"]:
            phase_success_modifier = 0.7
        
        success_probability = 0.32 * phase_success_modifier
        success = random.random() < success_probability
        
        # Generate an outcome summary
        if success:
            outcome_summary = f"Study met its primary endpoint with {primary_endpoint} showing statistically significant improvement."
            failure_reason = ""
        else:
            outcome_type = random.choice([
                "did not meet primary efficacy endpoints",
                "failed to reach statistical significance on primary endpoint",
                "no significant difference compared to placebo",
                "benefit-risk profile does not support further development",
                "trial terminated early due to safety signals",
                "did not demonstrate sufficient efficacy"
            ])
            outcome_summary = f"Study {outcome_type}."
            failure_reason = random.choice(failure_reasons)
        
        # Create a unique NCT ID
        nct_id = f"NCT{random.randint(10000000, 99999999)}"
        
        # Create the CSR data
        csr_data = {
            "nct_id": nct_id,
            "indication": indication,
            "phase": f"Phase {phase}",
            "sample_size": sample_size,
            "duration_weeks": duration_weeks,
            "dropout_rate": dropout_rate,
            "primary_endpoints": [primary_endpoint],
            "secondary_endpoints": random.sample(endpoint_by_indication[indication], 
                                              min(2, len(endpoint_by_indication[indication]))),
            "blinding": blinding,
            "control_arm": control_arm,
            "outcome_summary": outcome_summary,
            "success": success,
            "failure_reason": failure_reason
        }
        
        # Generate a filename and save
        file_name = f"{nct_id}_{indication.replace(' ', '_')}.json"
        file_path = os.path.join(output_dir, file_name)
        
        with open(file_path, 'w') as f:
            json.dump(csr_data, f, indent=2)
            
        generated_files.append(file_path)
        
    print(f"Generated {len(generated_files)} sample CSR files in {output_dir}")
    return generated_files

if __name__ == "__main__":
    generate_sample_csrs(50)