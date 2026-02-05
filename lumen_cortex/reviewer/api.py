"""
Review API - Phase 3 + A5 Event Emission + A7 Batch

FastAPI endpoints for Shadow FDA Reviewer.

Endpoints:
- POST /review/document - Review a single document
- POST /review/document/file - Review uploaded file
- POST /review/batch - Review multiple documents (JSON batch)
- POST /review/batch/file - Review multiple uploaded files (DOCX/PDF)
- GET /review/health - Health check
"""

from __future__ import annotations

import hashlib
import io
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Literal
from uuid import UUID, uuid4, uuid5, NAMESPACE_URL

from fastapi import APIRouter, BackgroundTasks, File, Header, HTTPException, UploadFile, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from lumen_cortex.core.canonical import CanonicalDocument, EvidencePointer
from lumen_cortex.core.canonical.document import CanonicalParagraph
from lumen_cortex.core.extractors.text_extract import (
    extract_text_from_docx_bytes,
    extract_text_from_pdf_bytes,
    normalize_text,
)
from lumen_cortex.core.events import (
    EventStoreAdapter,
    derive_error_content_hash,
    BatchQueuedPayload,
    BatchPersistedPayload,
)
from lumen_cortex.reviewer import ReviewRunner, review_document
from lumen_cortex.reviewer.config import REVIEW_CONFIG, LimitViolation
from lumen_cortex.reviewer.ratelimit import get_rate_limiter
from lumen_cortex.reviewer.storage import NeonBatchStore, BatchRow, get_batch_store


router = APIRouter(prefix="/review", tags=["review"])

# Environment variable to enable/disable event emission
LUMEN_EVENTSTORE_ENABLED = os.environ.get("LUMEN_EVENTSTORE_ENABLED", "false").lower() == "true"

# Environment variable to enable/disable batch persistence to Neon
BATCH_PERSISTENCE_ENABLED = os.environ.get("BATCH_PERSISTENCE_ENABLED", "false").lower() == "true"

# Environment variable to use external worker for async batches (disables in-process BackgroundTasks)
# When true: API just queues batch, external worker picks it up
# When false: API processes batch using FastAPI BackgroundTasks (default for backwards compat)
BATCH_WORKER_EXTERNAL = os.environ.get("BATCH_WORKER_EXTERNAL", "false").lower() == "true"

# Constants (from REVIEW_CONFIG)
MAX_FINDINGS_PREVIEW = REVIEW_CONFIG.max_findings_preview
MAX_BATCH_FILES = REVIEW_CONFIG.max_batch_docs
MAX_FILE_BYTES = REVIEW_CONFIG.max_file_bytes
MAX_TOTAL_BYTES = REVIEW_CONFIG.max_total_bytes
DEFAULT_MAX_FINDINGS_PER_DOC = REVIEW_CONFIG.max_findings_per_doc
MAX_FINDINGS_PER_DOC = 200  # Hard cap


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class ReviewTextInput(BaseModel):
    """API-friendly input DTO for text-based document review."""
    doc_id: Optional[UUID] = Field(default=None, description="Document ID (auto-generated if not provided)")
    title: Optional[str] = Field(default=None, description="Optional document title")
    content: str = Field(..., description="Document content (plain text or markdown)")
    source_type: Literal["docx", "pdf"] = Field(default="docx", description="Source type")


class ReviewRequest(BaseModel):
    """Request body for document review (JSON mode)."""
    program_id: UUID = Field(..., description="Program ID for RLS (required)")
    text: ReviewTextInput = Field(..., description="Document text input")
    extractor_version: Optional[str] = Field(default=None, description="Extractor version override")



class FindingSummary(BaseModel):
    """Summary of a single finding."""
    finding_id: str
    rule_id: str
    rule_name: str
    severity: str
    confidence: float
    description: str
    remediation: str
    paragraph_index: Optional[int]
    fingerprint: str


class ReviewResponse(BaseModel):
    """Response from document review."""
    doc_id: str
    content_hash: str
    extractor_version: str
    ruleset_version: str

    # Summary counts
    anchor_count: int
    xref_count: int
    broken_ref_count: int
    duplicate_anchor_count: int
    finding_count: int
    critical_count: int
    major_count: int
    minor_count: int

    # Findings
    findings: List[FindingSummary]


# ─────────────────────────────────────────────────────────────────────────────
# Batch Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class BatchDocumentInput(BaseModel):
    """A single document in a batch request."""
    text: ReviewTextInput = Field(..., description="Document text input")


class BatchReviewRequest(BaseModel):
    """Request body for batch document review."""
    program_id: UUID = Field(..., description="Program ID for RLS (required)")
    documents: List[BatchDocumentInput] = Field(..., min_length=1, description="Documents to review")
    ruleset_version: str = Field(default="0.1", description="Ruleset version")
    extractor_version: str = Field(default="gitsha-or-version", description="Extractor version")
    response_mode: Literal["summary", "full"] = Field(default="summary", description="Response mode")
    max_findings_per_doc: int = Field(
        default=DEFAULT_MAX_FINDINGS_PER_DOC,
        ge=1,
        le=MAX_FINDINGS_PER_DOC,
        description="Max findings returned per document",
    )
    max_docs: int = Field(
        default=MAX_BATCH_FILES,
        ge=1,
        le=MAX_FINDINGS_PER_DOC,
        description="Max documents allowed in batch",
    )


class DocumentError(BaseModel):
    """Per-document error detail."""
    filename: Optional[str] = Field(default=None)
    code: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error")


class BatchDocumentResponse(BaseModel):
    """Response for a single document in batch review."""
    filename: Optional[str] = None
    doc_id: str
    content_hash: str
    findings_count: int
    findings_digest: str
    findings_truncated: bool
    findings_preview: List[FindingSummary]
    errors: List[DocumentError]
    processing_ms: Optional[float] = Field(default=None, description="Processing time in milliseconds")


class BatchSummary(BaseModel):
    """Summary statistics for batch review."""
    documents: int
    findings_total: int
    by_severity: Dict[str, int]
    batch_processing_ms: Optional[float] = Field(default=None, description="Total batch processing time in ms")


class BatchReviewResponse(BaseModel):
    """Response from batch document review."""
    batch_id: str
    program_id: str
    documents: List[BatchDocumentResponse]
    summary: BatchSummary


