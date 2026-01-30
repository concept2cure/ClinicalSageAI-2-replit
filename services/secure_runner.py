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


def run_container(
    data_json: str,
    output_dir: str,
    template_docx: Optional[str] = None,
    image_tag: str = IMAGE_TAG,
    timeout: int = 30,
    mem: str = "512m",
    cpus: float = 1.0,
) -> Tuple[int, str, str]:
    """Run the generator image in a minimal sandbox.

    Returns: (exit_code, stdout, stderr)
    """
    if not docker_available():
        raise RunnerError("Docker CLI not found in PATH")

    data_json = _abs_path(data_json)
    if template_docx:
        template_docx = _abs_path(template_docx)
    output_dir = _abs_path(output_dir)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

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
