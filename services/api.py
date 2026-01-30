from fastapi import FastAPI, HTTPException
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
    return job
