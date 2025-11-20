"""
Step 2 (Backend): Production-ready FastAPI endpoint for TrialSage RegIntel Validator™
- Enforces multitenant isolation via JWT-provided tenant_id
- Accepts multiple dataset files via multipart upload
- Invokes external validation engine CLI (REGINTEL_ENGINE_PATH) synchronously
- Saves JSON report and Define.xml output per tenant/run
- Returns parsed errors array, plus URLs for report and Define.xml
"""

import os
import uuid
import json
import subprocess
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from app.dependencies import get_current_user        # User model with tenant_id
from app.config import settings                     # Config with paths
# from app.database import db_session                # If you wish to record run metadata

router = APIRouter()


@router.post("/api/validate")
async def validate_datasets(
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_user),
):
    tenant_id = current_user.tenant_id
    run_id = str(uuid.uuid4())

    # Step 1: Create tenant-specific upload directory
    upload_dir = os.path.join(settings.UPLOAD_DIR, tenant_id, run_id)
    os.makedirs(upload_dir, exist_ok=True)

    # Step 2: Persist uploaded files
    file_paths = []
    for file in files:
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        file_paths.append(file_path)

    # Step 3: Prepare output paths
    report_dir = os.path.join(settings.VALIDATION_REPORT_DIR, tenant_id)
    define_dir = os.path.join(settings.DEFINE_XML_DIR, tenant_id)
    os.makedirs(report_dir, exist_ok=True)
    os.makedirs(define_dir, exist_ok=True)

    report_path = os.path.join(report_dir, f"{run_id}.json")
    define_path = os.path.join(define_dir, f"{run_id}.xml")

    # Step 4: Call external RegIntel CLI
    cli = settings.REGINTEL_ENGINE_PATH
    cmd = [
        cli,
        "--json-output", report_path,
        "--define-output", define_path,
        *file_paths
    ]

    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Validation engine failed: {e}"
        )

    # Step 5: Load JSON report
    try:
        with open(report_path, "r") as f:
            report_data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to parse validation report")

    # Step 6: Build secure, tenant-scoped URLs
    report_url = f"/static/validation/{tenant_id}/{run_id}.json"
    define_xml_url = f"/static/define/{tenant_id}/{run_id}.xml"

    # (Optional) Step 7: Persist run metadata to database
    # run_record = ValidationRun(
    #     id=run_id,
    #     tenant_id=tenant_id,
    #     status="completed",
    #     report_path=report_path,
    #     define_path=define_path
    # )
    # db_session.add(run_record)
    # db_session.commit()

    # Step 8: Return structured response
    return JSONResponse({
        "errors": report_data.get("errors", []),
        "reportUrl": report_url,
        "defineXmlUrl": define_xml_url
    })