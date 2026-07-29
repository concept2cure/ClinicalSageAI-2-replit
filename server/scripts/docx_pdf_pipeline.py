#!/usr/bin/env python3
"""DOCX → PDF (LibreOffice) with an optional Ghostscript compression pass.

Robustness contract:
  - The conversion (soffice) is the load-bearing step; if LibreOffice is not
    installed the whole operation fails with a clear message.
  - Compression is *best-effort*. If Ghostscript is missing, or the compression
    pass fails for any reason, we DO NOT lose the PDF that LibreOffice already
    produced — we return the uncompressed PDF and report why compression was
    skipped via `compressionSkipped`. Downstream (AnA tools, submission
    gateways) can then decide what to do instead of the whole authoring failing.

Binaries are resolved via env overrides (SOFFICE_BINARY, GHOSTSCRIPT_BINARY)
falling back to `soffice` / `gs` on PATH.
"""
import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def _bin(env_name: str, default: str) -> str:
    return os.environ.get(env_name) or default


def _which(binary: str) -> str | None:
    return shutil.which(binary)


def run_cmd(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"Command failed: {' '.join(cmd)}")
    return proc.stdout.strip()


def convert_docx_to_pdf(input_docx: Path, output_pdf: Path | None = None) -> Path:
    soffice = _bin("SOFFICE_BINARY", "soffice")
    if _which(soffice) is None:
        raise RuntimeError(
            "LibreOffice (soffice) is not installed on this runtime; cannot "
            "convert DOCX to PDF. Install libreoffice-writer (see "
            "Dockerfile.optimized) or set SOFFICE_BINARY."
        )

    if output_pdf is None:
        output_pdf = input_docx.with_suffix(".pdf")
    outdir = output_pdf.parent
    outdir.mkdir(parents=True, exist_ok=True)

    # Give each conversion its own LibreOffice user profile. Without this,
    # concurrent `soffice` invocations collide on the shared default profile
    # lock (one silently no-ops and produces no PDF), and a non-writable HOME
    # makes headless conversion fail silently. A per-call temp profile makes
    # server-side conversion concurrency-safe and deterministic.
    with tempfile.TemporaryDirectory(prefix="lo_profile_") as profile_dir:
        run_cmd(
            [
                soffice,
                "--headless",
                f"-env:UserInstallation=file://{profile_dir}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(outdir),
                str(input_docx),
            ]
        )

    generated = outdir / f"{input_docx.stem}.pdf"
    if not generated.exists():
        raise RuntimeError("DOCX→PDF conversion did not produce output PDF.")
    if generated != output_pdf:
        generated.replace(output_pdf)
    return output_pdf


QUALITY_MAP = {
    "screen": "/screen",
    "ebook": "/ebook",
    "printer": "/printer",
    "prepress": "/prepress",
    "default": "/default",
}


def compress_pdf(input_pdf: Path, output_pdf: Path, quality: str):
    if quality not in QUALITY_MAP:
        raise RuntimeError(f"Unsupported quality: {quality}")

    gs = _bin("GHOSTSCRIPT_BINARY", "gs")
    run_cmd(
        [
            gs,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS={QUALITY_MAP[quality]}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            f"-sOutputFile={str(output_pdf)}",
            str(input_pdf),
        ]
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-docx", required=True)
    parser.add_argument("--output-pdf", required=False)
    parser.add_argument("--compress", action="store_true")
    parser.add_argument("--quality", default="ebook")
    args = parser.parse_args()

    input_docx = Path(args.input_docx).resolve()
    if not input_docx.exists():
        raise RuntimeError(f"Input DOCX not found: {input_docx}")

    output_pdf = Path(args.output_pdf).resolve() if args.output_pdf else None
    converted_pdf = convert_docx_to_pdf(input_docx, output_pdf)

    final_pdf = converted_pdf
    compression = None
    compression_skipped = None

    if args.compress:
        if args.quality not in QUALITY_MAP:
            # Bad input is worth surfacing, but still return the PDF.
            compression_skipped = f"unsupported_quality:{args.quality}"
        elif _which(_bin("GHOSTSCRIPT_BINARY", "gs")) is None:
            # Best-effort: Ghostscript absent → keep the produced PDF, say why.
            compression_skipped = "ghostscript_unavailable"
        else:
            try:
                compressed_pdf = converted_pdf.with_name(
                    f"{converted_pdf.stem}.compressed.pdf"
                )
                before = converted_pdf.stat().st_size
                compress_pdf(converted_pdf, compressed_pdf, args.quality)
                after = compressed_pdf.stat().st_size
                final_pdf = compressed_pdf
                compression = {
                    "quality": args.quality,
                    "originalSizeBytes": before,
                    "compressedSizeBytes": after,
                    "compressionRatio": round((after / before), 4) if before > 0 else 1,
                }
            except Exception as exc:  # noqa: BLE001 — never lose the PDF on a compress error
                compression_skipped = f"ghostscript_error:{str(exc)[:200]}"

    print(
        json.dumps(
            {
                "ok": True,
                "inputDocx": str(input_docx),
                "convertedPdf": str(converted_pdf),
                "finalPdf": str(final_pdf),
                "compression": compression,
                "compressionSkipped": compression_skipped,
            }
        )
    )


if __name__ == "__main__":
    main()
