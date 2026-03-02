"""
Ingestion Module
================

Data ingestion and extraction utilities for TrialSage.

Modules:
- pdf_extractor:         Multi-strategy PDF text extraction
- knowledge_ingestion:   Multi-format extraction (DOCX/XLSX/TXT/PDF) +
                         project-scoped knowledge-base + context synthesis
- benchling_connector:   Benchling integration
"""

from .pdf_extractor import (
    extract_pdf_text,
    extract_pdf_text_from_bytes,
    extract_pdf_text_from_file,
    extract_image_ocr,
    ExtractionResult,
)

# Multi-format extraction helpers and project knowledge-base API
# (knowledge_ingestion lives in backend/ but is exposed here for convenience)
try:
    import sys
    import os
    _project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)

    from backend.knowledge_ingestion import (
        extract_text_from_docx,
        extract_text_from_xlsx,
        extract_text_from_txt,
        extract_text_from_file,
        ingest_project_files,
        ingest_project_bytes,
        get_project_context,
        process_file,
    )
    _KNOWLEDGE_INGESTION_AVAILABLE = True
except Exception:  # noqa: BLE001
    _KNOWLEDGE_INGESTION_AVAILABLE = False

__all__ = [
    # PDF extraction (always available)
    "extract_pdf_text",
    "extract_pdf_text_from_bytes",
    "extract_pdf_text_from_file",
    "ExtractionResult",
    # Multi-format extraction + project knowledge base
    "extract_text_from_docx",
    "extract_text_from_xlsx",
    "extract_text_from_txt",
    "extract_text_from_file",
    "ingest_project_files",
    "ingest_project_bytes",
    "get_project_context",
    "process_file",
]
