"""
Lightweight text extractors for document bytes.

These helpers are intentionally minimal and optional-dependency friendly.
"""

from lumen_cortex.core.extractors.text_extract import (
    extract_text_from_docx_bytes,
    extract_text_from_pdf_bytes,
    normalize_text,
)

__all__ = [
    "extract_text_from_docx_bytes",
    "extract_text_from_pdf_bytes",
    "normalize_text",
]
