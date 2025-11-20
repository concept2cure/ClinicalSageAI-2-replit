import os
import json
import re
import sys
import random
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime

# Directory for processed CSR data
PROCESSED_CSRS_DIR = os.path.join(os.getcwd(), 'data/processed_csrs')

# Ensure directory exists
if not os.path.exists(PROCESSED_CSRS_DIR):
    os.makedirs(PROCESSED_CSRS_DIR, exist_ok=True)

def normalize_indication(indication: str) -> str:
    """Normalize indication string for matching"""
    return indication.lower().strip()

def normalize_phase(phase: str) -> str:
    """Normalize clinical trial phase"""
    phase = phase.lower().strip()
    
    # Map common variations to standard format
    phase_mapping = {
        'phase i': 'Phase 1',
        'phase 1': 'Phase 1',
        'phase ii': 'Phase 2',
        'phase 2': 'Phase 2',
        'phase iii': 'Phase 3',
        'phase 3': 'Phase 3',
        'phase iv': 'Phase 4',
        'phase 4': 'Phase 4',
        'phase i/ii': 'Phase 1/2',
        'phase 1/2': 'Phase 1/2',
        'phase ii/iii': 'Phase 2/3',
        'phase 2/3': 'Phase 2/3'
    }
    
    return phase_mapping.get(phase, phase)

def get_csr_files() -> List[str]:
    """Get list of CSR JSON files in the processed directory"""
    if not os.path.exists(PROCESSED_CSRS_DIR):
        return []
    
    return [f for f in os.listdir(PROCESSED_CSRS_DIR) if f.endswith('.json')]

