import json
import os
import sys
import argparse
from typing import List, Optional, Tuple, Dict, Any

# Path to processed CSR files
CSR_PATH = "data/processed_csrs"

def get_csr_metrics(indication: str, phase: str) -> Dict[str, Any]:
    """
    Extract metrics from CSR files that match the given indication and phase.
    
    Args:
        indication: Medical indication to filter by
        phase: Trial phase to filter by
        
    Returns:
        Dictionary with benchmark metrics
    """
    matches = []
    
    # Ensure the directory exists
    if not os.path.exists(CSR_PATH):
        os.makedirs(CSR_PATH, exist_ok=True)
        return {"message": "No CSR data available", "metrics": {}}
    
    # Look for matching CSR files
    for fname in os.listdir(CSR_PATH):
        if not fname.endswith(".json"):
            continue
            
        try:
            with open(os.path.join(CSR_PATH, fname), 'r') as f:
                csr = json.load(f)
                
            # Check if this CSR matches our criteria
            csr_indication = csr.get("indication", "")
            csr_phase = csr.get("phase", "")
            
            if (indication.lower() in csr_indication.lower() and 
                phase.lower() in csr_phase.lower()):
                matches.append(csr)
        except Exception as e:
            print(f"Error reading CSR file {fname}: {e}")
            continue
    
    if not matches:
        return {"message": "No matches found", "metrics": {}}

    # Extract metrics
    endpoint_counts = {}
    durations = []
    sample_sizes = []
    dropouts = []
    trial_ids = []

    for csr in matches:
        # Extract endpoints
        if "primary_endpoints" in csr and isinstance(csr["primary_endpoints"], list):
            for ep in csr["primary_endpoints"]:
                endpoint_counts[ep] = endpoint_counts.get(ep, 0) + 1
        elif "primaryObjective" in csr and csr["primaryObjective"]:
            ep = csr["primaryObjective"]
            endpoint_counts[ep] = endpoint_counts.get(ep, 0) + 1
            
        # Extract duration
        if "duration_weeks" in csr and csr["duration_weeks"]:
            try:
                durations.append(float(csr["duration_weeks"]))
            except (ValueError, TypeError):
                pass
        elif "duration" in csr and csr["duration"]:
            try:
                # Try to extract numeric duration
                duration_text = str(csr["duration"])
                # Extract numbers from duration text (e.g., "24 weeks" -> 24)
                import re
                duration_match = re.search(r'(\d+)', duration_text)
                if duration_match:
                    durations.append(float(duration_match.group(1)))
            except Exception:
                pass
                
        # Extract sample size
        if "sample_size" in csr and csr["sample_size"]:
            try:
                sample_sizes.append(float(csr["sample_size"]))
            except (ValueError, TypeError):
                pass
        elif "sampleSize" in csr and csr["sampleSize"]:
            try:
                # Try to extract numeric sample size
                size_text = str(csr["sampleSize"])
                # Extract numbers from sample size text
                import re
                size_match = re.search(r'(\d+)', size_text)
                if size_match:
                    sample_sizes.append(float(size_match.group(1)))
            except Exception:
                pass
                
        # Extract dropout rate
        if "dropout_rate" in csr and csr["dropout_rate"]:
            try:
                dropouts.append(float(csr["dropout_rate"]))
            except (ValueError, TypeError):
                pass
        elif "dropoutRate" in csr and csr["dropoutRate"]:
            try:
                # Try to extract numeric dropout rate
                dropout_text = str(csr["dropoutRate"])
                # Extract numbers from dropout rate text
                import re
                dropout_match = re.search(r'(\d+(?:\.\d+)?)', dropout_text)
                if dropout_match:
                    dropouts.append(float(dropout_match.group(1)))
            except Exception:
                pass
                
        # Extract trial ID
        if "nct_id" in csr and csr["nct_id"]:
            trial_ids.append(csr["nct_id"])
        elif "id" in csr and csr["id"]:
            trial_ids.append(str(csr["id"]))

    def avg(lst):
        return round(float(sum(lst)) / len(lst), 2) if lst else None

    # Compile metrics
    metrics = {
        "total_trials": len(matches),
        "top_endpoints": sorted(endpoint_counts.items(), key=lambda x: -x[1])[:5],
        "avg_duration_weeks": avg(durations),
        "avg_sample_size": avg(sample_sizes),
        "avg_dropout_rate": avg(dropouts),
        "matched_trial_ids": trial_ids[:10]  # Limit to 10 IDs
    }

    return {"message": "Success", "metrics": metrics}


