import os
import time
import requests
import pytest
from pathlib import Path

CI = bool(os.getenv("CI"))
DOCKER_SOCK = Path("/var/run/docker.sock").exists()

pytestmark = pytest.mark.skipif(not (CI or DOCKER_SOCK), reason="E2E requires Docker or CI")

BASE = os.getenv("E2E_API_URL", "http://localhost:8000")


def test_e2e_async_flow():
    # Enqueue job
    body = {"data": {"title": "E2E Test"}, "template_path": None}
    r = requests.post(f"{BASE}/api/ectd/generate", json=body, timeout=5)
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Poll for completion (20s timeout)
    status = None
    for _ in range(20):
        r = requests.get(f"{BASE}/api/ectd/status/{job_id}", timeout=5)
        assert r.status_code == 200
        status = r.json()
        if status.get("status") == "COMPLETED":
            break
        time.sleep(1)

    assert status is not None and status.get("status") == "COMPLETED", f"Job not completed: {status}"

    # Download file
    dl = requests.get(f"{BASE}/api/ectd/download/{job_id}", timeout=10)
    assert dl.status_code == 200
    content = dl.content
    # DOCX is a ZIP file -> starts with PK
    assert content[:2] == b"PK"

    # Save artifact for CI artifact upload
    out_dir = Path("services/test_outputs")
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"e2e_{job_id}.docx"
    dest.write_bytes(content)