def load_csr_data(filename: str) -> Dict[str, Any]:
    """Load CSR data from JSON file"""
    try:
        with open(os.path.join(PROCESSED_CSRS_DIR, filename), 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {filename}: {str(e)}", file=sys.stderr)
        return {}

def find_matching_csrs(indication: str, phase: str) -> List[Dict[str, Any]]:
    """Find CSRs matching the given indication and phase"""
    matching_csrs = []
    
    normalized_indication = normalize_indication(indication)
    normalized_phase = normalize_phase(phase)
    
    for filename in get_csr_files():
        csr_data = load_csr_data(filename)
        
        if not csr_data:
            continue
        
        # Check if indication and phase match (with fuzzy matching for indication)
        csr_indication = normalize_indication(csr_data.get('indication', ''))
        csr_phase = normalize_phase(csr_data.get('phase', ''))
        
        # Use substring matching for indication
        if normalized_indication in csr_indication or csr_indication in normalized_indication:
            if normalized_phase == csr_phase or normalized_phase in csr_phase or csr_phase in normalized_phase:
                matching_csrs.append(csr_data)
    
    return matching_csrs

def extract_endpoints(csrs: List[Dict[str, Any]]) -> List[Tuple[str, int]]:
    """Extract and count endpoints from CSRs"""
    endpoint_counter = {}
    
    for csr in csrs:
        # Extract primary endpoints
        primary_endpoints = csr.get('primary_endpoints', [])
        if isinstance(primary_endpoints, str):
            primary_endpoints = [primary_endpoints]
        
        for endpoint in primary_endpoints:
            if endpoint:
                endpoint_counter[endpoint] = endpoint_counter.get(endpoint, 0) + 2  # Weight primary endpoints higher
        
        # Extract secondary endpoints
        secondary_endpoints = csr.get('secondary_endpoints', [])
        if isinstance(secondary_endpoints, str):
            secondary_endpoints = [secondary_endpoints]
        
        for endpoint in secondary_endpoints:
            if endpoint:
                endpoint_counter[endpoint] = endpoint_counter.get(endpoint, 0) + 1
    
    # Sort endpoints by frequency
    sorted_endpoints = sorted(endpoint_counter.items(), key=lambda x: x[1], reverse=True)
    
    return sorted_endpoints[:10]  # Return top 10 endpoints

def calculate_average_duration(csrs: List[Dict[str, Any]]) -> Optional[float]:
    """Calculate average trial duration in weeks"""
    durations = []
    
    for csr in csrs:
        duration = csr.get('duration_weeks')
        if duration and isinstance(duration, (int, float)) and duration > 0:
            durations.append(duration)
    
    if durations:
        return round(sum(durations) / len(durations), 1)
    
    return None

def calculate_average_sample_size(csrs: List[Dict[str, Any]]) -> Optional[int]:
    """Calculate average sample size"""
    sample_sizes = []
    
    for csr in csrs:
        sample_size = csr.get('sample_size')
        if sample_size and isinstance(sample_size, (int, float)) and sample_size > 0:
            sample_sizes.append(sample_size)
    
    if sample_sizes:
        return round(sum(sample_sizes) / len(sample_sizes))
    
    return None

def calculate_average_dropout_rate(csrs: List[Dict[str, Any]]) -> Optional[float]:
    """Calculate average dropout rate"""
    dropout_rates = []
    
    for csr in csrs:
        dropout_rate = csr.get('dropout_rate')
        
        # Extract numerical value if it's a string (e.g., "15%")
        if isinstance(dropout_rate, str):
            match = re.search(r'(\d+(?:\.\d+)?)', dropout_rate)
            if match:
                dropout_rate = float(match.group(1))
        
        if dropout_rate and isinstance(dropout_rate, (int, float)) and 0 <= dropout_rate <= 100:
            dropout_rates.append(dropout_rate)
    
    if dropout_rates:
        return round(sum(dropout_rates) / len(dropout_rates), 1)
    
    return None

def get_benchmark_metrics(indication: str, phase: str) -> str:
    """Get benchmark metrics for the given indication and phase, returning a JSON string"""
    try:
        csrs = find_matching_csrs(indication, phase)
        
        if not csrs:
            # If no exact matches found, use a broader search
            broader_csrs = []
            normalized_indication = normalize_indication(indication)
            
            for filename in get_csr_files():
                csr_data = load_csr_data(filename)
                if csr_data and normalized_indication in normalize_indication(csr_data.get('indication', '')):
                    broader_csrs.append(csr_data)
            
            # If broader search found results, use them
            if broader_csrs:
                csrs = broader_csrs
        
        if not csrs:
            # Return empty results for zero matches
            return json.dumps({
                "metrics": None,
                "total_csrs": 0,
                "message": "No matches found"
            })
        
        # Extract trial IDs
        trial_ids = []
        for csr in csrs:
            trial_id = csr.get('id') or csr.get('trial_id') or csr.get('nct_id')
            if trial_id:
                trial_ids.append(str(trial_id))
        
        # Calculate metrics
        metrics = {
            "total_trials": len(csrs),
            "top_endpoints": extract_endpoints(csrs),
            "avg_duration_weeks": calculate_average_duration(csrs),
            "avg_sample_size": calculate_average_sample_size(csrs) or 100,  # Default if missing
            "avg_dropout_rate": calculate_average_dropout_rate(csrs) or 15.0,  # Default if missing
            "matched_trial_ids": trial_ids
        }
        
        return json.dumps({
            "metrics": metrics,
            "total_csrs": len(csrs),
            "message": f"Found {len(csrs)} matching trial(s)"
        })
        
    except Exception as e:
        error_message = f"Error getting benchmark metrics: {str(e)}"
        print(error_message, file=sys.stderr)
        return json.dumps({
            "error": error_message,
            "metrics": None
        })

def generate_protocol_section(section_name: str, indication: str, phase: str, endpoints: List[str], sample_size: int, dropout_rate: float) -> str:
    """Generate a specific section of the protocol based on CSR data"""
    
    if section_name == "title":
        return f"A {phase} Study to Evaluate the Safety and Efficacy of Treatment in Patients with {indication}"
    
    elif section_name == "objectives":
        primary_objectives = []
        secondary_objectives = []
        
        if endpoints and len(endpoints) > 0:
            primary_objectives.append(f"To assess the efficacy of treatment as measured by {endpoints[0]}")
            primary_objectives.append(f"To evaluate the safety and tolerability of treatment in patients with {indication}")
            
            if len(endpoints) > 1:
                for endpoint in endpoints[1:3]:  # Use next 2 endpoints as secondary
                    secondary_objectives.append(f"To evaluate {endpoint}")
            
            secondary_objectives.append("To assess the pharmacokinetic profile of the treatment")
            secondary_objectives.append("To evaluate quality of life measures during the treatment period")
        
        objectives_text = "## Study Objectives\n\n"
        objectives_text += "### Primary Objectives\n"
        for obj in primary_objectives:
            objectives_text += f"* {obj}\n"
        
        objectives_text += "\n### Secondary Objectives\n"
        for obj in secondary_objectives:
            objectives_text += f"* {obj}\n"
        
        return objectives_text
    
    elif section_name == "design":
        design_text = "## Study Design\n\n"
        
        if "1" in phase:
            design_text += f"This is a {phase}, randomized, double-blind, placebo-controlled study to evaluate the safety, tolerability, and pharmacokinetics of treatment in patients with {indication}.\n\n"
            design_text += f"Approximately {sample_size} patients will be enrolled. The study will include a screening period, a treatment period, and a follow-up period.\n"
        elif "2" in phase:
            design_text += f"This is a {phase}, randomized, double-blind, placebo-controlled, parallel-group, multi-center study to evaluate the efficacy and safety of treatment in patients with {indication}.\n\n"
            design_text += f"Approximately {sample_size} patients will be randomized in a 1:1 ratio to receive either treatment or placebo for 12 weeks.\n"
        elif "3" in phase:
            design_text += f"This is a {phase}, randomized, double-blind, placebo-controlled, parallel-group, multi-center, international study to evaluate the efficacy and safety of treatment in patients with {indication}.\n\n"
            design_text += f"Approximately {sample_size} patients will be randomized in a 1:1 ratio to receive either treatment or placebo for 24 weeks. The study will include a screening period of up to 4 weeks, a 24-week treatment period, and a 4-week follow-up period.\n"
        else:
            design_text += f"This is a {phase}, randomized, controlled study to evaluate the efficacy and safety of treatment in patients with {indication}.\n\n"
            design_text += f"Approximately {sample_size} patients will be enrolled. The study duration will be determined based on the specific endpoints being evaluated.\n"
        
        return design_text
    
    elif section_name == "population":
        population_text = "## Study Population\n\n"
        population_text += "### Key Inclusion Criteria\n"
        population_text += f"* Male or female patients aged 18 years or older\n"
        population_text += f"* Confirmed diagnosis of {indication}\n"
        population_text += f"* Stable disease for at least 4 weeks prior to screening\n"
        population_text += f"* Eastern Cooperative Oncology Group (ECOG) performance status of 0-1\n"
        population_text += f"* Adequate organ function\n\n"
        
        population_text += "### Key Exclusion Criteria\n"
        population_text += f"* Prior treatment with [specific treatments] within 4 weeks before randomization\n"
        population_text += f"* History of severe hypersensitivity reactions to [relevant compounds]\n"
        population_text += f"* Pregnant or breastfeeding women\n"
        population_text += f"* Any unstable medical condition that would interfere with study participation\n"
        
        return population_text
    
    elif section_name == "endpoints":
        endpoints_text = "## Study Endpoints\n\n"
        
        endpoints_text += "### Primary Endpoint\n"
        if endpoints and len(endpoints) > 0:
            endpoints_text += f"* {endpoints[0]}\n\n"
        else:
            endpoints_text += f"* Change from baseline in [primary efficacy measure] at Week 24\n\n"
        
        endpoints_text += "### Secondary Endpoints\n"
        if endpoints and len(endpoints) > 1:
            for endpoint in endpoints[1:4]:  # Use next 3 endpoints as secondary
                endpoints_text += f"* {endpoint}\n"
        else:
            endpoints_text += f"* Safety and tolerability as assessed by adverse events, laboratory values, vital signs, and ECGs\n"
            endpoints_text += f"* Change from baseline in [secondary efficacy measure] at Week 24\n"
            endpoints_text += f"* Time to [relevant clinical event]\n"
        
        return endpoints_text
    
    elif section_name == "statistical":
        statistical_text = "## Statistical Considerations\n\n"
        statistical_text += "### Sample Size Justification\n"
        statistical_text += f"Based on previous studies in {indication}, a sample size of {sample_size} patients "
        statistical_text += f"(approximately {int(sample_size/2)} per treatment group) will provide 90% power to detect a difference "
        statistical_text += f"of [effect size] in the primary endpoint, assuming a standard deviation of [value], using a two-sided significance level of 0.05.\n\n"
        
        statistical_text += f"The sample size accounts for an expected dropout rate of approximately {dropout_rate}%.\n\n"
        
        statistical_text += "### Analysis Populations\n"
        statistical_text += "* **Intent-to-Treat (ITT) Population:** All randomized patients\n"
        statistical_text += "* **Per-Protocol (PP) Population:** All ITT patients who complete the study without major protocol deviations\n"
        statistical_text += "* **Safety Population:** All patients who receive at least one dose of study treatment\n\n"
        
        statistical_text += "### Primary Analysis\n"
        statistical_text += "The primary efficacy analysis will be performed on the ITT population. "
        statistical_text += "A [appropriate statistical method] will be used to analyze the primary endpoint, with treatment as a fixed effect "
        statistical_text += "and [relevant covariates] as covariates. Missing data will be handled using [appropriate method].\n"
        
        return statistical_text
    
    return f"Section {section_name} not implemented"

def generate_protocol_draft(args_json: str) -> str:
    """Generate a protocol draft based on CSR data and parameters"""
    try:
        args = json.loads(args_json)
        
        indication = args.get('indication', '')
        phase = args.get('phase', '')
        top_endpoints = args.get('top_endpoints', [])
        sample_size = args.get('sample_size', 100)
        dropout_rate = args.get('dropout_rate', 15.0)
        
        # Generate protocol sections
        protocol_id = f"{normalize_indication(indication)}_{normalize_phase(phase)}_{datetime.now().strftime('%Y%m%d')}"
        
        title = generate_protocol_section("title", indication, phase, top_endpoints, sample_size, dropout_rate)
        objectives = generate_protocol_section("objectives", indication, phase, top_endpoints, sample_size, dropout_rate)
        design = generate_protocol_section("design", indication, phase, top_endpoints, sample_size, dropout_rate)
        population = generate_protocol_section("population", indication, phase, top_endpoints, sample_size, dropout_rate)
        endpoints = generate_protocol_section("endpoints", indication, phase, top_endpoints, sample_size, dropout_rate)
        statistical = generate_protocol_section("statistical", indication, phase, top_endpoints, sample_size, dropout_rate)
        
        # Combine all sections into a complete protocol draft
        protocol_draft = f"# {title}\n\n"
        protocol_draft += f"**Protocol ID:** {protocol_id}\n"
        protocol_draft += f"**Date:** {datetime.now().strftime('%d %B %Y')}\n\n"
        
        protocol_draft += "## Synopsis\n\n"
        protocol_draft += f"**Indication:** {indication}\n"
        protocol_draft += f"**Phase:** {phase}\n"
        protocol_draft += f"**Study Design:** Randomized, Double-Blind, Placebo-Controlled Study\n"
        protocol_draft += f"**Estimated Enrollment:** {sample_size} patients\n"
        protocol_draft += f"**Primary Endpoint:** {top_endpoints[0] if top_endpoints else 'To be determined'}\n\n"
        
        protocol_draft += objectives + "\n\n"
        protocol_draft += design + "\n\n"
        protocol_draft += population + "\n\n"
        protocol_draft += endpoints + "\n\n"
        protocol_draft += statistical + "\n\n"
        
        protocol_draft += "## Ethical Considerations\n\n"
        protocol_draft += "This study will be conducted in accordance with the principles of the Declaration of Helsinki and Good Clinical Practice guidelines. "
        protocol_draft += "The study protocol and informed consent form must be approved by the Institutional Review Board/Independent Ethics Committee before study initiation.\n\n"
        
        protocol_draft += "## References\n\n"
        protocol_draft += "1. [Reference 1]\n"
        protocol_draft += "2. [Reference 2]\n"
        protocol_draft += "3. [Reference 3]\n"
        
        return json.dumps({
            "protocol_draft": protocol_draft,
            "protocol_id": protocol_id,
            "success": True
        })
        
    except Exception as e:
        error_message = f"Error generating protocol draft: {str(e)}"
        print(error_message, file=sys.stderr)
        return json.dumps({
            "error": error_message,
            "success": False
        })

# CLI interface
if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "benchmark" and len(sys.argv) >= 4:
            print(get_benchmark_metrics(sys.argv[2], sys.argv[3]))
        
        elif command == "generate" and len(sys.argv) >= 3:
            print(generate_protocol_draft(sys.argv[2]))
        
        else:
            print(json.dumps({
                "error": "Invalid command or arguments",
                "usage": "python csr_benchmark_api.py benchmark <indication> <phase> OR python csr_benchmark_api.py generate <args_json>"
            }))
    else:
        # Print usage information
        print(json.dumps({
            "usage": "python csr_benchmark_api.py benchmark <indication> <phase> OR python csr_benchmark_api.py generate <args_json>"
        }))