def generate_smart_protocol_draft(
    indication: str, 
    phase: str, 
    top_endpoints: List[str], 
    sample_size: float, 
    dropout: float
) -> Dict[str, str]:
    """
    Generate a smart protocol draft based on CSR benchmark metrics.
    
    Args:
        indication: Medical indication
        phase: Trial phase
        top_endpoints: List of top endpoints
        sample_size: Average sample size
        dropout: Average dropout rate
        
    Returns:
        Dictionary with protocol draft
    """
    endpoint = top_endpoints[0] if top_endpoints else "TBD"
    
    # Determine study design based on phase
    design = "single-arm, open-label"
    if phase.lower() in ["phase 2", "phase ii", "phase 3", "phase iii"]:
        design = "randomized, double-blind, placebo-controlled"
    elif phase.lower() in ["phase 4", "phase iv"]:
        design = "randomized, open-label"
        
    # Estimate duration based on indication
    duration = 24  # default weeks
    if any(term in indication.lower() for term in ["cancer", "oncology", "tumor"]):
        duration = 52
    elif any(term in indication.lower() for term in ["chronic", "alzheimer", "diabetes"]):
        duration = 48
    elif any(term in indication.lower() for term in ["acute", "infection"]):
        duration = 12
        
    draft = f"""
Protocol Title: {indication} Study – {phase}

Primary Endpoint:
- {endpoint}

Study Design:
- {phase}, {design}
- Sample Size: {int(sample_size) if sample_size else 'TBD'} per arm
- Dropout Assumption: {dropout}%
- Duration: {duration} weeks (adjustable)

Arms:
- Treatment A (Active)
- Placebo

Population:
- Adults with {indication.lower()} meeting standard inclusion criteria

Justification:
- Endpoint based on CSR precedent (highest frequency in matched trials)
- Sample size derived from CSR analysis
- Duration based on indication type and standard endpoints
"""
    return {"protocol_draft": draft.strip()}