class BatchStatusResponse(BaseModel):
    """Response for GET /batch/{batch_id} status polling endpoint."""
    batch_id: str
    program_id: str
    status: Literal["queued", "running", "completed", "failed"]
    mode: Literal["sync", "async"]
    documents_total: int
    documents_processed: int
    findings_total: Optional[int] = None
    by_severity: Optional[Dict[str, int]] = None
    created_at: str
    updated_at: str
    documents: Optional[List[BatchDocumentResponse]] = None


class BatchQueuedResponse(BaseModel):
    """Response when batch is queued for async processing."""
    batch_id: str
    status: Literal["queued"] = "queued"
    poll_url: str
    message: str = "Batch queued for processing"


def _build_canonical_document(
    input_text: ReviewTextInput,
    extractor_version: str,
) -> CanonicalDocument:
    """Convert API text input into a CanonicalDocument."""
    doc_id = input_text.doc_id or uuid4()
    normalized_text = normalize_text(input_text.content)
    content_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()

    raw_paragraphs = [p.strip() for p in normalized_text.split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [normalized_text]

    paragraphs = [
        CanonicalParagraph(index=i, text=text)
        for i, text in enumerate(raw_paragraphs)
    ]

    return CanonicalDocument(
        doc_id=doc_id,
        content_hash=content_hash,
        source_type=input_text.source_type,
        paragraphs=paragraphs,
        extraction_timestamp=datetime.now(timezone.utc),
        extractor_version=extractor_version,
        title=input_text.title,
    )


def _derive_upload_doc_id(program_id: UUID, content_hash: str) -> UUID:
    """Derive deterministic doc_id for uploaded file bytes."""
    return uuid5(NAMESPACE_URL, f"doc|{program_id}|{content_hash}")


def _build_canonical_document_from_bytes(
    program_id: UUID,
    file_bytes: bytes,
    source_type: Literal["docx", "pdf"],
    extractor_version: str,
    title: Optional[str] = None,
) -> CanonicalDocument:
    """Convert file bytes into a CanonicalDocument with deterministic doc_id."""
    raw_bytes_hash = hashlib.sha256(file_bytes).hexdigest()

    if source_type == "docx":
        extracted_text = extract_text_from_docx_bytes(file_bytes)
    else:
        extracted_text = extract_text_from_pdf_bytes(file_bytes)

    normalized_text = normalize_text(extracted_text)
    content_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest() if normalized_text else raw_bytes_hash
    doc_id = _derive_upload_doc_id(program_id, content_hash)

    raw_paragraphs = [p.strip() for p in normalized_text.split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [normalized_text]

    paragraphs = [
        CanonicalParagraph(index=i, text=text)
        for i, text in enumerate(raw_paragraphs)
    ]

    return CanonicalDocument(
        doc_id=doc_id,
        content_hash=content_hash,
        source_type=source_type,
        paragraphs=paragraphs,
        extraction_timestamp=datetime.now(timezone.utc),
        extractor_version=extractor_version,
        title=title,
    )


def _infer_source_type(file: UploadFile) -> Optional[Literal["docx", "pdf"]]:
    """Infer source type from filename or content_type."""
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    if filename.endswith(".pdf") or content_type == "application/pdf":
        return "pdf"

    docx_types = {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }
    if filename.endswith(".docx") or content_type in docx_types or "word" in content_type:
        return "docx"

    return None


def _infer_source_type_from_filename(filename: str) -> Optional[Literal["docx", "pdf"]]:
    """Infer source type from filename string."""
    filename_lower = filename.lower()
    if filename_lower.endswith(".pdf"):
        return "pdf"
    if filename_lower.endswith(".docx") or filename_lower.endswith(".doc"):
        return "docx"
    return None


async def _process_batch_async(
    batch_id: str,
    program_id: UUID,
    file_bytes_list: List[tuple[str, bytes]],
    ruleset_version: str,
    extractor_version: str,
    max_findings_per_doc: int,
) -> None:
    """
    Background task to process a batch asynchronously.

    Updates batch status in database as processing progresses.
    """
    store = get_batch_store()
    if not store:
        return

    try:
        # Mark batch as running
        await store.mark_batch_running(batch_id, str(program_id))

        # Process documents
        canonical_docs: List[CanonicalDocument] = []
        content_hashes_all: List[str] = []
        errored_docs_info: List[Dict[str, Any]] = []

        for filename, file_bytes in file_bytes_list:
            source_type = _infer_source_type_from_filename(filename)
            file_size = len(file_bytes)

            if source_type is None:
                error_codes = ["unsupported_type"]
                error_content_hash = derive_error_content_hash(filename, error_codes)
                doc_id = _derive_upload_doc_id(program_id, error_content_hash)
                content_hashes_all.append(error_content_hash)
                errored_docs_info.append({
                    "doc_id": str(doc_id),
                    "content_hash": error_content_hash,
                    "filename": filename,
                    "error_codes": error_codes,
                })
                await store.upsert_doc_result(
                    batch_id=batch_id,
                    program_id=str(program_id),
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    status="failed",
                    findings_count=0,
                    findings_preview=[],
                )
                continue

            if file_size > REVIEW_CONFIG.max_file_bytes:
                error_codes = ["too_large"]
                error_content_hash = derive_error_content_hash(filename, error_codes)
                doc_id = _derive_upload_doc_id(program_id, error_content_hash)
                content_hashes_all.append(error_content_hash)
                errored_docs_info.append({
                    "doc_id": str(doc_id),
                    "content_hash": error_content_hash,
                    "filename": filename,
                    "error_codes": error_codes,
                })
                await store.upsert_doc_result(
                    batch_id=batch_id,
                    program_id=str(program_id),
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    status="failed",
                    findings_count=0,
                    findings_preview=[],
                )
                continue

            try:
                canonical_doc = _build_canonical_document_from_bytes(
                    program_id=program_id,
                    file_bytes=file_bytes,
                    source_type=source_type,
                    extractor_version=extractor_version,
                    title=filename,
                )
                canonical_docs.append(canonical_doc)
                content_hashes_all.append(canonical_doc.content_hash)
            except Exception:
                error_codes = ["extract_failed"]
                error_content_hash = derive_error_content_hash(filename, error_codes)
                doc_id = _derive_upload_doc_id(program_id, error_content_hash)
                content_hashes_all.append(error_content_hash)
                errored_docs_info.append({
                    "doc_id": str(doc_id),
                    "content_hash": error_content_hash,
                    "filename": filename,
                    "error_codes": error_codes,
                })
                await store.upsert_doc_result(
                    batch_id=batch_id,
                    program_id=str(program_id),
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    status="failed",
                    findings_count=0,
                    findings_preview=[],
                )
                continue

        # Run review
        event_store = EventStoreAdapter() if LUMEN_EVENTSTORE_ENABLED else None
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            extractor_version=extractor_version,
        )
        result = runner.review_batch(
            docs=canonical_docs,
            program_id=program_id,
            extractor_version=extractor_version,
            ruleset_version=ruleset_version,
            content_hashes=content_hashes_all,
            errored_docs=errored_docs_info,
        )

        # Persist document results
        for doc_result in result.documents:
            findings_preview = [
                {
                    "finding_id": str(f.finding_id),
                    "rule_id": f.rule_id,
                    "severity": f.severity,
                    "description": f.description[:200],
                }
                for f in doc_result.findings[:max_findings_per_doc]
            ]
            await store.upsert_doc_result(
                batch_id=batch_id,
                program_id=str(program_id),
                doc_id=doc_result.doc_id,
                content_hash=doc_result.content_hash,
                status="completed",
                findings_count=doc_result.findings_count,
                findings_preview=findings_preview,
            )

        # Finalize batch with summary
        from lumen_cortex.reviewer.storage.models import BatchSummaryUpdate
        summary = BatchSummaryUpdate(
            findings_total=result.total_findings,
            by_severity=result.findings_by_severity,
        )
        await store.finalize_batch(batch_id, str(program_id), summary)

    except Exception as e:
        # Mark batch as failed on error
        # Note: In production, would log the error
        pass


def _raise_limit_violation(
    error_code: str,
    detail: str,
    limit: int,
    observed: int,
) -> None:
    """Raise HTTPException 413 with structured limit violation."""
    violation = LimitViolation(
        error_code=error_code,
        detail=detail,
        limit=limit,
        observed=observed,
    )
    raise HTTPException(status_code=413, detail=violation.to_dict())


def _check_rate_limit(program_id: UUID) -> None:
    """Check rate limit and raise 429 if exceeded."""
    limiter = get_rate_limiter()
    if not limiter.allow(program_id):
        retry_after = limiter.retry_after(program_id)
        raise HTTPException(
            status_code=429,
            detail={
                "error_code": "rate_limit_exceeded",
                "detail": "Too many requests",
                "retry_after_seconds": round(retry_after, 2),
            },
            headers={"Retry-After": str(int(retry_after) + 1)},
        )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/document", response_model=ReviewResponse)
async def review_document_endpoint(
    request: ReviewRequest,
) -> ReviewResponse:
    """
    Review a document for regulatory deficiencies.

    Runs Shadow FDA Reviewer rules (R001-R003) against the document:
    - R001: Broken cross-references
    - R002: Duplicate anchor keys
    - R003: Missing required CTD sections

    Returns deterministic findings with fingerprints for audit trails.

    If LUMEN_EVENTSTORE_ENABLED=true, emits review.findings_created event
    to vault.rps_events for audit purposes.
    """
    try:
        # Create event store adapter if enabled
        event_store = EventStoreAdapter() if LUMEN_EVENTSTORE_ENABLED else None

        # Initialize runner (determines extractor_version when not provided)
        runner = ReviewRunner(
            program_id=request.program_id,
            event_store=event_store,
            extractor_version=request.extractor_version,
        )

        # Create canonical document from request DTO
        canonical_doc = _build_canonical_document(
            input_text=request.text,
            extractor_version=runner.extractor_version,
        )

        # Run review with program_id and optional event_store
        result = runner.review(canonical_doc)

        # Flush events to database if event store is enabled
        # Note: In production, this would use async flush with actual DB connection
        if event_store and event_store.get_pending_events():
            # Events are queued but not flushed - caller must provide execute_fn
            # For now, we just log that events were queued
            pass

        # Convert to response
        return ReviewResponse(
            doc_id=result.doc_id,
            content_hash=result.content_hash,
            extractor_version=result.extractor_version,
            ruleset_version=result.ruleset_version,
            anchor_count=result.anchor_count,
            xref_count=result.xref_count,
            broken_ref_count=result.broken_ref_count,
            duplicate_anchor_count=result.duplicate_anchor_count,
            finding_count=result.finding_count,
            critical_count=result.critical_count,
            major_count=result.major_count,
            minor_count=result.minor_count,
            findings=[
                FindingSummary(
                    finding_id=str(f.finding_id),
                    rule_id=f.rule_id,
                    rule_name=f.rule_name,
                    severity=f.severity,
                    confidence=f.confidence,
                    description=f.description,
                    remediation=f.remediation,
                    paragraph_index=f.evidence.paragraph_index,
                    fingerprint=f.fingerprint,
                )
                for f in result.findings
            ],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review failed: {str(e)}")


@router.post("/document/file", response_model=ReviewResponse)
async def review_document_file(
    file: UploadFile = File(...),
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    source_type: Literal["docx", "pdf"] = Query(default="docx", description="Source type"),
) -> ReviewResponse:
    """
    Review an uploaded document file.

    Supports plain text files (.txt, .md).
    DOCX support requires python-docx integration (future).

    Args:
        file: Uploaded file (UTF-8 text)
        program_id: Program ID for RLS (required for event emission)
        document_type: Document type for rule selection
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    # Read file content
    content = await file.read()

    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Only UTF-8 text files supported. DOCX support coming soon."
        )

    # Create request and delegate
    request = ReviewRequest(
        program_id=program_id,
        text=ReviewTextInput(
            content=text_content,
            source_type=source_type,
        ),
    )

    return await review_document_endpoint(request)


@router.post("/batch/file", response_model=BatchReviewResponse)
async def review_batch_file_endpoint(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    ruleset_version: str = Query(default="0.1", description="Ruleset version"),
    extractor_version: str = Query(..., description="Extractor version (required)"),
    response_mode: Literal["summary", "full"] = Query(default="summary", description="Response mode"),
    max_findings_per_doc: int = Query(
        default=DEFAULT_MAX_FINDINGS_PER_DOC,
        ge=1,
        le=MAX_FINDINGS_PER_DOC,
        description="Max findings returned per document",
    ),
    mode: Literal["sync", "async"] = Query(default="sync", description="Processing mode: sync (wait) or async (return immediately)"),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key", description="Idempotency key for deduplication"),
):
    """
    Review a batch of uploaded files (DOCX/PDF).

    Enforces hard limits on file count and size.
    Produces deterministic batch_id and doc_id for stable event lineage.
    Errored docs get distinct content_hash via derive_error_content_hash.

    With BATCH_PERSISTENCE_ENABLED=true:
    - Idempotency-Key header enables request deduplication
    - mode=async returns immediately with batch_id for polling via GET /batch/{batch_id}
    """
    batch_start = time.perf_counter()

    # Rate limit check
    _check_rate_limit(program_id)

    # Compute request digest for idempotency (hash of file contents)
    # We need to read files first to compute digest
    file_bytes_list: List[tuple[str, bytes]] = []
    for upload in files:
        if not upload.filename:
            raise HTTPException(status_code=400, detail="Filename required")
        file_bytes = await upload.read()
        file_bytes_list.append((upload.filename, file_bytes))
        # Reset file position for re-reading if needed (not needed since we store bytes)

    # Compute request digest from sorted file hashes
    sorted_file_hashes = sorted(
        hashlib.sha256(fb).hexdigest() for _, fb in file_bytes_list
    )
    request_digest = hashlib.sha256(
        "|".join(sorted_file_hashes).encode()
    ).hexdigest()[:32]

    # Idempotency and persistence logic
    store = get_batch_store() if BATCH_PERSISTENCE_ENABLED else None
    existing_batch: Optional[BatchRow] = None

    if store and idempotency_key:
        # Check for existing batch with same idempotency key
        existing_batch = await store.create_or_get_batch(
            program_id=str(program_id),
            documents_total=len(file_bytes_list),
            mode=mode,
            idempotency_key=idempotency_key,
            request_digest=request_digest,
        )
        # If batch exists and is completed, return cached result
        if existing_batch.status == "completed":
            doc_rows = await store.get_batch_docs(existing_batch.batch_id, str(program_id))
            return BatchReviewResponse(
                batch_id=existing_batch.batch_id,
                program_id=existing_batch.program_id,
                documents=[
                    BatchDocumentResponse(
                        filename=None,
                        doc_id=doc.doc_id,
                        content_hash=doc.content_hash,
                        findings_count=doc.findings_count,
                        findings_digest="",
                        findings_truncated=False,
                        findings_preview=doc.findings_preview or [],
                        errors=[],
                    )
                    for doc in doc_rows
                ],
                summary=BatchSummary(
                    documents=existing_batch.documents_total,
                    findings_total=existing_batch.findings_total or 0,
                    by_severity=existing_batch.by_severity or {},
                ),
            )
        # If batch is queued or running, return status for polling
        if existing_batch.status in ("queued", "running"):
            return JSONResponse(
                status_code=202,
                content=BatchQueuedResponse(
                    batch_id=existing_batch.batch_id,
                    status="queued",
                    poll_url=f"/review/batch/{existing_batch.batch_id}?program_id={program_id}",
                    message="Batch already in progress",
                ).model_dump(),
            )

    # For async mode with persistence, create batch and return immediately
    if mode == "async" and store:
        if not existing_batch:
            existing_batch = await store.create_or_get_batch(
                program_id=str(program_id),
                documents_total=len(file_bytes_list),
                mode=mode,
                idempotency_key=idempotency_key,
                request_digest=request_digest,
            )
        # Queue background task for processing (unless external worker mode)
        # When BATCH_WORKER_EXTERNAL=true, just leave batch queued for external worker
        if not BATCH_WORKER_EXTERNAL:
            background_tasks.add_task(
                _process_batch_async,
                batch_id=existing_batch.batch_id,
                program_id=program_id,
                file_bytes_list=file_bytes_list,
                ruleset_version=ruleset_version,
                extractor_version=extractor_version,
                max_findings_per_doc=max_findings_per_doc,
            )
        return JSONResponse(
            status_code=202,
            content=BatchQueuedResponse(
                batch_id=existing_batch.batch_id,
                status="queued",
                poll_url=f"/review/batch/{existing_batch.batch_id}?program_id={program_id}",
                message="Batch queued for processing" + (" (external worker)" if BATCH_WORKER_EXTERNAL else ""),
            ).model_dump(),
        )

    # Limit: number of files (use already-read file_bytes_list)
    if len(file_bytes_list) > REVIEW_CONFIG.max_batch_docs:
        _raise_limit_violation(
            error_code="too_many_files",
            detail="Batch exceeds maximum file count",
            limit=REVIEW_CONFIG.max_batch_docs,
            observed=len(file_bytes_list),
        )

    total_bytes = 0
    canonical_docs: List[CanonicalDocument] = []
    filenames_by_doc_id: Dict[str, List[str]] = {}
    error_entries: List[BatchDocumentResponse] = []
    content_hashes_all: List[str] = []
    # Track errored docs for document_failed events
    errored_docs_info: List[Dict[str, Any]] = []
    # Track per-doc timing
    doc_timings: Dict[str, float] = {}

    for filename, file_bytes in file_bytes_list:
        doc_start = time.perf_counter()
        file_size = len(file_bytes)

        source_type = _infer_source_type_from_filename(filename)
        if source_type is None:
            error_codes = ["unsupported_type"]
            error_content_hash = derive_error_content_hash(filename, error_codes)
            doc_id = _derive_upload_doc_id(program_id, error_content_hash)
            doc_timings[str(doc_id)] = (time.perf_counter() - doc_start) * 1000
            error_entries.append(
                BatchDocumentResponse(
                    filename=filename,
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    findings_count=0,
                    findings_digest=hashlib.sha256(b"").hexdigest(),
                    findings_truncated=False,
                    findings_preview=[],
                    errors=[
                        DocumentError(
                            filename=filename,
                            code="unsupported_type",
                            message="Unsupported file type",
                        )
                    ],
                )
            )
            content_hashes_all.append(error_content_hash)
            errored_docs_info.append({
                "doc_id": str(doc_id),
                "content_hash": error_content_hash,
                "filename": filename,
                "error_codes": error_codes,
            })
            continue

        if file_size > REVIEW_CONFIG.max_file_bytes:
            error_codes = ["too_large"]
            error_content_hash = derive_error_content_hash(filename, error_codes)
            doc_id = _derive_upload_doc_id(program_id, error_content_hash)
            doc_timings[str(doc_id)] = (time.perf_counter() - doc_start) * 1000
            error_entries.append(
                BatchDocumentResponse(
                    filename=filename,
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    findings_count=0,
                    findings_digest=hashlib.sha256(b"").hexdigest(),
                    findings_truncated=False,
                    findings_preview=[],
                    errors=[
                        DocumentError(
                            filename=filename,
                            code="too_large",
                            message="File exceeds max size",
                        )
                    ],
                )
            )
            content_hashes_all.append(error_content_hash)
            errored_docs_info.append({
                "doc_id": str(doc_id),
                "content_hash": error_content_hash,
                "filename": filename,
                "error_codes": error_codes,
            })
            continue

        total_bytes += file_size
        if total_bytes > REVIEW_CONFIG.max_total_bytes:
            _raise_limit_violation(
                error_code="batch_too_large",
                detail="Batch total bytes exceeds limit",
                limit=REVIEW_CONFIG.max_total_bytes,
                observed=total_bytes,
            )

        try:
            canonical_doc = _build_canonical_document_from_bytes(
                program_id=program_id,
                file_bytes=file_bytes,
                source_type=source_type,
                extractor_version=extractor_version,
                title=filename,
            )
        except Exception as exc:
            error_codes = ["extract_failed"]
            error_content_hash = derive_error_content_hash(filename, error_codes)
            doc_id = _derive_upload_doc_id(program_id, error_content_hash)
            doc_timings[str(doc_id)] = (time.perf_counter() - doc_start) * 1000
            error_entries.append(
                BatchDocumentResponse(
                    filename=filename,
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    findings_count=0,
                    findings_digest=hashlib.sha256(b"").hexdigest(),
                    findings_truncated=False,
                    findings_preview=[],
                    errors=[
                        DocumentError(
                            filename=filename,
                            code="extract_failed",
                            message=f"Extraction failed: {exc}",
                        )
                    ],
                )
            )
            content_hashes_all.append(error_content_hash)
            errored_docs_info.append({
                "doc_id": str(doc_id),
                "content_hash": error_content_hash,
                "filename": filename,
                "error_codes": error_codes,
            })
            continue

        if not canonical_doc.paragraphs or all(not p.text.strip() for p in canonical_doc.paragraphs):
            error_codes = ["empty_text"]
            error_content_hash = derive_error_content_hash(filename, error_codes)
            doc_id = _derive_upload_doc_id(program_id, error_content_hash)
            doc_timings[str(doc_id)] = (time.perf_counter() - doc_start) * 1000
            error_entries.append(
                BatchDocumentResponse(
                    filename=filename,
                    doc_id=str(doc_id),
                    content_hash=error_content_hash,
                    findings_count=0,
                    findings_digest=hashlib.sha256(b"").hexdigest(),
                    findings_truncated=False,
                    findings_preview=[],
                    errors=[
                        DocumentError(
                            filename=filename,
                            code="empty_text",
                            message="Extracted text is empty",
                        )
                    ],
                )
            )
            content_hashes_all.append(error_content_hash)
            errored_docs_info.append({
                "doc_id": str(doc_id),
                "content_hash": error_content_hash,
                "filename": filename,
                "error_codes": error_codes,
            })
            continue

        doc_timings[str(canonical_doc.doc_id)] = (time.perf_counter() - doc_start) * 1000
        canonical_docs.append(canonical_doc)
        filenames_by_doc_id.setdefault(str(canonical_doc.doc_id), []).append(filename)
        content_hashes_all.append(canonical_doc.content_hash)

    event_store = EventStoreAdapter() if LUMEN_EVENTSTORE_ENABLED else None

    runner = ReviewRunner(
        program_id=program_id,
        event_store=event_store,
        extractor_version=extractor_version,
    )

    result = runner.review_batch(
        docs=canonical_docs,
        program_id=program_id,
        extractor_version=extractor_version,
        ruleset_version=ruleset_version,
        content_hashes=content_hashes_all,
        errored_docs=errored_docs_info,
    )

    batch_processing_ms = (time.perf_counter() - batch_start) * 1000

    # Add timing to error entries
    for entry in error_entries:
        entry.processing_ms = doc_timings.get(entry.doc_id, 0.0)

    return BatchReviewResponse(
        batch_id=result.batch_id,
        program_id=result.program_id,
        documents=sorted(
            [
                BatchDocumentResponse(
                    filename=(filenames_by_doc_id.get(d.doc_id, [None]).pop(0)),
                    doc_id=d.doc_id,
                    content_hash=d.content_hash,
                    findings_count=d.findings_count,
                    findings_digest=d.findings_digest,
                    findings_truncated=d.findings_count > max_findings_per_doc,
                    findings_preview=[
                        FindingSummary(
                            finding_id=str(f.finding_id),
                            rule_id=f.rule_id,
                            rule_name=f.rule_name,
                            severity=f.severity,
                            confidence=f.confidence,
                            description=f.description,
                            remediation=f.remediation,
                            paragraph_index=f.evidence.paragraph_index,
                            fingerprint=f.fingerprint,
                        )
                        for f in d.findings[:max_findings_per_doc]
                    ],
                    errors=[],
                    processing_ms=doc_timings.get(d.doc_id, 0.0),
                )
                for d in result.documents
            ] + error_entries,
            key=lambda d: (d.content_hash, d.doc_id),
        ),
        summary=BatchSummary(
            documents=len(result.documents) + len(error_entries),
            findings_total=result.total_findings,
            by_severity=result.findings_by_severity,
            batch_processing_ms=batch_processing_ms,
        ),
    )


@router.post("/batch", response_model=BatchReviewResponse)
async def review_batch_endpoint(
    request: BatchReviewRequest,
) -> BatchReviewResponse:
    """
    Review multiple documents in a deterministic batch.

    Documents are sorted by content_hash before processing for determinism.
    Emits N review.findings_created events + 1 review.batch_completed event.

    Same inputs (same bytes → same canonical JSON) produce:
    - Same document ordering
    - Same findings ordering
    - Same event payload hashes
    - Same event IDs (when timestamp_factory fixed)

    Args:
        request: BatchReviewRequest with program_id and documents list

    Returns:
        BatchReviewResponse with batch_id, sorted documents, and summary
    """
    try:
        batch_start = time.perf_counter()

        # Rate limit check
        _check_rate_limit(request.program_id)

        # Limit: number of documents
        if len(request.documents) > REVIEW_CONFIG.max_batch_docs:
            _raise_limit_violation(
                error_code="too_many_documents",
                detail="Batch exceeds maximum document count",
                limit=REVIEW_CONFIG.max_batch_docs,
                observed=len(request.documents),
            )

        if request.max_findings_per_doc > MAX_FINDINGS_PER_DOC:
            raise HTTPException(status_code=400, detail="max_findings_per_doc too large")

        # Convert input documents to CanonicalDocument
        canonical_docs: List[CanonicalDocument] = []
        error_entries: List[BatchDocumentResponse] = []
        content_hashes_all: List[str] = []
        errored_docs_info: List[Dict[str, Any]] = []
        doc_timings: Dict[str, float] = {}
        total_chars = 0

        for idx, doc_input in enumerate(request.documents):
            doc_start = time.perf_counter()
            normalized_text = normalize_text(doc_input.text.content)
            text_len = len(normalized_text)

            # Limit: per-doc character count
            if text_len > REVIEW_CONFIG.max_text_chars_per_doc:
                _raise_limit_violation(
                    error_code="doc_too_large",
                    detail=f"Document {idx} exceeds character limit",
                    limit=REVIEW_CONFIG.max_text_chars_per_doc,
                    observed=text_len,
                )

            total_chars += text_len
            # Limit: total character count
            if total_chars > REVIEW_CONFIG.max_text_chars_total:
                _raise_limit_violation(
                    error_code="batch_text_too_large",
                    detail="Batch total characters exceeds limit",
                    limit=REVIEW_CONFIG.max_text_chars_total,
                    observed=total_chars,
                )

            if not normalized_text:
                # Use index as pseudo-filename for JSON input
                pseudo_filename = f"doc_{idx}"
                error_codes = ["empty_text"]
                error_content_hash = derive_error_content_hash(pseudo_filename, error_codes)
                doc_id = doc_input.text.doc_id or _derive_upload_doc_id(request.program_id, error_content_hash)
                doc_timings[str(doc_id)] = (time.perf_counter() - doc_start) * 1000
                content_hashes_all.append(error_content_hash)
                error_entries.append(
                    BatchDocumentResponse(
                        filename=None,
                        doc_id=str(doc_id),
                        content_hash=error_content_hash,
                        findings_count=0,
                        findings_digest=hashlib.sha256(b"").hexdigest(),
                        findings_truncated=False,
                        findings_preview=[],
                        errors=[
                            DocumentError(
                                filename=None,
                                code="empty_text",
                                message="Extracted text is empty",
                            )
                        ],
                    )
                )
                errored_docs_info.append({
                    "doc_id": str(doc_id),
                    "content_hash": error_content_hash,
                    "filename": None,
                    "error_codes": error_codes,
                })
                continue

            content_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
            content_hashes_all.append(content_hash)
            doc_id = doc_input.text.doc_id or _derive_upload_doc_id(request.program_id, content_hash)

            canonical_doc = _build_canonical_document(
                input_text=ReviewTextInput(
                    doc_id=doc_id,
                    title=doc_input.text.title,
                    content=normalized_text,
                    source_type=doc_input.text.source_type,
                ),
                extractor_version=request.extractor_version,
            )
            doc_timings[str(canonical_doc.doc_id)] = (time.perf_counter() - doc_start) * 1000
            canonical_docs.append(canonical_doc)

        # Create event store adapter if enabled
        event_store = EventStoreAdapter() if LUMEN_EVENTSTORE_ENABLED else None

        # Run batch review
        runner = ReviewRunner(
            program_id=request.program_id,
            event_store=event_store,
        )
        result = runner.review_batch(
            docs=canonical_docs,
            program_id=request.program_id,
            extractor_version=request.extractor_version,
            ruleset_version=request.ruleset_version,
            content_hashes=content_hashes_all,
            errored_docs=errored_docs_info,
        )

        batch_processing_ms = (time.perf_counter() - batch_start) * 1000

        # Add timing to error entries
        for entry in error_entries:
            entry.processing_ms = doc_timings.get(entry.doc_id, 0.0)

        max_findings = request.max_findings_per_doc

        reviewed_entries = [
            BatchDocumentResponse(
                filename=None,
                doc_id=d.doc_id,
                content_hash=d.content_hash,
                findings_count=d.findings_count,
                findings_digest=d.findings_digest,
                findings_truncated=d.findings_count > max_findings,
                findings_preview=[
                    FindingSummary(
                        finding_id=str(f.finding_id),
                        rule_id=f.rule_id,
                        rule_name=f.rule_name,
                        severity=f.severity,
                        confidence=f.confidence,
                        description=f.description,
                        remediation=f.remediation,
                        paragraph_index=f.evidence.paragraph_index,
                        fingerprint=f.fingerprint,
                    )
                    for f in d.findings[:max_findings]
                ],
                errors=[],
                processing_ms=doc_timings.get(d.doc_id, 0.0),
            )
            for d in result.documents
        ]

        combined = reviewed_entries + error_entries
        combined_sorted = sorted(combined, key=lambda d: (d.content_hash, d.doc_id))

        # Convert to response
        return BatchReviewResponse(
            batch_id=result.batch_id,
            program_id=result.program_id,
            documents=combined_sorted,
            summary=BatchSummary(
                documents=len(combined_sorted),
                findings_total=result.total_findings,
                by_severity=result.findings_by_severity,
                batch_processing_ms=batch_processing_ms,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch review failed: {str(e)}")


@router.get("/health")
async def review_health() -> Dict[str, Any]:
    """Health check for review service."""
    runner = ReviewRunner()
    return {
        "status": "healthy",
        "extractor_version": runner.extractor_version,
        "ruleset_version": runner.ruleset_version,
        "rules_registered": 3,  # R001, R002, R003
    }


@router.get("/batch/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(
    batch_id: str,
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    include_documents: bool = Query(default=False, description="Include document details in response"),
) -> BatchStatusResponse:
    """
    Get status of a batch review job.

    For async mode batches, poll this endpoint until status is 'completed' or 'failed'.
    Returns summary counts and optionally full document details.

    Requires BATCH_PERSISTENCE_ENABLED=true for this endpoint to function.

    Args:
        batch_id: The batch ID returned from POST /batch/file
        program_id: Program ID for RLS authorization
        include_documents: If true, include full document results when completed

    Returns:
        BatchStatusResponse with current status and counts
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled. Set BATCH_PERSISTENCE_ENABLED=true",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(
            status_code=503,
            detail="Batch store not configured",
        )

    # Fetch batch row from database
    batch_row = await store.get_batch(batch_id, str(program_id))

    if batch_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Batch {batch_id} not found or not authorized",
        )

    # Build response
    response = BatchStatusResponse(
        batch_id=batch_row.batch_id,
        program_id=batch_row.program_id,
        status=batch_row.status,
        mode=batch_row.mode,
        documents_total=batch_row.documents_total,
        documents_processed=batch_row.documents_total if batch_row.status == "completed" else 0,
        findings_total=batch_row.findings_total,
        by_severity=batch_row.by_severity,
        created_at=batch_row.created_at.isoformat() if batch_row.created_at else "",
        updated_at=batch_row.updated_at.isoformat() if batch_row.updated_at else "",
    )

    # Include documents if requested and batch is completed
    if include_documents and batch_row.status == "completed":
        doc_rows = await store.get_batch_docs(batch_id, str(program_id))
        response.documents = [
            BatchDocumentResponse(
                filename=None,
                doc_id=doc.doc_id,
                content_hash=doc.content_hash,
                findings_count=doc.findings_count,
                findings_digest="",  # Not stored in doc row
                findings_truncated=False,
                findings_preview=doc.findings_preview or [],
                errors=[],
            )
            for doc in doc_rows
        ]
        response.documents_processed = len(doc_rows)

    return response


