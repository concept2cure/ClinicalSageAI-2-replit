"""
python-script isolated runtime contract.

Input:  JSON file path argument with:
          {
            "code":            "<python source AnA authored>",
            "input_files":     { "name.ext": "<base64>", ... },   # optional
            "output_path":     "/abs/path/output.json",
            "cpu_seconds":     20,                                  # optional
            "max_output_bytes": 5_000_000                          # optional, per file
          }
Output: writes JSON payload to output_path:
          {
            "ok":            true/false,
            "stdout":        "<captured>",
            "stderr":        "<captured>",
            "error":         "<traceback or null>",
            "output_files":  { "name.ext": "<base64>", ... },      # files the script created/changed
            "network":       "disabled"/"unknown",
            "generated_at":  "<iso>"
          }

This is AnA's general-purpose scripting sandbox. The script runs with its
working directory set to an ephemeral tempdir (provided by the Node worker),
with no network egress, bounded CPU time, and a bounded address space. The
parent (workerClient) additionally enforces a wall-clock SIGKILL timeout.

Security posture: this runtime is defence-in-depth, not the only boundary.
Production runs inside a locked-down container (no egress, bounded
CPU/memory) — see workers/artifact-compute/runner.ts. The guards here make
the common accidental cases (opening a socket, runaway CPU) fail fast even
outside that container.
"""

import base64
import builtins
import contextlib
import io
import json
import os
import sys
import traceback
from datetime import datetime


def _install_resource_limits(cpu_seconds: int) -> None:
    """Best-effort POSIX resource caps. No-op where unsupported."""
    try:
        import resource  # POSIX only

        if cpu_seconds and cpu_seconds > 0:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
        # Cap address space to 1 GiB to stop runaway allocations.
        one_gib = 1024 * 1024 * 1024
        try:
            resource.setrlimit(resource.RLIMIT_AS, (one_gib, one_gib))
        except (ValueError, OSError):
            pass
    except Exception:
        # Non-POSIX / restricted host — rely on the container + wall-clock timeout.
        pass


def _install_network_guard() -> None:
    """When ARTIFACT_COMPUTE_NO_NETWORK=1, make outbound sockets raise."""
    if os.getenv("ARTIFACT_COMPUTE_NO_NETWORK") != "1":
        return
    try:
        import socket

        blocked = "Network egress is disabled in the AnA compute sandbox"

        def _deny(*_args, **_kwargs):
            raise OSError(blocked)

        # Block the common outbound paths. Creation of a socket object is
        # blocked too, which covers higher-level libs (urllib, requests, http).
        socket.socket = _deny  # type: ignore[assignment]
        socket.create_connection = _deny  # type: ignore[assignment]
        if hasattr(socket, "create_server"):
            socket.create_server = _deny  # type: ignore[assignment]
    except Exception:
        pass


def _write_input_files(workdir: str, input_files: dict) -> None:
    for name, b64 in (input_files or {}).items():
        # Keep writes inside the workdir — reject path traversal.
        safe = os.path.normpath(name).lstrip(os.sep)
        if safe.startswith("..") or os.path.isabs(name):
            continue
        dest = os.path.join(workdir, safe)
        os.makedirs(os.path.dirname(dest) or workdir, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(base64.b64decode(b64))


def _snapshot(workdir: str) -> dict:
    """Map of relative path → mtime for every file under workdir."""
    seen = {}
    for root, _dirs, files in os.walk(workdir):
        for fn in files:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, workdir)
            try:
                seen[rel] = os.path.getmtime(full)
            except OSError:
                pass
    return seen


def _collect_outputs(workdir: str, before: dict, reserved: set, max_bytes: int) -> dict:
    """New or modified files since `before`, base64-encoded, size-capped."""
    after = _snapshot(workdir)
    outputs = {}
    for rel, mtime in after.items():
        if rel in reserved:
            continue
        if rel in before and before[rel] == mtime:
            continue  # unchanged
        full = os.path.join(workdir, rel)
        try:
            size = os.path.getsize(full)
        except OSError:
            continue
        if size > max_bytes:
            outputs[rel] = None  # signal "too large" to the caller
            continue
        with open(full, "rb") as f:
            outputs[rel] = base64.b64encode(f.read()).decode("ascii")
    return outputs


def run_script(payload: dict, workdir: str) -> dict:
    code = payload.get("code", "")
    cpu_seconds = int(payload.get("cpu_seconds", 20) or 20)
    max_bytes = int(payload.get("max_output_bytes", 5_000_000) or 5_000_000)
    reserved = {"input.json", "output.json"}

    _install_resource_limits(cpu_seconds)
    _install_network_guard()

    before = _snapshot(workdir)
    out_buf, err_buf = io.StringIO(), io.StringIO()
    error = None
    ok = True

    # Run user code with __name__ == '__main__' so `if __name__ == '__main__':`
    # blocks fire, and with a clean globals namespace.
    script_globals = {
        "__name__": "__main__",
        "__builtins__": builtins,
        "__file__": os.path.join(workdir, "script.py"),
    }

    try:
        with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
            compiled = compile(code, "<ana-script>", "exec")
            exec(compiled, script_globals)  # noqa: S102 — sandboxed by design
    except SystemExit as exc:
        # A script calling sys.exit() is not a failure unless the code is non-zero.
        if exc.code not in (0, None):
            ok = False
            error = f"SystemExit: {exc.code}"
    except BaseException:  # noqa: BLE001 — surface every failure to the caller
        ok = False
        error = traceback.format_exc()

    output_files = _collect_outputs(workdir, before, reserved, max_bytes)

    return {
        "ok": ok,
        "stdout": out_buf.getvalue(),
        "stderr": err_buf.getvalue(),
        "error": error,
        "output_files": output_files,
        "network": "disabled" if os.getenv("ARTIFACT_COMPUTE_NO_NETWORK") == "1" else "unknown",
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("missing input path", file=sys.stderr)
        return 2

    input_path = sys.argv[1]
    with open(input_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    output_path = payload.get("output_path")
    if not output_path:
        print("missing output path", file=sys.stderr)
        return 2

    workdir = os.getenv("ARTIFACT_COMPUTE_WORKDIR") or os.path.dirname(os.path.abspath(input_path))
    _write_input_files(workdir, payload.get("input_files", {}))
    # Run the script with its cwd inside the sandbox tempdir so all relative
    # file I/O is scoped there (the Node worker also spawns with cwd=workdir;
    # this makes the runtime correct regardless of how it was launched).
    try:
        os.chdir(workdir)
    except OSError:
        pass

    result = run_script(payload, workdir)

    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(result, out)

    # Exit 0 even on script error — the error is reported in the payload, not
    # via process exit, so the Node worker can read structured diagnostics.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
