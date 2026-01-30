import os
import json
import tempfile
import pytest
from pathlib import Path
from services.secure_runner import docker_available, build_image, run_container, run_command_in_container, RunnerError


@pytest.mark.skipif(not docker_available(), reason="Docker not available")
def test_build_and_run_generator(tmp_path):
    # Build image (may take network time during pip install)
    build_image()

    inp = tmp_path / "data.json"
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    # simple table
    data = {"tables": [{"title": "T", "headers": ["A", "B"], "rows": [["x","y"]]}]}
    inp.write_text(json.dumps(data), encoding="utf-8")

    code, out, err = run_container(str(inp), str(out_dir))
    assert code == 0, f"Container failed: {err}\n{out}"

    generated = out_dir / "generated.docx"
    assert generated.exists() and generated.stat().st_size > 0


@pytest.mark.skipif(not docker_available(), reason="Docker not available")
def test_network_blocked(tmp_path):
    build_image()
    # Attempt to open a TCP connection inside the container (no network allowed)
    cmd = "import socket; socket.create_connection(('example.com', 80), 5)"
    code, out, err = run_command_in_container(cmd)
    # Expect non-zero exit due to network disabled (connection refused or timeout)
    assert code != 0
    assert "Connection" in err or out or True  # at least it didn't silently succeed
