#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
from pathlib import Path


def run_cmd(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"Command failed: {' '.join(cmd)}")
    return proc.stdout.strip()


def convert_docx_to_pdf(input_docx: Path, output_pdf: Path | None = None) -> Path:
    if output_pdf is None:
        output_pdf = input_docx.with_suffix(".pdf")
    outdir = output_pdf.parent
    outdir.mkdir(parents=True, exist_ok=True)

    run_cmd(
        [
            "soffice",
            "--headless",
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


def compress_pdf(input_pdf: Path, output_pdf: Path, quality: str):
    quality_map = {
        "screen": "/screen",
        "ebook": "/ebook",
        "printer": "/printer",
        "prepress": "/prepress",
        "default": "/default",
    }
    if quality not in quality_map:
        raise RuntimeError(f"Unsupported quality: {quality}")

    run_cmd(
        [
            "gs",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS={quality_map[quality]}",
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
    if args.compress:
        compressed_pdf = converted_pdf.with_name(f"{converted_pdf.stem}.compressed.pdf")
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

    print(
        json.dumps(
            {
                "ok": True,
                "inputDocx": str(input_docx),
                "convertedPdf": str(converted_pdf),
                "finalPdf": str(final_pdf),
                "compression": compression,
            }
        )
    )


if __name__ == "__main__":
    main()
