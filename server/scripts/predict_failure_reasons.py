#!/usr/bin/env python3
import os
import sys
import json
import argparse
import pickle
import numpy as np
import pandas as pd
from pathlib import Path

# Get project root directory
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Add project root to path to import modules
sys.path.append(project_root)

def load_category_classifier():
    """
    Load the failure category classifier model and vectorizer
    """
    models_dir = os.path.join(project_root, "models")
    
    # Check if models exist
    model_path = os.path.join(models_dir, "failure_category_classifier.pkl")
    vectorizer_path = os.path.join(models_dir, "failure_category_vectorizer.pkl")
    
    if not os.path.exists(model_path) or not os.path.exists(vectorizer_path):
        print("Error: Category classifier model files not found. Please train the model first.", file=sys.stderr)
        return None, None
    
    # Load the model and vectorizer
    with open(model_path, 'rb') as f:
        category_clf = pickle.load(f)
    
    with open(vectorizer_path, 'rb') as f:
        category_vec = pickle.load(f)
    
    return category_clf, category_vec

def normalize_phase(phase):
    """Normalize the phase value"""
    phase = str(phase).replace("Phase ", "").strip()
    return phase

def normalize_control_type(control_type):
    """Normalize the control type"""
    control_type = control_type.lower()
    if "placebo" in control_type:
        return "placebo"
    elif "active" in control_type:
        return "active"
    elif "standard" in control_type:
        return "standard of care"
    else:
        return "none"

def normalize_blinding(blinding):
    """Normalize the blinding value"""
    blinding = blinding.lower()
    if "double" in blinding:
        return "double-blind"
    elif "single" in blinding:
        return "single-blind"
    else:
        return "open-label"

def generate_potential_failure_reasons(trial_data):
    """
    Generate potential failure reasons based on trial data
    """
    potential_reasons = []
    
    # Check sample size
    sample_size = int(trial_data.get('sampleSize', 0))
    if sample_size < 200:
        potential_reasons.append(
            "Inadequate statistical power due to small sample size"
        )
    
    # Check duration
    duration = int(trial_data.get('duration', 0))
    if duration < 12:
        potential_reasons.append(
            "Insufficient duration to observe treatment effect"
        )
    
    # Check blinding
    blinding = normalize_blinding(trial_data.get('blinding', 'open-label'))
    if blinding == 'open-label':
        potential_reasons.append(
            "Potential bias due to open-label design"
        )
    
    # Check control type
    control_type = normalize_control_type(trial_data.get('controlType', 'none'))
    if control_type == 'none':
        potential_reasons.append(
            "Lack of control arm limits interpretability of results"
        )
    
    # Add indication-specific risks
    indication = trial_data.get('indication', '')
    
    if 'cancer' in indication.lower() or 'oncology' in indication.lower():
        potential_reasons.append(
            "Heterogeneous patient population affecting response rate"
        )
    
    if 'diabetes' in indication.lower():
        potential_reasons.append(
            "High placebo response rate in diabetes studies"
        )
    
    if 'psychiatric' in indication.lower() or 'depression' in indication.lower():
        potential_reasons.append(
            "High placebo response and subjective endpoints"
        )
    
    # Add generic reasons if needed
    if len(potential_reasons) < 3:
        potential_reasons.append(
            "Patient recruitment and retention challenges"
        )
        potential_reasons.append(
            "Protocol complexity leading to implementation issues"
        )
    
    return potential_reasons

def categorize_failure_reasons(category_clf, category_vec, reasons):
    """
    Categorize failure reasons using the trained classifier
    """
    if category_clf is None or category_vec is None:
        # Return fallback categorization
        categories = {
            'statistical': ['power', 'sample size', 'statistical'],
            'safety': ['safety', 'adverse', 'toxicity'],
            'efficacy': ['efficacy', 'effective'],
            'design': ['design', 'protocol', 'blinding'],
            'enrollment': ['recruitment', 'enrollment'],
            'pharmacology': ['pharmacokinetic', 'drug exposure']
        }
        
        categorized = []
        for reason in reasons:
            assigned_category = 'other'
            for category, keywords in categories.items():
                if any(keyword in reason.lower() for keyword in keywords):
                    assigned_category = category
                    break
            
            categorized.append({
                'reason': reason,
                'category': assigned_category,
                'probability': 0.8
            })
        
        return categorized
    
    # Use the classifier to categorize
    try:
        # Vectorize the reasons
        X = category_vec.transform(reasons)
        
        # Get predictions and probabilities
        categories = category_clf.predict(X)
        probabilities = np.max(category_clf.predict_proba(X), axis=1)
        
        # Create categorized list
        categorized = []
        for reason, category, probability in zip(reasons, categories, probabilities):
            categorized.append({
                'reason': reason,
                'category': category,
                'probability': float(probability)
            })
        
        return categorized
    
    except Exception as e:
        print(f"Error during categorization: {e}", file=sys.stderr)
        
        # Fall back to simple categorization
        return [{'reason': reason, 'category': 'other', 'probability': 0.5} for reason in reasons]