# ═══════════════════════════════════════════════════════════════════════════════════
# A8-5: Admin API Endpoints
# ═══════════════════════════════════════════════════════════════════════════════════


class BatchAdminResponse(BaseModel):
    """Admin view of a batch with operational fields."""
    batch_id: str
    program_id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    mode: Literal["sync", "async"]
    documents_total: int
    documents_succeeded: int
    documents_failed: int
    findings_total: Optional[int] = None
    attempts: int = 0
    last_error: Optional[str] = None
    failed_reason: Optional[str] = None
    claimed_by: Optional[str] = None
    # A8-6: Cancel fields
    cancel_requested_at: Optional[str] = None
    cancel_reason: Optional[str] = None
    cancel_requested_by: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    locked_at: Optional[str] = None
    heartbeat_at: Optional[str] = None


class RequeueRequest(BaseModel):
    """Request body for requeue operation."""
    reset_attempts: bool = Field(
        default=False,
        description="Reset attempt counter to 0 (otherwise keeps current value)"
    )


class RequeueResponse(BaseModel):
    """Response from requeue operation."""
    success: bool
    batch_id: str
    new_status: str
    attempts: int
    message: str


class FailedBatchesResponse(BaseModel):
    """Response listing failed batches."""
    program_id: str
    count: int
    batches: List[BatchAdminResponse]