def generate_bundle(
    indication: str,
    phase: str,
    protocol_draft: str,
    strategic_summary: str,
    sap_section: str
) -> Dict[str, str]:
    """
    Generate a combined bundle with protocol draft, strategic summary, and SAP
    
    Args:
        indication: Medical indication
        phase: Trial phase
        protocol_draft: Draft protocol text
        strategic_summary: Strategic intelligence summary
        sap_section: Statistical analysis plan section
        
    Returns:
        Dictionary with paths to generated files
    """
    from fpdf import FPDF
    import time
    import os
    import zipfile
    
    # Create output directory if it doesn't exist
    exports_dir = "data/exports"
    if not os.path.exists(exports_dir):
        os.makedirs(exports_dir, exist_ok=True)
    
    # Clean text to remove unsupported Unicode characters
    def clean(text):
        return text.replace("–", "-").replace("'", "'").replace(""", '"').replace(""", '"').replace("≥", ">=")
    
    # Create PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 14)
    pdf.cell(0, 10, f"TrialSage Design Bundle: {indication} {phase}", ln=True, align="C")
    pdf.ln(10)
    
    def add_section(title, content):
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 10, clean(title), ln=True)
        pdf.ln(1)
        pdf.set_font("Arial", "", 11)
        for line in clean(content).split('\n'):
            pdf.multi_cell(0, 8, line)
        pdf.ln(3)
    
    add_section("Protocol Draft", protocol_draft)
    add_section("Strategic Intelligence Summary", strategic_summary)
    add_section("Statistical Analysis Plan (SAP)", sap_section)
    
    timestamp = int(time.time())
    pdf_filename = f"TrialSage_Design_Bundle_{timestamp}.pdf"
    pdf_path = os.path.join(exports_dir, pdf_filename)
    pdf.output(pdf_path)
    
    # Create ZIP archive with individual text files
    zip_filename = f"TrialSage_Design_Bundle_{timestamp}.zip"
    zip_path = os.path.join(exports_dir, zip_filename)
    
    with zipfile.ZipFile(zip_path, "w") as zipf:
        # Add the PDF file
        zipf.write(pdf_path, os.path.basename(pdf_path))
        
        # Add individual text files
        proto_txt = os.path.join(exports_dir, f"protocol_draft_{timestamp}.txt")
        strat_txt = os.path.join(exports_dir, f"strategic_summary_{timestamp}.txt")
        sap_txt = os.path.join(exports_dir, f"sap_{timestamp}.txt")
        
        with open(proto_txt, "w") as f:
            f.write(protocol_draft)
        with open(strat_txt, "w") as f:
            f.write(strategic_summary)
        with open(sap_txt, "w") as f:
            f.write(sap_section)
            
        zipf.write(proto_txt, os.path.basename(proto_txt))
        zipf.write(strat_txt, os.path.basename(strat_txt))
        zipf.write(sap_txt, os.path.basename(sap_txt))
        
        # Clean up temporary text files
        os.remove(proto_txt)
        os.remove(strat_txt)
        os.remove(sap_txt)
    
    return {
        "pdf_url": f"/download/{pdf_filename}",
        "zip_url": f"/download/{zip_filename}"
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CSR Benchmark API")
    parser.add_argument("--action", choices=["get_metrics", "generate_smart_protocol", "generate_bundle"], required=True)
    parser.add_argument("--indication", type=str, help="Medical indication")
    parser.add_argument("--phase", type=str, help="Trial phase")
    parser.add_argument("--top_endpoints", type=str, help="Top endpoints (JSON string array)")
    parser.add_argument("--sample_size", type=float, help="Sample size")
    parser.add_argument("--dropout", type=float, help="Dropout rate percentage")
    parser.add_argument("--protocol_draft", type=str, help="Protocol draft text")
    parser.add_argument("--strategic_summary", type=str, help="Strategic summary text")
    parser.add_argument("--sap_section", type=str, help="SAP section text")
    
    args = parser.parse_args()
    
    if args.action == "get_metrics":
        if not args.indication or not args.phase:
            sys.stderr.write("Error: --indication and --phase are required for get_metrics\n")
            sys.exit(1)
        
        result = get_csr_metrics(args.indication, args.phase)
        print(json.dumps(result))
        
    elif args.action == "generate_smart_protocol":
        if not args.indication or not args.phase:
            sys.stderr.write("Error: --indication and --phase are required for generate_smart_protocol\n")
            sys.exit(1)
            
        top_endpoints = []
        if args.top_endpoints:
            try:
                top_endpoints = json.loads(args.top_endpoints)
            except json.JSONDecodeError:
                sys.stderr.write("Error: --top_endpoints must be a valid JSON array\n")
                sys.exit(1)
                
        result = generate_smart_protocol_draft(
            args.indication,
            args.phase,
            top_endpoints,
            args.sample_size or 0,
            args.dropout or 0
        )
        print(json.dumps(result))
        
    elif args.action == "generate_bundle":
        if not all([args.indication, args.phase, args.protocol_draft, args.strategic_summary, args.sap_section]):
            sys.stderr.write("Error: --indication, --phase, --protocol_draft, --strategic_summary, and --sap_section are required for generate_bundle\n")
            sys.exit(1)
            
        result = generate_bundle(
            args.indication,
            args.phase,
            args.protocol_draft,
            args.strategic_summary,
            args.sap_section
        )
        print(json.dumps(result))
    
    else:
        sys.stderr.write(f"Error: Unknown action '{args.action}'\n")
        sys.exit(1)