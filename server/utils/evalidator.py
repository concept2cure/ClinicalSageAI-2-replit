"""evalidator.py – wrapper for Lorenz eValidator CLI
Assumes Docker image 'evalidator:latest' contains v23.1 CLI
Usage: validate_package(sequence_folder) -> dict (errors, warnings)
"""
import os, subprocess, json, tempfile, pathlib
from datetime import datetime

def validate_package(seq_folder: str, region="FDA") -> dict:
    """
    Validate an eCTD sequence package using the appropriate regional profile
    
    Args:
        seq_folder: Path to the sequence folder
        region: Regulatory authority (FDA, EMA, PMDA, Health Canada)
    
    Returns:
        Dictionary with validation results
    """
    seq_folder = os.path.abspath(seq_folder)
    if not os.path.isdir(seq_folder):
        raise FileNotFoundError(seq_folder)
        
    # Map region to validator profile
    profile_map = {
        "FDA": "FDA_eCTD_3.2.2",
        "EMA": "EU_eCTD_3.2.2", 
        "PMDA": "JP_eCTD_3.2.2",
        "Health Canada": "CA_eCTD_3.2.2"
    }
    
    # Get profile or default to FDA
    profile = profile_map.get(region, "FDA_eCTD_3.2.2")

    with tempfile.TemporaryDirectory() as tmp:
        report_path = os.path.join(tmp, "report.json")
        cmd = [
            "docker", "run", "--rm",
            "-v", f"{seq_folder}:/data:ro",
            "-v", f"{tmp}:/out",
            "evalidator:latest",
            "--input", "/data",
            "--output", "/out/report.json",
            "--profile", profile
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"eValidator failed: {proc.stderr[:300]}")
        if not os.path.exists(report_path):
            raise FileNotFoundError("eValidator report not generated")
        report = json.load(open(report_path))

    errors = [i for i in report.get("issues", []) if i["severity"].lower()=="error"]
    warnings = [i for i in report.get("issues", []) if i["severity"].lower()=="warning"]
    summary = {
        "timestamp": datetime.utcnow().isoformat()+"Z",
        "errors": errors,
        "warnings": warnings,
        "error_count": len(errors),
        "warning_count": len(warnings),
    }
    # Persist summary alongside sequence
    out_json = pathlib.Path(seq_folder)/"evalidator_report.json"
    out_json.write_text(json.dumps(summary, indent=2))
    return summary