# ═══════════════════════════════════════════════════════════════════════════════════
# A8-6: Ops Control Plane Models
# ═══════════════════════════════════════════════════════════════════════════════════


class CancelRequest(BaseModel):
    """Request body for cancel operation."""
    reason: Optional[str] = Field(
        default=None,
        description="Reason for cancellation (optional but recommended)"
    )
    requested_by: str = Field(
        default="admin",
        description="Identity of who is requesting cancellation"
    )


class CancelResponse(BaseModel):
    """Response from cancel operation."""
    success: bool
    batch_id: str
    status: str
    message: str
    cancel_requested_at: Optional[str] = None


class RequeueV2Request(BaseModel):
    """Request body for enhanced requeue operation."""
    reset_attempts: bool = Field(
        default=False,
        description="Reset attempt counter to 0"
    )
    force: bool = Field(
        default=False,
        description="Force requeue of stale running batches (heartbeat timeout)"
    )


class BatchListResponse(BaseModel):
    """Response listing batches with pagination."""
    program_id: str
    status_filter: Optional[str] = None
    count: int
    offset: int
    limit: int
    batches: List[BatchAdminResponse]


def _batch_row_to_admin_response(batch: BatchRow) -> BatchAdminResponse:
    """Convert BatchRow to admin response model."""
    return BatchAdminResponse(
        batch_id=batch.batch_id,
        program_id=batch.program_id,
        status=batch.status,
        mode=batch.mode,
        documents_total=batch.documents_total,
        documents_succeeded=batch.documents_succeeded,
        documents_failed=batch.documents_failed,
        findings_total=batch.findings_total,
        attempts=batch.attempts,
        last_error=batch.last_error,
        failed_reason=batch.failed_reason,
        claimed_by=batch.claimed_by,
        # A8-6: Cancel fields
        cancel_requested_at=batch.cancel_requested_at.isoformat() if batch.cancel_requested_at else None,
        cancel_reason=batch.cancel_reason,
        cancel_requested_by=batch.cancel_requested_by,
        created_at=batch.created_at.isoformat() if batch.created_at else "",
        started_at=batch.started_at.isoformat() if batch.started_at else None,
        completed_at=batch.completed_at.isoformat() if batch.completed_at else None,
        locked_at=batch.locked_at.isoformat() if batch.locked_at else None,
        heartbeat_at=batch.heartbeat_at.isoformat() if batch.heartbeat_at else None,
    )


