"""Regression tests for server/scripts/docx_pdf_pipeline.py.

Locks the resilience contract of the DOCX→PDF→(Ghostscript) pipeline using
stubbed binaries — no real LibreOffice/Ghostscript required, so these run
anywhere python3 + bash exist:

  * compression is best-effort: if Ghostscript is unavailable the produced PDF
    is preserved and `compressionSkipped` explains why (the bug this guards);
  * when Ghostscript is present, compression runs and is reported;
  * when compression isn't requested, the plain PDF is returned.

NOTE: these are not yet collected by the main `ci.yml` job (it runs no pytest
step). Run on demand: `python -m pytest tests/python/test_docx_pdf_pipeline.py`.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "server" / "scripts" / "docx_pdf_pipeline.py"

SOFFICE_STUB = """#!/usr/bin/env bash
outdir="."; input=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--outdir" ]; then outdir="$2"; shift 2; continue; fi
  case "$1" in --headless|--convert-to|pdf|-env:*) shift;; *) input="$1"; shift;; esac
done
stem="$(basename "${input%.*}")"
printf '%%PDF-1.4\\n%%stub-soffice\\n' > "$outdir/$stem.pdf"
"""

GS_STUB = """#!/usr/bin/env bash
out=""
for a in "$@"; do case "$a" in -sOutputFile=*) out="${a#-sOutputFile=}";; esac; done
printf '%%PDF-1.4\\n%%stub-gs\\n' > "$out"
"""


def _exec_stub(path: Path, body: str) -> Path:
    path.write_text(body)
    path.chmod(0o755)
    return path


def _run(args, env):
    result = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture
def soffice(tmp_path):
    return _exec_stub(tmp_path / "soffice_stub", SOFFICE_STUB)


def _base_env(soffice_path: Path, ghostscript_path: str) -> dict:
    return {
        **os.environ,
        "SOFFICE_BINARY": str(soffice_path),
        "GHOSTSCRIPT_BINARY": ghostscript_path,
    }


def test_compress_skips_gracefully_when_ghostscript_absent(tmp_path, soffice):
    docx = tmp_path / "in.docx"
    docx.write_text("dummy")
    out = tmp_path / "out.pdf"
    # Point at a binary that does not exist → deterministically "absent"
    env = _base_env(soffice, str(tmp_path / "no-such-gs"))

    res = _run(["--input-docx", str(docx), "--output-pdf", str(out), "--compress"], env)

    assert res["ok"] is True
    assert res["compression"] is None
    assert res["compressionSkipped"] == "ghostscript_unavailable"
    # The PDF LibreOffice produced must be preserved, not lost.
    assert Path(res["finalPdf"]).exists()
    assert res["finalPdf"] == res["convertedPdf"]


def test_compression_runs_when_ghostscript_present(tmp_path, soffice):
    gs = _exec_stub(tmp_path / "gs_stub", GS_STUB)
    docx = tmp_path / "in.docx"
    docx.write_text("dummy")
    out = tmp_path / "out.pdf"
    env = _base_env(soffice, str(gs))

    res = _run(
        ["--input-docx", str(docx), "--output-pdf", str(out), "--compress", "--quality", "screen"],
        env,
    )

    assert res["ok"] is True
    assert res["compressionSkipped"] is None
    assert res["compression"] is not None
    assert res["compression"]["quality"] == "screen"
    assert res["finalPdf"].endswith(".compressed.pdf")
    assert Path(res["finalPdf"]).exists()


def test_no_compression_requested(tmp_path, soffice):
    docx = tmp_path / "in.docx"
    docx.write_text("dummy")
    out = tmp_path / "out.pdf"
    env = _base_env(soffice, "gs")

    res = _run(["--input-docx", str(docx), "--output-pdf", str(out)], env)

    assert res["ok"] is True
    assert res["compression"] is None
    assert res["compressionSkipped"] is None
    assert Path(res["finalPdf"]).exists()


def test_unsupported_quality_skips_but_keeps_pdf(tmp_path, soffice):
    docx = tmp_path / "in.docx"
    docx.write_text("dummy")
    out = tmp_path / "out.pdf"
    env = _base_env(soffice, "gs")

    res = _run(
        ["--input-docx", str(docx), "--output-pdf", str(out), "--compress", "--quality", "bogus"],
        env,
    )

    assert res["ok"] is True
    assert res["compression"] is None
    assert res["compressionSkipped"] == "unsupported_quality:bogus"
    assert Path(res["finalPdf"]).exists()