def generate_mitigation_strategies(categorized_reasons):
    """
    Generate mitigation strategies for each risk category
    """
    # Map of categories to mitigation strategies
    mitigation_map = {
        'statistical': [
            "Increase sample size to improve statistical power",
            "Implement adaptive design to allow for sample size re-estimation",
            "Consider more sensitive endpoints or stratification factors",
            "Use historical data to improve statistical approach"
        ],
        'safety': [
            "Implement more frequent safety monitoring",
            "Consider dose reduction or titration strategy",
            "Add interim safety analyses",
            "Refine inclusion/exclusion criteria to reduce risk"
        ],
        'efficacy': [
            "Refine endpoint selection based on mechanism of action",
            "Consider biomarker-based enrichment strategy",
            "Extend treatment duration to observe full effect",
            "Implement responder analyses or subgroup analyses"
        ],
        'design': [
            "Implement appropriate blinding procedures",
            "Simplify protocol to improve adherence",
            "Add independent adjudication of endpoints",
            "Review protocol with external experts"
        ],
        'enrollment': [
            "Broaden inclusion criteria or add more sites",
            "Implement patient engagement strategies",
            "Consider realistic enrollment timelines",
            "Develop site selection strategy focusing on performance"
        ],
        'pharmacology': [
            "Optimize dosing regimen based on PK/PD modeling",
            "Consider drug interaction studies if applicable",
            "Implement therapeutic drug monitoring if feasible",
            "Review formulation and bioavailability data"
        ],
        'other': [
            "Conduct thorough feasibility assessment",
            "Implement quality management system",
            "Consider operational simplification",
            "Engage with regulatory authorities early"
        ]
    }
    
    # Get unique categories present in reasons
    categories = set([reason['category'] for reason in categorized_reasons])
    
    # Select mitigation strategies for each category
    strategies = []
    for category in categories:
        if category in mitigation_map:
            # Add 1-2 strategies per category
            num_strategies = min(2, len(mitigation_map[category]))
            selected = np.random.choice(mitigation_map[category], num_strategies, replace=False)
            strategies.extend(selected)
    
    # Add general strategies if needed
    if len(strategies) < 3:
        general_strategies = [
            "Implement comprehensive risk management plan",
            "Ensure regular oversight and monitoring",
            "Conduct thorough protocol review before finalization"
        ]
        
        for strategy in general_strategies:
            if strategy not in strategies and len(strategies) < 5:
                strategies.append(strategy)
    
    return strategies

def generate_risk_breakdown(categorized_reasons):
    """
    Generate a breakdown of risks by category
    """
    # Count occurrences of each category
    categories = [reason['category'] for reason in categorized_reasons]
    unique_categories = set(categories)
    
    breakdown = []
    for category in unique_categories:
        count = categories.count(category)
        percentage = (count / len(categories)) * 100
        
        breakdown.append({
            'category': category,
            'count': count,
            'percentage': round(percentage, 1)
        })
    
    # Sort by percentage descending
    breakdown.sort(key=lambda x: x['percentage'], reverse=True)
    
    return breakdown

def assess_failure_risks(trial_data):
    """
    Assess potential failure risks for a clinical trial
    """
    try:
        # Load the category classifier
        category_clf, category_vec = load_category_classifier()
        
        # Generate potential failure reasons
        potential_reasons = generate_potential_failure_reasons(trial_data)
        
        # Categorize the reasons
        categorized_reasons = categorize_failure_reasons(category_clf, category_vec, potential_reasons)
        
        # Generate mitigation strategies
        mitigation_strategies = generate_mitigation_strategies(categorized_reasons)
        
        # Generate risk breakdown
        risk_breakdown = generate_risk_breakdown(categorized_reasons)
        
        # Return the results
        return {
            'primary_risks': categorized_reasons,
            'risk_breakdown': risk_breakdown,
            'mitigation_strategies': mitigation_strategies
        }
    
    except Exception as e:
        print(f"Error during risk assessment: {e}", file=sys.stderr)
        
        # Return fallback results
        return {
            'primary_risks': [
                {'reason': 'Statistical power concerns', 'category': 'statistical', 'probability': 0.7},
                {'reason': 'Potential recruitment challenges', 'category': 'enrollment', 'probability': 0.6}
            ],
            'risk_breakdown': [
                {'category': 'statistical', 'count': 1, 'percentage': 50.0},
                {'category': 'enrollment', 'count': 1, 'percentage': 50.0}
            ],
            'mitigation_strategies': [
                'Increase sample size to improve statistical power',
                'Implement adaptive design elements',
                'Develop site selection strategy focusing on performance'
            ]
        }

def main():
    parser = argparse.ArgumentParser(description="Predict clinical trial failure reasons")
    parser.add_argument('--input', required=True, help='JSON file with trial data')
    
    args = parser.parse_args()
    
    # Load input data
    with open(args.input, 'r') as f:
        trial_data = json.load(f)
    
    # Assess failure risks
    assessment = assess_failure_risks(trial_data)
    
    # Output assessment as JSON
    print(json.dumps(assessment))

if __name__ == "__main__":
    main()