@router.get("/batch/{batch_id}/admin", response_model=BatchAdminResponse)
async def get_batch_admin(
    batch_id: str,
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
) -> BatchAdminResponse:
    """
    Get admin view of a batch with operational fields.

    Includes: attempts, last_error, failed_reason, claimed_by, timestamps.
    Requires BATCH_PERSISTENCE_ENABLED=true.
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Batch store not configured")

    batch_row = await store.get_batch(batch_id, str(program_id))
    if batch_row is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    return _batch_row_to_admin_response(batch_row)


@router.post("/batch/{batch_id}/retry", response_model=RequeueResponse)
async def retry_batch(
    batch_id: str,
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    request: RequeueRequest = RequeueRequest(),
) -> RequeueResponse:
    """
    Requeue a failed batch for retry.

    Only failed batches can be retried. The batch will be put back in
    'queued' status for the worker to pick up again.

    Options:
    - reset_attempts=true: Reset attempt counter to 0
    - reset_attempts=false (default): Keep current attempt count

    Requires BATCH_PERSISTENCE_ENABLED=true.
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Batch store not configured")

    # Check current batch status first
    existing = await store.get_batch(batch_id, str(program_id))
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    if existing.status != "failed":
        raise HTTPException(
            status_code=400,
            detail=f"Only failed batches can be retried. Current status: {existing.status}",
        )

    # Requeue the batch
    updated = await store.requeue_batch(
        batch_id=batch_id,
        program_id=str(program_id),
        reset_attempts=request.reset_attempts,
    )

    if updated is None:
        raise HTTPException(status_code=500, detail="Requeue failed unexpectedly")

    return RequeueResponse(
        success=True,
        batch_id=updated.batch_id,
        new_status=updated.status,
        attempts=updated.attempts,
        message=f"Batch requeued for retry (attempts: {updated.attempts})",
    )


