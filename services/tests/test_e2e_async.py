import os
import time
import requests
import pytest
from pathlib import Path

CI = bool(os.getenv("CI"))
DOCKER_SOCK = Path("/var/run/docker.sock").exists()

pytestmark = pytest.mark.skipif(not (CI or DOCKER_SOCK), reason="E2E requires Docker or CI")

BASE = os.getenv("E2E_API_URL", "http://localhost:8000")


def _auth_headers():
    # The generation service requires a shared-secret bearer token (the service
    # fails closed without it). Tests must present the same INTERNAL_SERVICE_TOKEN
    # the service is configured with.
    token = os.getenv("INTERNAL_SERVICE_TOKEN", "")
    return {"Authorization": f"Bearer {token}"} if token else {}


def test_e2e_async_flow():
    # Enqueue job. Provide real source tables: the generator now refuses to
    # fabricate clinical efficacy data when none is supplied (21 CFR Part 11),
    # so the request body must carry verified source data.
    body = {
        "data": {
            "title": "E2E Test",
            "tables": [
                {
                    "name": "primary_endpoints",
                    "headers": ["Endpoint", "Treatment", "Control"],
                    "rows": [["E2E synthetic endpoint", "1.0", "2.0"]],
                }
            ],
        },
        "template_path": None,
    }
    r = requests.post(f"{BASE}/api/ectd/generate", json=body, headers=_auth_headers(), timeout=5)
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Poll for completion (60s timeout to tolerate CI cold starts)
    status = None
    for _ in range(60):
        r = requests.get(f"{BASE}/api/ectd/status/{job_id}", headers=_auth_headers(), timeout=5)
        assert r.status_code == 200
        status = r.json()
        if status.get("status") == "COMPLETED":
            break
        time.sleep(1)

    assert status is not None and status.get("status") == "COMPLETED", f"Job not completed: {status}"

    # Download file
    dl = requests.get(f"{BASE}/api/ectd/download/{job_id}", headers=_auth_headers(), timeout=10)
    assert dl.status_code == 200
    content = dl.content
    # DOCX is a ZIP file -> starts with PK
    assert content[:2] == b"PK"

    # Save artifact for CI artifact upload
    out_dir = Path("services/test_outputs")
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"e2e_{job_id}.docx"
    dest.write_bytes(content)


def test_smoke_task_writes_shared_file():
    body = {"content": "smoke-check"}
    r = requests.post(f"{BASE}/api/ectd/smoke", json=body, headers=_auth_headers(), timeout=5)
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Poll for completion (30s timeout should be sufficient)
    status = None
    for _ in range(30):
        r = requests.get(f"{BASE}/api/ectd/status/{job_id}", headers=_auth_headers(), timeout=5)
        assert r.status_code == 200
        status = r.json()
        if status.get("status") == "COMPLETED":
            break
        time.sleep(1)

    assert status is not None and status.get("status") == "COMPLETED", f"Smoke job not completed: {status}"

    # The worker records an absolute container path under OUTPUT_DIR_BASE
    # (/shared_data/...). docker-compose.e2e.yml binds the host /shared_data to
    # the container /shared_data at the SAME absolute path (so the worker's
    # sibling-container -v mounts resolve on the host daemon), which means the
    # recorded path is also the host-visible path. Assert on it directly.
    output = status.get("output")
    assert output, "No output path recorded by smoke task"
    p = Path(output)
    assert p.exists(), f"Smoke file not found at {p}"

    # Save for artifact upload
    out_dir = Path("services/test_outputs")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"smoke_{job_id}.txt").write_text(p.read_text(), encoding="utf-8")
