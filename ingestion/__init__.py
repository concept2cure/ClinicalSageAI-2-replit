"""
Ingestion Module
================

Data ingestion and extraction utilities for TrialSage.

Modules:
- pdf_extractor: Multi-strategy PDF text extraction
- benchling_connector: Benchling integration
"""

from .pdf_extractor import (
    extract_pdf_text,
    extract_pdf_text_from_bytes,
    extract_pdf_text_from_file,
    ExtractionResult,
)

__all__ = [
    "extract_pdf_text",
    "extract_pdf_text_from_bytes",
    "extract_pdf_text_from_file",
    "ExtractionResult",
]