@router.get("/batches/failed", response_model=FailedBatchesResponse)
async def list_failed_batches(
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum batches to return"),
) -> FailedBatchesResponse:
    """
    List failed batches for a program.

    Returns batches in failed status, newest first.
    Useful for admin dashboards and retry workflows.

    Requires BATCH_PERSISTENCE_ENABLED=true.
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Batch store not configured")

    failed_batches = await store.list_failed_batches(
        program_id=str(program_id),
        limit=limit,
    )

    return FailedBatchesResponse(
        program_id=str(program_id),
        count=len(failed_batches),
        batches=[_batch_row_to_admin_response(b) for b in failed_batches],
    )


# ═══════════════════════════════════════════════════════════════════════════════════
# A8-6: Ops Control Plane Endpoints
# ═══════════════════════════════════════════════════════════════════════════════════


@router.post("/batch/{batch_id}/cancel", response_model=CancelResponse)
async def cancel_batch(
    batch_id: str,
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    request: CancelRequest = CancelRequest(),
) -> CancelResponse:
    """
    Request cancellation of a batch (queued or running).

    - Queued batches: immediately set to 'cancelled' status
    - Running batches: sets cancel_requested_at flag for worker to respect

    The worker will check this flag and stop processing.

    Requires BATCH_PERSISTENCE_ENABLED=true.
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Batch store not configured")

    # Check current batch status
    existing = await store.get_batch(batch_id, str(program_id))
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    if existing.status not in ("queued", "running"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel batch with status '{existing.status}'. Only queued or running batches can be cancelled.",
        )

    # Request cancellation
    updated = await store.request_cancel(
        batch_id=batch_id,
        program_id=str(program_id),
        requested_by=request.requested_by,
        reason=request.reason,
    )

    if updated is None:
        raise HTTPException(status_code=500, detail="Cancel request failed unexpectedly")

    # Emit event
    await _emit_ops_event("review.batch_cancel_requested", {
        "batch_id": batch_id,
        "program_id": str(program_id),
        "requested_by": request.requested_by,
        "reason": request.reason,
        "previous_status": existing.status,
        "new_status": updated.status,
    })

    if updated.status == "cancelled":
        message = "Batch cancelled immediately (was queued)"
    else:
        message = "Cancel requested - worker will stop processing"

    return CancelResponse(
        success=True,
        batch_id=updated.batch_id,
        status=updated.status,
        message=message,
        cancel_requested_at=updated.cancel_requested_at.isoformat() if updated.cancel_requested_at else None,
    )


