"""
Text extraction helpers for DOCX/PDF bytes.

These functions use optional dependencies and return empty text when
libraries are unavailable to keep the batch pipeline stable.
"""

from __future__ import annotations

from io import BytesIO
from typing import Optional


def extract_text_from_docx_bytes(data: bytes) -> str:
    """Extract text from DOCX bytes using python-docx if available."""
    try:
        import docx  # type: ignore
    except Exception:
        return ""

    try:
        document = docx.Document(BytesIO(data))
        chunks = []

        for paragraph in document.paragraphs:
            if paragraph.text:
                chunks.append(paragraph.text)

        for table in document.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text:
                        chunks.append(cell.text)

        return "\n\n".join(chunks)
    except Exception:
        return ""


def extract_text_from_pdf_bytes(data: bytes) -> str:
    """Extract text from PDF bytes using PyPDF2/pypdf if available."""
    try:
        from PyPDF2 import PdfReader  # type: ignore
    except Exception:
        try:
            from pypdf import PdfReader  # type: ignore
        except Exception:
            return ""

    try:
        reader = PdfReader(BytesIO(data))
        chunks = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text:
                chunks.append(text)
        return "\n\n".join(chunks)
    except Exception:
        return ""
