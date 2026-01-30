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

    # Poll for completion (60s timeout to tolerate CI cold starts)
    status = None
    for _ in range(60):
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


def test_smoke_task_writes_shared_file():
    # Ensure the shared directory exists locally for the test runner
    shared = Path("test_shared")
    shared.mkdir(parents=True, exist_ok=True)

    body = {"content": "smoke-check"}
    r = requests.post(f"{BASE}/api/ectd/smoke", json=body, timeout=5)
    assert r.status_code == 202
    job_id = r.json()["job_id"]

    # Poll for completion (30s timeout should be sufficient)
    status = None
    for _ in range(30):
        r = requests.get(f"{BASE}/api/ectd/status/{job_id}", timeout=5)
        assert r.status_code == 200
        status = r.json()
        if status.get("status") == "COMPLETED":
            break
        time.sleep(1)

    assert status is not None and status.get("status") == "COMPLETED", f"Smoke job not completed: {status}"

    # Check the file exists on the host-shared path (worker writes to /shared_data)
    output = status.get("output")
    assert output, "No output path recorded by smoke task"
    p = Path(output)
    assert p.exists(), f"Smoke file not found at {p}"

    # Save for artifact upload
    (Path("services/test_outputs") / f"smoke_{job_id}.txt").write_text(p.read_text(), encoding="utf-8")
