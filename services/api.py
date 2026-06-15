from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from uuid import uuid4
from services.job_store import get_store
from services.celery_app import generate_docx_task, smoke_test_task
import tempfile
from pathlib import Path
import json
import os
import re
import hmac

app = FastAPI()
store = get_store()

# --- Authentication: shared-secret bearer token (internal service-to-service) ---
INTERNAL_SERVICE_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN")


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    """Reject requests lacking a valid `Authorization: Bearer <token>` header.

    Fails closed: if INTERNAL_SERVICE_TOKEN is unset, every protected route is
    rejected (503) so the service cannot run unauthenticated in production.
    """
    if not INTERNAL_SERVICE_TOKEN:
        # Misconfiguration -> deny all rather than allow all.
        raise HTTPException(
            status_code=503,
            detail="service not configured: INTERNAL_SERVICE_TOKEN is unset",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    presented = authorization[len("Bearer "):].strip()
    # Constant-time comparison to avoid token-length/timing leaks.
    if not hmac.compare_digest(presented, INTERNAL_SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="invalid bearer token")


# --- template_path validation: confine to an allowlisted base directory ---
# Allow overriding the templates root via env; default to <repo>/services/templates.
TEMPLATE_BASE_DIR = os.path.realpath(
    os.environ.get(
        "ECTD_TEMPLATE_BASE_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates"),
    )
)


def validate_template_path(template_path: str | None) -> str | None:
    """Confine `template_path` to TEMPLATE_BASE_DIR.

    Rejects absolute paths that escape the base and any traversal (`..`),
    using realpath + containment check. Returns the resolved path or None.
    """
    if template_path is None:
        return None
    if not isinstance(template_path, str) or not template_path.strip():
        raise HTTPException(status_code=400, detail="invalid template_path")
    candidate = os.path.realpath(os.path.join(TEMPLATE_BASE_DIR, template_path))
    base_with_sep = TEMPLATE_BASE_DIR + os.sep
    if candidate != TEMPLATE_BASE_DIR and not candidate.startswith(base_with_sep):
        raise HTTPException(
            status_code=400,
            detail="template_path escapes the allowed template directory",
        )
    return candidate


# --- job_id format validation: uuid4().hex => 32 lowercase hex chars ---
_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def validate_job_id(job_id: str) -> str:
    """Validate job_id format to stop path/enumeration abuse.

    TODO(GA): scope job_id to caller tenant once identity is threaded.
    Format validation alone does not prevent cross-tenant access by a caller
    who learns another tenant's job_id.
    """
    if not _JOB_ID_RE.match(job_id or ""):
        raise HTTPException(status_code=400, detail="invalid job_id")
    return job_id


class GenerateRequest(BaseModel):
    data: dict
    template_path: str | None = None


@app.post("/api/ectd/generate", status_code=202)
def generate(req: GenerateRequest, _: None = Depends(require_service_token)):
    # Confine attacker-controlled template_path to the allowlisted base dir.
    safe_template_path = validate_template_path(req.template_path)

    job_id = uuid4().hex
    # write input json to temp file
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"ectd_{job_id}_"))
    data_path = tmp_dir / "input.json"
    data_path.write_text(json.dumps(req.data), encoding="utf-8")

    # pre-seed job store
    store.set(job_id, {"status": "PENDING", "input": str(data_path)})

    # enqueue celery task
    # pass template_path if present
    generate_docx_task.apply_async(args=[job_id, str(data_path), safe_template_path])
    return {"job_id": job_id}


class SmokeRequest(BaseModel):
    content: str


@app.post("/api/ectd/smoke", status_code=202)
def smoke(req: SmokeRequest, _: None = Depends(require_service_token)):
    job_id = uuid4().hex
    store.set(job_id, {"status": "PENDING", "input": "smoke"})
    smoke_test_task.apply_async(args=[job_id, req.content])
    return {"job_id": job_id}


@app.get("/api/ectd/status/{job_id}")
def job_status(job_id: str, _: None = Depends(require_service_token)):
    validate_job_id(job_id)
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    # augment with a download URL when completed
    if job.get("status") == "COMPLETED":
        job = dict(job)
        job["download_url"] = f"/api/ectd/download/{job_id}"
    return job


@app.get("/api/ectd/download/{job_id}")
def download_generated(job_id: str, _: None = Depends(require_service_token)):
    validate_job_id(job_id)
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