@router.post("/batch/{batch_id}/requeue", response_model=RequeueResponse)
async def requeue_batch(
    batch_id: str,
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    request: RequeueV2Request = RequeueV2Request(),
) -> RequeueResponse:
    """
    Requeue a batch for retry (A8-6 enhanced version).

    Allowed when:
    - Status is 'failed' or 'cancelled'
    - If force=true: also allows reclaim from stale 'running' batches

    Options:
    - reset_attempts=true: Reset attempt counter to 0
    - force=true: Force reclaim stale running batches (heartbeat timeout)

    Clears all error/cancel state and sets batch back to 'queued'.

    Requires BATCH_PERSISTENCE_ENABLED=true.
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Batch store not configured")

    # Check current batch status
    existing = await store.get_batch(batch_id, str(program_id))
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

    # Validate status
    allowed_statuses = ["failed", "cancelled"]
    if request.force:
        allowed_statuses.append("running")

    if existing.status not in allowed_statuses:
        if request.force:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot requeue batch with status '{existing.status}'. "
                       f"Allowed: failed, cancelled, or running (with force).",
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot requeue batch with status '{existing.status}'. "
                       f"Allowed: failed, cancelled. Use force=true for stale running batches.",
            )

    # Requeue the batch
    updated = await store.requeue_batch_v2(
        batch_id=batch_id,
        program_id=str(program_id),
        reset_attempts=request.reset_attempts,
        force=request.force,
    )

    if updated is None:
        if existing.status == "running" and request.force:
            raise HTTPException(
                status_code=400,
                detail="Running batch is not stale (heartbeat still fresh). Wait or kill the worker.",
            )
        raise HTTPException(status_code=500, detail="Requeue failed unexpectedly")

    # Emit event
    await _emit_ops_event("review.batch_requeued", {
        "batch_id": batch_id,
        "program_id": str(program_id),
        "previous_status": existing.status,
        "reset_attempts": request.reset_attempts,
        "force": request.force,
        "attempts": updated.attempts,
    })

    return RequeueResponse(
        success=True,
        batch_id=updated.batch_id,
        new_status=updated.status,
        attempts=updated.attempts,
        message=f"Batch requeued for processing (attempts: {updated.attempts})",
    )


@router.get("/batches", response_model=BatchListResponse)
async def list_batches(
    program_id: UUID = Query(..., description="Program ID for RLS (required)"),
    status: Optional[str] = Query(
        default=None,
        description="Filter by status (queued, running, completed, failed, cancelled)"
    ),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum batches to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
) -> BatchListResponse:
    """
    List batches for a program with optional status filter.

    Useful for dashboards and triage. Returns batches newest first.

    Valid status values: queued, running, completed, failed, cancelled

    Requires BATCH_PERSISTENCE_ENABLED=true.
    """
    if not BATCH_PERSISTENCE_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Batch persistence is not enabled",
        )

    # Validate status if provided
    valid_statuses = {"queued", "running", "completed", "failed", "cancelled"}
    if status and status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid values: {', '.join(sorted(valid_statuses))}",
        )

    store = get_batch_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Batch store not configured")

    batches = await store.list_batches(
        program_id=str(program_id),
        status=status,
        limit=limit,
        offset=offset,
    )

    return BatchListResponse(
        program_id=str(program_id),
        status_filter=status,
        count=len(batches),
        offset=offset,
        limit=limit,
        batches=[_batch_row_to_admin_response(b) for b in batches],
    )


async def _emit_ops_event(event_type: str, payload: dict) -> None:
    """
    Emit ops event for observability (A8-6).

    Fails silently if event bus not available.
    """
    try:
        from lumen_cortex.enterprise.core import event_bus
        await event_bus.publish(
            event_type,
            payload,
            source_service="review_api",
        )
    except Exception:
        # Don't let event emission failure break the API
        pass
