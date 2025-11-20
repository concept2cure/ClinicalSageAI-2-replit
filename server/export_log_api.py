from fastapi import APIRouter, Body
import json
import os
from datetime import datetime

router = APIRouter()
EXPORT_LOG_PATH = "data/logs/export_actions.jsonl"

# Ensure the logs directory exists
os.makedirs("data/logs", exist_ok=True)

@router.post("/api/log/export")
def log_export(user_id: str = Body(...), protocol_id: str = Body(...), report_type: str = Body(...)):
    """
    Log an export action for audit and analytics purposes
    """
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": user_id,
        "protocol_id": protocol_id,
        "report_type": report_type
    }
    
    with open(EXPORT_LOG_PATH, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
    
    return {"message": "Export logged successfully"}

@router.get("/api/log/exports")
def get_export_logs():
    """
    Retrieve all export logs
    """
    if not os.path.exists(EXPORT_LOG_PATH):
        return []
        
    with open(EXPORT_LOG_PATH) as f:
        return [json.loads(line) for line in f.readlines()]