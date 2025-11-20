from fastapi import APIRouter, Body
import os
import sys
import json
from datetime import datetime
import time

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Import the report_pdf_generator module
from report_pdf_generator import generate_intelligence_report

router = APIRouter()

# Ensure reports directory exists
os.makedirs("data/reports", exist_ok=True)

@router.post("/api/export/intelligence-report")
def export_intelligence_report(
    protocol_id: str = Body(...),
    protocol_data: dict = Body(...),
    prediction: float = Body(...),
    benchmarks: dict = Body(...)
):
    """
    Generate a full protocol intelligence report PDF and return the download URL
    """
    try:
        # Generate unique timestamp
        timestamp = int(time.time())
        
        # Output file path
        output_path = f"data/reports/{protocol_id}_intelligence_{timestamp}.pdf"
        
        # Generate the report
        report_path = generate_intelligence_report(
            protocol_data=protocol_data,
            benchmarks=benchmarks,
            prediction=prediction,
            protocol_id=protocol_id,
            output_path=output_path
        )
        
        # Return the download URL for the generated report
        return {"download_url": f"/{report_path}", "message": "Report generated successfully"}
    
    except Exception as e:
        return {"error": str(e), "message": "Failed to generate report"}

@router.post("/api/dossier/save-intelligence-report")
def save_to_dossier(protocol_id: str = Body(...), report_data: dict = Body(...), username: str = Body("default")):
    """
    Save protocol intelligence report data to dossier with user-specific access
    """
    timestamp = datetime.utcnow().isoformat()
    dossier_path = "data/dossiers"
    os.makedirs(dossier_path, exist_ok=True)
    
    # Include username in filename for per-user dossiers
    path = f"{dossier_path}/{username}_{protocol_id}_dossier.json"

    try:
        # Load existing or create new
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                dossier = json.load(f)
        else:
            dossier = {"protocol_id": protocol_id, "username": username, "reports": []}

        # Add the new report with timestamp
        dossier["reports"].append({
            "created_at": timestamp,
            "data": report_data
        })

        # Save the updated dossier
        with open(path, "w", encoding="utf-8") as f:
            json.dump(dossier, f, indent=2)

        return {"message": "Report added to dossier", "path": path}

    except Exception as e:
        return {"error": str(e), "message": "Failed to save to dossier"}

@router.get("/api/dossier/view/{username}/{protocol_id}")
def view_dossier(username: str, protocol_id: str):
    """
    Retrieve all intelligence reports for a specific protocol ID and user
    """
    dossier_path = "data/dossiers"
    path = f"{dossier_path}/{username}_{protocol_id}_dossier.json"
    
    if not os.path.exists(path):
        return {"message": "No dossier found for this protocol", "reports": []}

    try:
        with open(path, "r", encoding="utf-8") as f:
            dossier = json.load(f)
        
        return {"protocol_id": protocol_id, "username": username, "reports": dossier["reports"]}
    
    except Exception as e:
        return {"error": str(e), "message": "Failed to load dossier"}