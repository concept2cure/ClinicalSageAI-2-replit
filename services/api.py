from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from uuid import uuid4
from services.job_store import get_store
from services.celery_app import generate_docx_task
import tempfile
from pathlib import Path
import json
import os

app = FastAPI()
store = get_store()


class GenerateRequest(BaseModel):
    data: dict
    template_path: str | None = None


@app.post("/api/ectd/generate", status_code=202)
def generate(req: GenerateRequest):
    job_id = uuid4().hex
    # write input json to temp file
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"ectd_{job_id}_"))
    data_path = tmp_dir / "input.json"
    data_path.write_text(json.dumps(req.data), encoding="utf-8")

    # pre-seed job store
    store.set(job_id, {"status": "PENDING", "input": str(data_path)})

    # enqueue celery task
    # pass template_path if present
    generate_docx_task.apply_async(args=[job_id, str(data_path), req.template_path])
    return {"job_id": job_id}


@app.get("/api/ectd/status/{job_id}")
def job_status(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    # augment with a download URL when completed
    if job.get("status") == "COMPLETED":
        job = dict(job)
        job["download_url"] = f"/api/ectd/download/{job_id}"
    return job


@app.get("/api/ectd/download/{job_id}")
def download_generated(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.get("status") != "COMPLETED":
        raise HTTPException(status_code=404, detail="document not ready")
    output_path = job.get("output")
    if not output_path:
        raise HTTPException(status_code=404, detail="no output recorded")
    p = Path(output_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="output file not found")
    return FileResponse(path=str(p), filename=p.name, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")