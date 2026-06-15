#!/usr/bin/env python3
"""services/secure_runner.py
Builds the docx generator Docker image and runs isolated containers for each
generation request with strict security flags.
"""

from __future__ import annotations

import subprocess
import uuid
import shutil
import os
from pathlib import Path
from typing import Optional, Tuple

IMAGE_TAG = "concept2cure/ectd-generator:latest"
BUILD_CONTEXT = Path(__file__).resolve().parent


class RunnerError(Exception):
    pass


def docker_available() -> bool:
    return shutil.which("docker") is not None


def build_image(tag: str = IMAGE_TAG, context: Path = BUILD_CONTEXT) -> None:
    if not docker_available():
        raise RunnerError("Docker CLI not found in PATH")
    cmd = ["docker", "build", "-t", tag, str(context)]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.returncode != 0:
        raise RunnerError(f"Image build failed:\n{proc.stdout}")


def _abs_path(p: str) -> str:
    return str(Path(p).resolve())


def _confined_source(p: str, base: str) -> str:
    """Resolve a host mount source and ensure it is contained under ``base``.

    Resolves symlinks via ``os.path.realpath`` and rejects any path that, after
    resolution, escapes the expected base directory. This prevents a symlinked
    input/output path from mounting arbitrary host locations into the container.

    Returns the real, absolute path on success; raises RunnerError otherwise.
    """
    real = os.path.realpath(os.path.abspath(p))
    real_base = os.path.realpath(os.path.abspath(base))
    # Containment check using commonpath to avoid string-prefix pitfalls
    # (e.g. "/data-evil" vs "/data").
    try:
        if os.path.commonpath([real, real_base]) != real_base:
            raise ValueError
    except ValueError:
        raise RunnerError(
            f"Mount source {p!r} resolves to {real!r}, which is outside the "
            f"allowed base directory {real_base!r} (possible symlink escape)."
        )
    return real


def run_container(
    data_json: str,
    output_dir: str,
    template_docx: Optional[str] = None,
    image_tag: str = IMAGE_TAG,
    timeout: int = 30,
    mem: str = "512m",
    cpus: float = 1.0,
    pids_limit: int = 256,
    mount_base: Optional[str] = None,
) -> Tuple[int, str, str]:
    """Run the generator image in a minimal sandbox.

    All host mount sources (input JSON, output dir, optional template) must
    resolve (after following symlinks) to real paths contained under
    ``mount_base``. ``mount_base`` defaults to the common ancestor of the
    provided paths so callers retain existing behavior while still being
    protected against symlink-escape mounts.

    Returns: (exit_code, stdout, stderr)
    """
    if not docker_available():
        raise RunnerError("Docker CLI not found in PATH")

    # Ensure the output directory exists before resolution so realpath works on
    # a real directory rather than a dangling path.
    Path(os.path.abspath(output_dir)).mkdir(parents=True, exist_ok=True)

    # Determine the confinement base. If not provided explicitly, derive it from
    # the common ancestor of the requested sources so legitimate callers keep
    # working while symlinks that escape that ancestor are rejected.
    candidate_sources = [os.path.abspath(data_json), os.path.abspath(output_dir)]
    if template_docx:
        candidate_sources.append(os.path.abspath(template_docx))

    if mount_base is None:
        try:
            mount_base = os.path.commonpath(
                [os.path.realpath(s) for s in candidate_sources]
            )
        except ValueError:
            # Paths on different drives/roots: cannot confine safely.
            raise RunnerError(
                "Mount sources do not share a common base directory; refusing "
                "to mount potentially unrelated host paths."
            )
        # commonpath of a single file returns the file itself; use its parent so
        # the file is "under" the base.
        if os.path.isfile(mount_base):
            mount_base = os.path.dirname(mount_base)

    data_json = _confined_source(data_json, mount_base)
    if template_docx:
        template_docx = _confined_source(template_docx, mount_base)
    output_dir = _confined_source(output_dir, mount_base)

    container_name = f"docgen-{uuid.uuid4().hex[:8]}"

    # Build argument list
    cmd = [
        "docker",
        "run",
        "--rm",
        "--name",
        container_name,
        "--network",
        "none",
        "--memory",
        mem,
        "--cpus",
        str(cpus),
        # --- hardening ---
        "--read-only",            # read-only root filesystem
        # python-docx (zipfile/tempfile) may write scratch files to /tmp; the
        # generated DOCX itself is written to the mounted /app/output dir.
        # Provide a small in-memory, noexec/nosuid tmpfs for that scratch only.
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m",
        "--cap-drop",
        "ALL",                    # drop all Linux capabilities
        "--security-opt",
        "no-new-privileges",      # block privilege escalation via setuid binaries
        "--pids-limit",
        str(pids_limit),          # cap process count to prevent fork bombs
        # -----------------
        "-v",
        f"{data_json}:/app/input.json:ro",
        "-v",
        f"{output_dir}:/app/output",
    ]

    if template_docx:
        cmd.extend(["-v", f"{template_docx}:/app/template.docx:ro"])

    cmd.append(image_tag)

    # The image ENTRYPOINT runs ectd_generator.py; pass CLI args
    cmd.extend(["-i", "/app/input.json", "-o", "/app/output/generated.docx"])

    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired as e:
        # Try to kill the container if still exists
        subprocess.run(["docker", "kill", container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raise RunnerError(f"Container execution timed out after {timeout} seconds")


def run_command_in_container(command: str, image_tag: str = IMAGE_TAG, timeout: int = 15) -> Tuple[int, str, str]:
    """Run an ad-hoc command inside the image to validate sandbox (e.g., network test).

    Uses the same restrictive security flags. Returns (exit_code, stdout, stderr)
    """
    if not docker_available():
        raise RunnerError("Docker CLI not found in PATH")

    container_name = f"docgen-cmd-{uuid.uuid4().hex[:8]}"
    cmd = [
        "docker",
        "run",
        "--rm",
        "--name",
        container_name,
        "--network",
        "none",
        "--memory",
        "512m",
        "--cpus",
        "1.0",
        # --- hardening (kept consistent with run_container) ---
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "256",
        # -----------------------------------------------------
        image_tag,
        "python",
        "-c",
        command,
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", container_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raise RunnerError("Command timed out")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build & run secure docx generator container")
    parser.add_argument("--build", action="store_true", help="Build the container image")
    parser.add_argument("--input", help="Path to input JSON")
    parser.add_argument("--template", help="Path to optional template DOCX")
    parser.add_argument("--output", default="/tmp/docgen_out", help="Output directory to mount")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    if args.build:
        build_image()
        print("Image built")
    elif args.input:
        code, out, err = run_container(args.input, args.output, args.template, timeout=args.timeout)
        print("Exit:", code)
        print(out)
        print(err)
    else:
        print("No-op: specify --build or --input <json>")
