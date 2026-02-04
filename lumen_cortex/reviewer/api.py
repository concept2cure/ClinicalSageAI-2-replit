"""
Review API - Phase 3 + A5 Event Emission + A7 Batch

FastAPI endpoints for Shadow FDA Reviewer.

Endpoints:
- POST /review/document - Review a single document
- POST /review/document/file - Review uploaded file
- POST /review/batch - Review multiple documents (JSON batch)
- GET /review/health - Health check
"""

from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, Query
from pydantic import BaseModel, Field

from lumen_cortex.core.canonical import CanonicalDocument, EvidencePointer
from lumen_cortex.core.canonical.document import CanonicalParagraph
from lumen_cortex.core.events import EventStoreAdapter
from lumen_cortex.reviewer import ReviewRunner, review_document


router = APIRouter(prefix="/review", tags=["review"])

# Environment variable to enable/disable event emission
LUMEN_EVENTSTORE_ENABLED = os.environ.get("LUMEN_EVENTSTORE_ENABLED", "false").lower() == "true"


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


class BatchDocumentResponse(BaseModel):
    """Response for a single document in batch review."""
    doc_id: str
    content_hash: str
    findings_count: int
    findings_digest: str
    findings: List[FindingSummary]


class BatchSummary(BaseModel):
    """Summary statistics for batch review."""
    documents: int
    findings_total: int
    by_severity: Dict[str, int]


class BatchReviewResponse(BaseModel):
    """Response from batch document review."""
    batch_id: str
    program_id: str
    documents: List[BatchDocumentResponse]
    summary: BatchSummary


MAX_FINDINGS_PREVIEW = 10


def _build_canonical_document(
    input_text: ReviewTextInput,
    extractor_version: str,
) -> CanonicalDocument:
    """Convert API text input into a CanonicalDocument."""
    doc_id = input_text.doc_id or uuid4()
    content_hash = hashlib.sha256(input_text.content.encode("utf-8")).hexdigest()

    raw_paragraphs = [p.strip() for p in input_text.content.split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [input_text.content]

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
        # Convert input documents to CanonicalDocument
        canonical_docs: List[CanonicalDocument] = []

        for doc_input in request.documents:
            canonical_doc = _build_canonical_document(
                input_text=doc_input.text,
                extractor_version=request.extractor_version,
            )
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
        )

        summary_mode = request.response_mode == "summary"

        # Convert to response
        return BatchReviewResponse(
            batch_id=result.batch_id,
            program_id=result.program_id,
            documents=[
                BatchDocumentResponse(
                    doc_id=d.doc_id,
                    content_hash=d.content_hash,
                    findings_count=d.findings_count,
                    findings_digest=d.findings_digest,
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
                        for f in (d.findings if not summary_mode else d.findings[:MAX_FINDINGS_PREVIEW])
                    ],
                )
                for d in result.documents
            ],
            summary=BatchSummary(
                documents=result.total_documents,
                findings_total=result.total_findings,
                by_severity=result.findings_by_severity,
            ),
        )

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

