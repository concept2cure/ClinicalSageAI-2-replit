"""FastAPI application for Shadow Interrogation Service."""

import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator
from uuid import UUID

import uvicorn
from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import get_settings
from .models import (
    FragmentCreate,
    FragmentResponse,
    FragmentUpdateWithAttribution,
    FragmentVersionResponse,
    FragmentVersionSummary,
    HealthResponse,
    InterrogationRequest,
    InterrogationResponse,
    PrecedentCreate,
    PrecedentResponse,
    SectionInterrogationRequest,
    SectionInterrogationResponse,
    SubmissionGateResponse,
    TruthCreate,
    TruthResponse,
    TruthLinkCreate,
    TruthLinkResponse,
    AuditLogResponse,
    VersionHistoryResponse,
    VersionComparisonResponse,
    # Heatmap models (Migration 004)
    SectionRiskRollup,
    JurisdictionRiskRollup,
    FragmentCurrentState,
    FragmentRiskListItem,
    TruthCoverage,
    HeatmapResponse,
    # Snapshot models (Migration 005)
    SnapshotCreate,
    SnapshotResponse,
    SnapshotListItem,
    SnapshotFragmentResponse,
    SnapshotFragmentAdd,
    SnapshotFragmentBatchAdd,
    SnapshotAddFragmentsRequest,
    SnapshotAddFragmentsResponse,
    SnapshotFreezeGatedRequest,
    SnapshotFragmentRow,
    SnapshotGateMetrics,
    SnapshotStatusUpdate,
    SnapshotStatus,
    FragmentSnapshotComparison,
    # Automation models
    SnapshotAutomationRequest,
    SnapshotAutomationResponse,
    BatchInterrogateRequest,
    BatchInterrogateResponse,
    SnapshotFreezeRequest,
    SnapshotFreezeResponse,
    WorkflowStatusResponse,
)
from . import sql
from . import sql_heatmap
from .shadow_agent import get_shadow_agent
from .attribution import (
    with_attribution,
    SELECT_FRAGMENT_VERSION_HISTORY,
    SELECT_FRAGMENT_VERSION_BY_ID,
    SELECT_FRAGMENT_LATEST_VERSION,
    COUNT_FRAGMENT_VERSIONS,
    SELECT_VERSIONS_BY_USER,
    SELECT_VERSIONS_BY_REQUEST,
    SELECT_VERSIONS_IN_RANGE,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Shadow Interrogation Service...")
    pool = await db.get_pool()  # Initialize connection pool (may return None in lite mode)
    if pool is None:
        logger.warning("Service started in LITE MODE - no database connection")
        logger.warning("Only /health and /docs endpoints are fully functional")
    else:
        logger.info("Shadow Interrogation Service started with database connection")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Shadow Interrogation Service...")
    await db.close_pool()
    logger.info("Shadow Interrogation Service stopped")


# Create FastAPI app
settings = get_settings()
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health Endpoints
# =============================================================================

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Check service and database health."""
    return await db.health_check()


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint."""
    return {
        "service": "Shadow Interrogation Service",
        "version": settings.api_version,
        "status": "running",
    }


# =============================================================================
# Truth Store Endpoints
# =============================================================================

@app.post("/truth", response_model=TruthResponse, tags=["Truth Store"])
async def create_truth(data: TruthCreate):
    """
    Insert a truth datapoint into the Clinical Truth Store.
    
    Each row represents a single metric (Cmax, AUC, p-value, etc.) from clinical data.
    At least one of metric_value_float or metric_value_text must be provided.
    """
    if data.metric_value_float is None and data.metric_value_text is None:
        raise HTTPException(
            status_code=400,
            detail="At least one of metric_value_float or metric_value_text must be provided",
        )
    
    try:
        record = await db.fetchrow(
            sql.INSERT_TRUTH,
            data.nct_id,
            data.substance_id,
            data.metric_name,
            data.metric_value_float,
            data.metric_value_text,
            data.is_primary_endpoint,
            data.source_document_ref,
            data.source_document_hash,
        )
        return TruthResponse(**dict(record))
    except Exception as e:
        logger.exception("Failed to create truth datapoint")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/truth/{truth_id}", response_model=TruthResponse, tags=["Truth Store"])
async def get_truth(truth_id: UUID):
    """Retrieve a truth datapoint by ID."""
    record = await db.fetchrow(sql.SELECT_TRUTH_BY_ID, truth_id)
    if not record:
        raise HTTPException(status_code=404, detail="Truth datapoint not found")
    return TruthResponse(**dict(record))


# =============================================================================
# Fragment Endpoints
# =============================================================================

@app.post("/fragments", response_model=FragmentResponse, tags=["Fragments"])
async def create_fragment(data: FragmentCreate):
    """
    Create a new prose fragment (eCTD module content).
    
    If an embedding provider is configured, the embedding will be computed automatically.
    """
    # TODO: Compute embedding if provider configured
    embedding = None  # Placeholder
    
    try:
        record = await db.fetchrow(
            sql.INSERT_FRAGMENT,
            data.ectd_section_path,
            data.jurisdiction,
            data.content_prose,
            embedding,
            data.objectivity_score,
            data.confidence_rating.value if data.confidence_rating else None,
            data.burden_of_proof_justification,
        )
        return FragmentResponse(**dict(record))
    except Exception as e:
        logger.exception("Failed to create fragment")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/fragments/{fragment_id}", response_model=FragmentResponse, tags=["Fragments"])
async def get_fragment(fragment_id: UUID):
    """Retrieve a prose fragment by ID."""
    record = await db.fetchrow(sql.SELECT_FRAGMENT_BY_ID, fragment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Fragment not found")
    return FragmentResponse(**dict(record))


# =============================================================================
# Fragment-Truth Link Endpoints
# =============================================================================

@app.post(
    "/fragments/{fragment_id}/link-truth",
    response_model=list[TruthLinkResponse],
    tags=["Links"],
)
async def link_truth_to_fragment(fragment_id: UUID, data: TruthLinkCreate):
    """
    Link a prose fragment to one or more truth datapoints.
    
    This creates entries in the "claims ledger" that tracks which prose claims
    are supported by which truth datapoints. Used for traceability and drift detection.
    """
    # Verify fragment exists
    fragment = await db.fetchrow(sql.SELECT_FRAGMENT_BY_ID, fragment_id)
    if not fragment:
        raise HTTPException(status_code=404, detail="Fragment not found")
    
    # Verify all truth IDs exist
    truth_records = await db.fetch(
        sql.SELECT_TRUTHS_BY_IDS,
        [str(tid) for tid in data.truth_ids],
    )
    if len(truth_records) != len(data.truth_ids):
        raise HTTPException(
            status_code=400,
            detail="One or more truth IDs not found",
        )
    
    # Create links
    import json
    results = []
    for truth_id in data.truth_ids:
        record = await db.fetchrow(
            sql.INSERT_FRAGMENT_TRUTH_LINK,
            fragment_id,
            truth_id,
            data.claim_kind.value,
            json.dumps(data.claim_span) if data.claim_span else None,
            json.dumps(data.extracted_claim_value) if data.extracted_claim_value else None,
        )
        results.append(TruthLinkResponse(**dict(record)))
    
    # Mark fragment as verified if it now has links
    await db.execute(sql.UPDATE_FRAGMENT_VERIFIED, fragment_id, True)
    
    return results


@app.get(
    "/fragments/{fragment_id}/links",
    response_model=list[TruthLinkResponse],
    tags=["Links"],
)
async def get_fragment_links(fragment_id: UUID):
    """Get all truth links for a fragment."""
    records = await db.fetch(sql.SELECT_LINKS_BY_FRAGMENT, fragment_id)
    return [TruthLinkResponse(**dict(r)) for r in records]


# =============================================================================
# Adversarial Precedent Endpoints
# =============================================================================

@app.post("/precedents", response_model=PrecedentResponse, tags=["Precedents"])
async def create_precedent(data: PrecedentCreate):
    """
    Create a new adversarial precedent (historical regulator question).
    
    These are used by the Shadow Agent to predict likely regulatory inquiries.
    If an embedding provider is configured, the vector will be computed automatically.
    """
    # TODO: Compute embedding if provider configured
    vector = None  # Placeholder
    
    try:
        record = await db.fetchrow(
            sql.INSERT_PRECEDENT,
            data.agency_code,
            data.failure_mode,
            data.historical_question,
            vector,
            data.source_ref,
            data.therapeutic_area,
            data.submission_type,
        )
        return PrecedentResponse(**dict(record))
    except Exception as e:
        logger.exception("Failed to create precedent")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/precedents/{precedent_id}", response_model=PrecedentResponse, tags=["Precedents"])
async def get_precedent(precedent_id: UUID):
    """Retrieve an adversarial precedent by ID."""
    record = await db.fetchrow(sql.SELECT_PRECEDENT_BY_ID, precedent_id)
    if not record:
        raise HTTPException(status_code=404, detail="Precedent not found")
    return PrecedentResponse(**dict(record))


# =============================================================================
# Shadow Interrogation Endpoints
# =============================================================================

@app.post(
    "/shadow/interrogate/{fragment_id}",
    response_model=InterrogationResponse,
    tags=["Shadow Agent"],
)
async def interrogate_fragment(
    fragment_id: UUID,
    request: InterrogationRequest = InterrogationRequest(),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    """
    Run Shadow Agent interrogation on a prose fragment.
    
    The Shadow Agent:
    1. Loads the fragment and its linked truth datapoints
    2. Computes drift between prose claims and actual truth values
    3. Retrieves similar historical regulatory questions
    4. Logs the analysis to the audit trail
    
    Returns risk assessment with predicted questions from historical precedents.
    """
    request_id = request.request_id or x_request_id
    
    try:
        agent = get_shadow_agent()
        return await agent.interrogate(
            fragment_id=fragment_id,
            request_id=request_id,
            top_k=request.top_k,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Interrogation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/shadow/interrogate-section",
    response_model=SectionInterrogationResponse,
    tags=["Shadow Agent"],
)
async def interrogate_section(
    request: SectionInterrogationRequest,
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    """
    Run Shadow Agent interrogation on all fragments in a section.
    
    Use SQL LIKE patterns for section_pattern:
    - 'm2.7.3%' - All fragments in section 2.7.3
    - 'm2.%' - All Module 2 fragments
    - '%efficacy%' - All fragments with 'efficacy' in path
    
    Returns aggregate risk assessment with per-fragment breakdown.
    """
    request_id = request.request_id or x_request_id
    
    try:
        agent = get_shadow_agent()
        return await agent.interrogate_section(
            section_pattern=request.section_pattern,
            jurisdiction=request.jurisdiction,
            top_k=request.top_k,
            request_id=request_id,
        )
    except Exception as e:
        logger.exception("Section interrogation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/shadow/gate-check",
    response_model=SubmissionGateResponse,
    tags=["Shadow Agent"],
)
async def check_submission_gate(
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction (FDA, EMA, etc.)"),
):
    """
    Check submission gate readiness.
    
    Returns a gate decision (GO/REVIEW/STOP/INCOMPLETE) based on:
    - Number of fragments with predicted regulatory questions
    - Data drift levels across fragments
    - Efficacy sections linked to truth data
    - Coverage of Shadow Agent assessments
    
    Use this before submitting to identify blockers.
    """
    try:
        agent = get_shadow_agent()
        return await agent.check_submission_gate(jurisdiction=jurisdiction)
    except Exception as e:
        logger.exception("Gate check failed")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Version History Endpoints (21 CFR Part 11 Audit Trail)
# =============================================================================

@app.get(
    "/fragments/{fragment_id}/versions",
    response_model=VersionHistoryResponse,
    tags=["Version History"],
)
async def get_fragment_version_history(fragment_id: UUID):
    """
    Get complete version history for a fragment.
    
    Returns all versions of the fragment in reverse chronological order,
    supporting 21 CFR Part 11 audit trail requirements.
    """
    # Get current fragment to verify it exists
    fragment = await db.fetchrow(sql.SELECT_FRAGMENT_BY_ID, fragment_id)
    if not fragment:
        raise HTTPException(status_code=404, detail="Fragment not found")
    
    # Get version count
    version_count = await db.fetchval(COUNT_FRAGMENT_VERSIONS, fragment_id)
    
    # Get all versions
    records = await db.fetch(SELECT_FRAGMENT_VERSION_HISTORY, fragment_id)
    
    versions = [
        FragmentVersionSummary(
            fragment_id=r["fragment_id"],
            version_id=r["version_id"],
            ectd_section_path=r["ectd_section_path"],
            jurisdiction=r["jurisdiction"],
            created_at=r["created_at"],
            created_by=r["created_by"],
            change_reason=r["change_reason"],
            request_id=r["request_id"],
        )
        for r in records
    ]
    
    return VersionHistoryResponse(
        fragment_id=fragment_id,
        current_version_id=fragment["version_id"],
        total_versions=version_count or 0,
        versions=versions,
    )


@app.get(
    "/fragments/{fragment_id}/versions/{version_id}",
    response_model=FragmentVersionResponse,
    tags=["Version History"],
)
async def get_fragment_version(fragment_id: UUID, version_id: int):
    """
    Get a specific version of a fragment.
    
    Returns the complete state of the fragment at a specific version,
    including who made the change and why.
    """
    record = await db.fetchrow(SELECT_FRAGMENT_VERSION_BY_ID, fragment_id, version_id)
    if not record:
        raise HTTPException(
            status_code=404, 
            detail=f"Version {version_id} not found for fragment {fragment_id}"
        )
    
    return FragmentVersionResponse(
        id=record["id"],
        fragment_id=record["fragment_id"],
        version_id=record["version_id"],
        ectd_section_path=record["ectd_section_path"],
        jurisdiction=record["jurisdiction"],
        content_prose=record["content_prose"],
        objectivity_score=record["objectivity_score"],
        confidence_rating=record["confidence_rating"],
        is_verified_against_truth=record["is_verified_against_truth"],
        regulatory_precedent_id=record["regulatory_precedent_id"],
        burden_of_proof_justification=record["burden_of_proof_justification"],
        created_at=record["created_at"],
        created_by=record["created_by"],
        change_reason=record["change_reason"],
        request_id=record["request_id"],
        has_embedding=record["embedding"] is not None,
    )


@app.get(
    "/fragments/{fragment_id}/versions/compare/{from_version}/{to_version}",
    response_model=VersionComparisonResponse,
    tags=["Version History"],
)
async def compare_fragment_versions(fragment_id: UUID, from_version: int, to_version: int):
    """
    Compare two versions of a fragment.
    
    Returns both versions with a list of fields that changed between them.
    Useful for redlining and reviewer comment workflows.
    """
    from_record = await db.fetchrow(SELECT_FRAGMENT_VERSION_BY_ID, fragment_id, from_version)
    to_record = await db.fetchrow(SELECT_FRAGMENT_VERSION_BY_ID, fragment_id, to_version)
    
    if not from_record:
        raise HTTPException(status_code=404, detail=f"Version {from_version} not found")
    if not to_record:
        raise HTTPException(status_code=404, detail=f"Version {to_version} not found")
    
    # Determine which fields changed
    fields_changed = []
    comparison_fields = [
        "content_prose", "ectd_section_path", "jurisdiction",
        "objectivity_score", "confidence_rating", "is_verified_against_truth",
        "burden_of_proof_justification"
    ]
    for field in comparison_fields:
        if from_record[field] != to_record[field]:
            fields_changed.append(field)
    
    from_response = FragmentVersionResponse(
        id=from_record["id"],
        fragment_id=from_record["fragment_id"],
        version_id=from_record["version_id"],
        ectd_section_path=from_record["ectd_section_path"],
        jurisdiction=from_record["jurisdiction"],
        content_prose=from_record["content_prose"],
        objectivity_score=from_record["objectivity_score"],
        confidence_rating=from_record["confidence_rating"],
        is_verified_against_truth=from_record["is_verified_against_truth"],
        regulatory_precedent_id=from_record["regulatory_precedent_id"],
        burden_of_proof_justification=from_record["burden_of_proof_justification"],
        created_at=from_record["created_at"],
        created_by=from_record["created_by"],
        change_reason=from_record["change_reason"],
        request_id=from_record["request_id"],
        has_embedding=from_record["embedding"] is not None,
    )
    
    to_response = FragmentVersionResponse(
        id=to_record["id"],
        fragment_id=to_record["fragment_id"],
        version_id=to_record["version_id"],
        ectd_section_path=to_record["ectd_section_path"],
        jurisdiction=to_record["jurisdiction"],
        content_prose=to_record["content_prose"],
        objectivity_score=to_record["objectivity_score"],
        confidence_rating=to_record["confidence_rating"],
        is_verified_against_truth=to_record["is_verified_against_truth"],
        regulatory_precedent_id=to_record["regulatory_precedent_id"],
        burden_of_proof_justification=to_record["burden_of_proof_justification"],
        created_at=to_record["created_at"],
        created_by=to_record["created_by"],
        change_reason=to_record["change_reason"],
        request_id=to_record["request_id"],
        has_embedding=to_record["embedding"] is not None,
    )
    
    return VersionComparisonResponse(
        fragment_id=fragment_id,
        from_version=from_response,
        to_version=to_response,
        fields_changed=fields_changed,
    )


@app.patch(
    "/fragments/{fragment_id}",
    response_model=FragmentResponse,
    tags=["Fragments"],
)
async def update_fragment_with_attribution(
    fragment_id: UUID,
    data: FragmentUpdateWithAttribution,
):
    """
    Update a fragment with full attribution for audit trail.
    
    This endpoint requires attribution metadata (user, reason) to be provided.
    A new immutable version will be created in prose.smart_fragment_versions.
    
    The attribution pattern follows 21 CFR Part 11 requirements:
    - Who made the change (user)
    - Why the change was made (reason)
    - Optional change request ID (request_id)
    """
    # Verify fragment exists
    existing = await db.fetchrow(sql.SELECT_FRAGMENT_BY_ID, fragment_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Fragment not found")
    
    # Build update fields
    update_fields = []
    params = []
    param_idx = 1
    
    if data.content_prose is not None:
        update_fields.append(f"content_prose = ${param_idx}")
        params.append(data.content_prose)
        param_idx += 1
    
    if data.objectivity_score is not None:
        update_fields.append(f"objectivity_score = ${param_idx}")
        params.append(data.objectivity_score)
        param_idx += 1
    
    if data.confidence_rating is not None:
        update_fields.append(f"confidence_rating = ${param_idx}")
        params.append(data.confidence_rating.value)
        param_idx += 1
    
    if data.burden_of_proof_justification is not None:
        update_fields.append(f"burden_of_proof_justification = ${param_idx}")
        params.append(data.burden_of_proof_justification)
        param_idx += 1
    
    if data.ectd_section_path is not None:
        update_fields.append(f"ectd_section_path = ${param_idx}")
        params.append(data.ectd_section_path)
        param_idx += 1
    
    if data.jurisdiction is not None:
        update_fields.append(f"jurisdiction = ${param_idx}")
        params.append(data.jurisdiction)
        param_idx += 1
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Add fragment_id as last parameter
    params.append(fragment_id)
    
    # Build update query
    update_query = f"""
    UPDATE prose.smart_fragments
    SET {', '.join(update_fields)}
    WHERE id = ${param_idx}
    RETURNING id, ectd_section_path, jurisdiction, content_prose,
              (embedding IS NOT NULL) AS has_embedding,
              objectivity_score, confidence_rating, is_verified_against_truth,
              regulatory_precedent_id, burden_of_proof_justification,
              version_id, created_at, updated_at
    """
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                # Set attribution context (read by database triggers)
                async with with_attribution(
                    conn,
                    user=data.attribution.user,
                    reason=data.attribution.reason,
                    request_id=data.attribution.request_id,
                ):
                    record = await conn.fetchrow(update_query, *params)
        
        logger.info(
            "Fragment updated with attribution",
            extra={
                "fragment_id": str(fragment_id),
                "user": data.attribution.user,
                "reason": data.attribution.reason,
                "new_version": record["version_id"],
            },
        )
        
        return FragmentResponse(**dict(record))
        
    except Exception as e:
        logger.exception("Failed to update fragment")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/versions/by-user/{user}",
    response_model=list[FragmentVersionSummary],
    tags=["Version History"],
)
async def get_versions_by_user(
    user: str,
    limit: int = Query(50, ge=1, le=200),
):
    """
    Get all fragment versions created by a specific user.
    
    Useful for audit trail queries and tracking individual contributions.
    """
    records = await db.fetch(SELECT_VERSIONS_BY_USER, user, limit)
    return [
        FragmentVersionSummary(
            fragment_id=r["fragment_id"],
            version_id=r["version_id"],
            ectd_section_path=r["ectd_section_path"],
            jurisdiction=r["jurisdiction"],
            created_at=r["created_at"],
            created_by=user,
            change_reason=r["change_reason"],
            request_id=r["request_id"],
        )
        for r in records
    ]


@app.get(
    "/versions/by-request/{request_id}",
    response_model=list[FragmentVersionSummary],
    tags=["Version History"],
)
async def get_versions_by_request(request_id: str):
    """
    Get all fragment versions associated with a change request ID.
    
    Useful for correlating changes to external change control systems.
    """
    records = await db.fetch(SELECT_VERSIONS_BY_REQUEST, request_id)
    return [
        FragmentVersionSummary(
            fragment_id=r["fragment_id"],
            version_id=r["version_id"],
            ectd_section_path=r["ectd_section_path"],
            jurisdiction=r["jurisdiction"],
            created_at=r["created_at"],
            created_by=r["created_by"],
            change_reason=r["change_reason"],
            request_id=request_id,
        )
        for r in records
    ]


# =============================================================================
# Audit Log Endpoints
# =============================================================================

@app.get(
    "/audit/fragment/{fragment_id}",
    response_model=list[AuditLogResponse],
    tags=["Audit"],
)
async def get_fragment_audit_logs(
    fragment_id: UUID,
    limit: int = Query(10, ge=1, le=100),
):
    """Get audit logs for a specific fragment."""
    records = await db.fetch(sql.SELECT_AUDIT_LOGS_BY_FRAGMENT, fragment_id, limit)
    return [AuditLogResponse(**dict(r)) for r in records]


@app.get(
    "/audit/recent",
    response_model=list[AuditLogResponse],
    tags=["Audit"],
)
async def get_recent_audit_logs(limit: int = Query(20, ge=1, le=100)):
    """Get recent audit log entries."""
    records = await db.fetch(sql.SELECT_RECENT_AUDIT_LOGS, limit)
    return [AuditLogResponse(**dict(r)) for r in records]


# =============================================================================
# Heatmap / Command Center Endpoints (Migration 004)
# =============================================================================

@app.get(
    "/heatmap",
    response_model=HeatmapResponse,
    tags=["Command Center"],
)
async def get_heatmap(
    section_pattern: str | None = Query(None, description="Filter by section root (e.g., 'm2.7%')"),
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction"),
):
    """
    Get Command Center heatmap data.
    
    Returns section-level and jurisdiction-level risk rollups for
    building heatmap visualizations.
    """
    from datetime import datetime
    
    section_records = await db.fetch(
        sql_heatmap.SELECT_SECTION_RISK_ROLLUP,
        section_pattern,
        jurisdiction,
    )
    
    jurisdiction_records = await db.fetch(sql_heatmap.SELECT_JURISDICTION_RISK_ROLLUP)
    
    return HeatmapResponse(
        section_rollups=[SectionRiskRollup(**dict(r)) for r in section_records],
        jurisdiction_rollups=[JurisdictionRiskRollup(**dict(r)) for r in jurisdiction_records],
        timestamp=datetime.now(),
    )


@app.get(
    "/heatmap/sections",
    response_model=list[SectionRiskRollup],
    tags=["Command Center"],
)
async def get_section_risk_rollup(
    section_pattern: str | None = Query(None, description="Filter by section root pattern"),
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction"),
):
    """
    Get section-level risk rollup for heatmaps.
    
    Returns aggregated risk metrics per eCTD section root (e.g., m2.7.3).
    """
    records = await db.fetch(
        sql_heatmap.SELECT_SECTION_RISK_ROLLUP,
        section_pattern,
        jurisdiction,
    )
    return [SectionRiskRollup(**dict(r)) for r in records]


@app.get(
    "/heatmap/jurisdictions",
    response_model=list[JurisdictionRiskRollup],
    tags=["Command Center"],
)
async def get_jurisdiction_risk_rollup():
    """
    Get jurisdiction-level risk summary for executive dashboard.
    
    Returns aggregated risk metrics per jurisdiction (FDA, EMA, etc.).
    """
    records = await db.fetch(sql_heatmap.SELECT_JURISDICTION_RISK_ROLLUP)
    return [JurisdictionRiskRollup(**dict(r)) for r in records]


@app.get(
    "/heatmap/fragments/{fragment_id}",
    response_model=FragmentCurrentState,
    tags=["Command Center"],
)
async def get_fragment_current_state(fragment_id: UUID):
    """
    Get current fragment state with risk - single pane of glass view.
    
    Returns fragment content, truth coverage, and latest risk assessment.
    """
    record = await db.fetchrow(sql_heatmap.SELECT_FRAGMENT_CURRENT, fragment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Fragment not found")
    return FragmentCurrentState(**dict(record))


@app.get(
    "/heatmap/risky-fragments",
    response_model=list[FragmentRiskListItem],
    tags=["Command Center"],
)
async def get_top_risky_fragments(
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction"),
    limit: int = Query(50, ge=1, le=200, description="Maximum results"),
):
    """
    Get top risky fragments sorted by risk severity.
    
    Returns fragments ordered by risk status (RED > AMBER > GREEN) and drift magnitude.
    """
    records = await db.fetch(
        sql_heatmap.SELECT_TOP_RISKY_FRAGMENTS,
        jurisdiction,
        limit,
    )
    return [FragmentRiskListItem(**dict(r)) for r in records]


@app.get(
    "/heatmap/truth-coverage/{fragment_id}",
    response_model=TruthCoverage,
    tags=["Command Center"],
)
async def get_fragment_truth_coverage(fragment_id: UUID):
    """
    Get truth linkage coverage for a fragment.
    
    Shows how well the fragment is linked to truth data.
    """
    record = await db.fetchrow(sql_heatmap.SELECT_TRUTH_COVERAGE, fragment_id)
    if not record:
        raise HTTPException(status_code=404, detail="No truth coverage data for fragment")
    return TruthCoverage(**dict(record))


# =============================================================================
# Submission Snapshot Endpoints (Migration 005)
# =============================================================================

@app.post(
    "/snapshots",
    response_model=SnapshotResponse,
    tags=["Snapshots"],
)
async def create_snapshot(
    data: SnapshotCreate,
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Create a new submission snapshot (DRAFT status).
    
    A snapshot captures an exact set of fragment versions at a point in time
    for submission or audit purposes.
    """
    user = x_user or "unknown"
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                
                record = await conn.fetchrow(
                    sql_heatmap.INSERT_SNAPSHOT,
                    data.snapshot_name,
                    data.jurisdiction,
                    data.target_agency,
                    data.dossier_type,
                    data.notes,
                    user,
                )
        
        return SnapshotResponse(**dict(record))
        
    except Exception as e:
        if "submission_snapshots_name_jurisdiction_uniq" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"Snapshot '{data.snapshot_name}' already exists for jurisdiction '{data.jurisdiction}'"
            )
        logger.exception("Failed to create snapshot")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/snapshots",
    response_model=list[SnapshotListItem],
    tags=["Snapshots"],
)
async def list_snapshots(
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction"),
    status: str | None = Query(None, description="Filter by status (DRAFT, FROZEN, SUBMITTED, ARCHIVED)"),
    limit: int = Query(50, ge=1, le=200),
):
    """List submission snapshots."""
    records = await db.fetch(
        sql_heatmap.SELECT_SNAPSHOTS,
        jurisdiction,
        status,
        limit,
    )
    return [SnapshotListItem(**dict(r)) for r in records]


@app.get(
    "/snapshots/{snapshot_id}",
    response_model=SnapshotResponse,
    tags=["Snapshots"],
)
async def get_snapshot(snapshot_id: UUID):
    """Get a submission snapshot by ID."""
    record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_BY_ID, snapshot_id)
    if not record:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return SnapshotResponse(**dict(record))


@app.patch(
    "/snapshots/{snapshot_id}/status",
    response_model=SnapshotResponse,
    tags=["Snapshots"],
)
async def update_snapshot_status(
    snapshot_id: UUID,
    data: SnapshotStatusUpdate,
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Update snapshot status (state machine enforced).
    
    Valid transitions:
    - DRAFT → FROZEN (locks the snapshot)
    - DRAFT → ARCHIVED (abandons the snapshot)
    - FROZEN → SUBMITTED (marks as filed)
    - FROZEN → ARCHIVED (abandons the snapshot)
    - SUBMITTED → ARCHIVED (archives after filing)
    """
    user = x_user or "unknown"
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                
                record = await conn.fetchrow(
                    sql_heatmap.UPDATE_SNAPSHOT_STATUS,
                    snapshot_id,
                    data.status.value,
                )
        
        if not record:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        # Fetch full record for response
        full_record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_BY_ID, snapshot_id)
        return SnapshotResponse(**dict(full_record))
        
    except Exception as e:
        if "Invalid snapshot status transition" in str(e):
            raise HTTPException(status_code=400, detail=str(e))
        if "immutable" in str(e).lower():
            raise HTTPException(status_code=400, detail=str(e))
        logger.exception("Failed to update snapshot status")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete(
    "/snapshots/{snapshot_id}",
    tags=["Snapshots"],
)
async def delete_snapshot(snapshot_id: UUID):
    """
    Delete a DRAFT snapshot.
    
    Only snapshots in DRAFT status can be deleted. Once frozen, 
    snapshots become immutable regulated records.
    """
    try:
        result = await db.fetchrow(sql_heatmap.DELETE_DRAFT_SNAPSHOT, snapshot_id)
        if not result:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete snapshot: either not found or not in DRAFT status"
            )
        return {"deleted": True, "snapshot_id": str(snapshot_id)}
    except Exception as e:
        if "DRAFT" in str(e):
            raise HTTPException(status_code=400, detail=str(e))
        logger.exception("Failed to delete snapshot")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/snapshots/{snapshot_id}/fragments",
    response_model=SnapshotFragmentResponse,
    tags=["Snapshots"],
)
async def add_fragment_to_snapshot(
    snapshot_id: UUID,
    data: SnapshotFragmentAdd,
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Add a fragment to a DRAFT snapshot.
    
    Automatically captures the current version and risk state at inclusion time.
    """
    user = x_user or "unknown"
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                
                record = await conn.fetchrow(
                    sql_heatmap.INSERT_SNAPSHOT_FRAGMENT,
                    snapshot_id,
                    data.fragment_id,
                    user,
                )
        
        return SnapshotFragmentResponse(**dict(record))
        
    except Exception as e:
        if "DRAFT" in str(e):
            raise HTTPException(status_code=400, detail="Snapshot must be DRAFT to add fragments")
        if "snapshot_fragments_dedup" in str(e):
            raise HTTPException(status_code=409, detail="Fragment already in snapshot")
        logger.exception("Failed to add fragment to snapshot")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/snapshots/{snapshot_id}/fragments/batch",
    response_model=list[SnapshotFragmentResponse],
    tags=["Snapshots"],
)
async def add_fragments_batch(
    snapshot_id: UUID,
    data: SnapshotFragmentBatchAdd,
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Add multiple fragments to a DRAFT snapshot by pattern.
    
    Includes all fragments matching the jurisdiction and section pattern.
    """
    user = x_user or "unknown"
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                
                records = await conn.fetch(
                    sql_heatmap.INSERT_SNAPSHOT_FRAGMENTS_BATCH,
                    snapshot_id,
                    data.jurisdiction,
                    user,
                    data.section_pattern,
                )
        
        return [SnapshotFragmentResponse(
            id=r["id"],
            snapshot_id=snapshot_id,
            fragment_id=r["fragment_id"],
            version_id=r["version_id"],
            ectd_section_path=r["ectd_section_path"],
            jurisdiction=r["jurisdiction"],
            included_at=r.get("included_at") or datetime.now(),
            included_by=user,
            truth_link_count_at_freeze=r["truth_link_count_at_freeze"],
            primary_endpoint_links_at_freeze=None,
            risk_status_at_freeze=r["risk_status_at_freeze"],
            drift_magnitude_at_freeze=r["drift_magnitude_at_freeze"],
            audit_log_id=None,
        ) for r in records]
        
    except Exception as e:
        if "DRAFT" in str(e):
            raise HTTPException(status_code=400, detail="Snapshot must be DRAFT to add fragments")
        logger.exception("Failed to batch add fragments")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/snapshots/{snapshot_id}/add-fragments",
    response_model=SnapshotAddFragmentsResponse,
    tags=["Snapshots"],
)
async def add_fragments_to_snapshot(
    snapshot_id: UUID,
    data: SnapshotAddFragmentsRequest,
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Add fragments to a DRAFT snapshot.
    
    Supports two modes:
    1. Explicit IDs: Provide fragment_ids list
    2. Filter: Provide jurisdiction and/or ectd_section_prefix/like
    
    Returns count of inserted vs skipped (already present).
    """
    user = x_user or "unknown"
    
    # Validate request: must have either IDs or filter
    has_ids = data.fragment_ids and len(data.fragment_ids) > 0
    has_filter = data.jurisdiction or data.ectd_section_prefix or data.ectd_section_like
    
    if not has_ids and not has_filter:
        raise HTTPException(
            status_code=400, 
            detail="Must provide either fragment_ids or a filter (jurisdiction, ectd_section_prefix, ectd_section_like)"
        )
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                
                if has_ids:
                    # Mode 1: Explicit fragment IDs
                    inserted_count = 0
                    attempted = len(data.fragment_ids)
                    
                    for frag_id in data.fragment_ids:
                        try:
                            # Insert individual fragment (skips duplicates via ON CONFLICT)
                            result = await conn.fetchrow(
                                sql_heatmap.INSERT_SNAPSHOT_FRAGMENT,
                                snapshot_id,
                                frag_id,
                                user,
                            )
                            if result:
                                inserted_count += 1
                        except Exception as e:
                            if "snapshot_fragments_dedup" not in str(e):
                                raise
                            # Skip duplicates silently
                    
                    return SnapshotAddFragmentsResponse(
                        snapshot_id=str(snapshot_id),
                        attempted=attempted,
                        inserted=inserted_count,
                        skipped=attempted - inserted_count,
                    )
                
                else:
                    # Mode 2: Filter-based add
                    section_pattern = data.ectd_section_like or f"{data.ectd_section_prefix}%"
                    
                    # First, count matching fragments
                    count_result = await conn.fetchrow(
                        """
                        SELECT COUNT(DISTINCT f.id) as cnt
                        FROM prose.fragments f
                        WHERE ($1::TEXT IS NULL OR f.jurisdiction = $1)
                          AND ($2::TEXT IS NULL OR f.ectd_section_path LIKE $2)
                        """,
                        data.jurisdiction,
                        section_pattern if section_pattern != "%" else None,
                    )
                    attempted = count_result["cnt"] if count_result else 0
                    
                    # Insert via batch
                    records = await conn.fetch(
                        sql_heatmap.INSERT_SNAPSHOT_FRAGMENTS_BATCH,
                        snapshot_id,
                        data.jurisdiction,
                        user,
                        section_pattern,
                    )
                    inserted_count = len(records)
                    
                    return SnapshotAddFragmentsResponse(
                        snapshot_id=str(snapshot_id),
                        attempted=attempted,
                        inserted=inserted_count,
                        skipped=attempted - inserted_count,
                    )
                    
    except Exception as e:
        if "DRAFT" in str(e):
            raise HTTPException(status_code=400, detail="Snapshot must be DRAFT to add fragments")
        logger.exception("Failed to add fragments to snapshot")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/snapshots/{snapshot_id}/freeze",
    response_model=SnapshotGateMetrics,
    tags=["Snapshots"],
)
async def freeze_snapshot_gated(
    snapshot_id: UUID,
    data: SnapshotFreezeGatedRequest = SnapshotFreezeGatedRequest(),
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Freeze a snapshot with optional gate enforcement.
    
    This is the RegOps/RA workflow endpoint:
    - enforce_gate=True: Fail with 400 if gate_pass_recommended is false
    - enforce_interrogated=True: Fail if any fragments have never been interrogated
    
    On success, returns updated gate metrics (status will be FROZEN).
    """
    user = x_user or "unknown"
    
    try:
        # 1. Get current gate metrics to validate
        gate_record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_GATE_METRICS, snapshot_id)
        if not gate_record:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        gate_metrics = SnapshotGateMetrics(**dict(gate_record))
        
        # 2. Validate current status is DRAFT
        if gate_metrics.status != "DRAFT":
            raise HTTPException(
                status_code=400, 
                detail=f"Snapshot is already {gate_metrics.status}, cannot freeze"
            )
        
        # 3. Check gate constraints if enforced
        blockers = []
        if data.enforce_gate:
            if gate_metrics.red_fragments > 0:
                blockers.append(f"{gate_metrics.red_fragments} RED (DATA_DRIFT) fragments")
            if gate_metrics.unlinked_fragments > 0:
                blockers.append(f"{gate_metrics.unlinked_fragments} unlinked fragments")
            if gate_metrics.max_drift and gate_metrics.max_drift > 0.25:
                blockers.append(f"Max drift {gate_metrics.max_drift:.1%} exceeds 25% threshold")
        
        if data.enforce_interrogated:
            if gate_metrics.never_interrogated_fragments > 0:
                blockers.append(f"{gate_metrics.never_interrogated_fragments} never interrogated fragments")
        
        if blockers:
            raise HTTPException(
                status_code=400,
                detail=f"Gate check failed: {'; '.join(blockers)}"
            )
        
        # 4. Freeze the snapshot
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                
                result = await conn.fetchrow(
                    sql_heatmap.UPDATE_SNAPSHOT_FREEZE_IF_GATE_PASS,
                    snapshot_id,
                    user,
                )
        
        if not result:
            raise HTTPException(status_code=400, detail="Snapshot not in DRAFT status or freeze failed")
        
        # 5. Return updated gate metrics
        updated_record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_GATE_METRICS, snapshot_id)
        return SnapshotGateMetrics(**dict(updated_record))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Snapshot freeze failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/snapshots/{snapshot_id}/fragments",
    response_model=list[SnapshotFragmentResponse],
    tags=["Snapshots"],
)
async def get_snapshot_fragments(snapshot_id: UUID):
    """Get all fragments in a snapshot."""
    records = await db.fetch(sql_heatmap.SELECT_SNAPSHOT_FRAGMENTS, snapshot_id)
    return [SnapshotFragmentResponse(**dict(r)) for r in records]


@app.get(
    "/snapshots/{snapshot_id}/gate",
    response_model=SnapshotGateMetrics,
    tags=["Snapshots"],
)
async def get_snapshot_gate_metrics(snapshot_id: UUID):
    """
    Get gate metrics for a snapshot.
    
    Returns quality metrics and a recommended gate decision based on:
    - No RED (DATA_DRIFT) fragments
    - No unlinked fragments (all efficacy claims traced to truth)
    - Max drift <= 0.15
    """
    record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_GATE_METRICS, snapshot_id)
    if not record:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return SnapshotGateMetrics(**dict(record))


@app.get(
    "/snapshots/gates/all",
    response_model=list[SnapshotGateMetrics],
    tags=["Snapshots"],
)
async def get_all_snapshot_gates(
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction"),
):
    """Get gate metrics for all snapshots (comparison view)."""
    records = await db.fetch(sql_heatmap.SELECT_ALL_SNAPSHOT_GATE_METRICS, jurisdiction)
    return [SnapshotGateMetrics(**dict(r)) for r in records]


@app.get(
    "/snapshots/{snapshot_id}/compare/{fragment_id}",
    response_model=list[FragmentSnapshotComparison],
    tags=["Snapshots"],
)
async def compare_fragment_to_snapshot(snapshot_id: UUID, fragment_id: UUID):
    """
    Compare current fragment state vs snapshot state.
    
    Useful for seeing what changed since the snapshot was taken.
    """
    records = await db.fetch(
        sql_heatmap.SELECT_FRAGMENT_VS_SNAPSHOT,
        snapshot_id,
        fragment_id,
    )
    if not records:
        raise HTTPException(status_code=404, detail="Fragment not found in snapshot")
    return [FragmentSnapshotComparison(**dict(r)) for r in records]


# =============================================================================
# Workflow Automation Endpoints
# =============================================================================

@app.post(
    "/automation/snapshot",
    response_model=SnapshotAutomationResponse,
    tags=["Automation"],
)
async def create_automated_snapshot(
    data: SnapshotAutomationRequest,
    x_user: str | None = Header(None, alias="X-User"),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    """
    Create a snapshot with automated population and optional interrogation.
    
    Workflow:
    1. Create new DRAFT snapshot
    2. Add all fragments matching section patterns
    3. (Optional) Interrogate all added fragments
    4. (Optional) Freeze if gate check passes
    
    This is the primary "one-click" workflow for Command Center operations.
    """
    import time
    from uuid import uuid4
    
    start_time = time.time()
    user = x_user or "automation"
    request_id = x_request_id or str(uuid4())
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{user}'")
                await conn.execute(f"SET LOCAL app.request_id = '{request_id}'")
                
                # 1. Create snapshot
                snapshot_record = await conn.fetchrow(
                    sql_heatmap.INSERT_SNAPSHOT,
                    data.snapshot_name,
                    data.jurisdiction,
                    data.target_agency,
                    data.dossier_type,
                    data.notes,
                    user,
                )
                snapshot_id = snapshot_record["id"]
                
                # 2. Add fragments for each section pattern
                total_added = 0
                section_stats = {}
                
                for pattern in data.section_patterns:
                    records = await conn.fetch(
                        sql_heatmap.INSERT_SNAPSHOT_FRAGMENTS_BATCH,
                        snapshot_id,
                        data.jurisdiction,
                        user,
                        pattern,
                    )
                    count = len(records)
                    total_added += count
                    section_stats[pattern] = {"fragments_added": count}
        
        # 3. Interrogate fragments (outside transaction for individual audit logs)
        interrogated_count = 0
        if data.auto_interrogate and total_added > 0:
            agent = get_shadow_agent()
            result = await agent.interrogate_section(
                section_pattern="%",  # All patterns already filtered by snapshot
                jurisdiction=data.jurisdiction,
                request_id=request_id,
            )
            interrogated_count = result.total_fragments
        
        # 4. Get gate metrics
        gate_metrics = None
        gate_record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_GATE_METRICS, snapshot_id)
        if gate_record:
            gate_metrics = SnapshotGateMetrics(**dict(gate_record))
        
        # 5. Freeze if requested and gate passes
        was_frozen = False
        freeze_blocked_reason = None
        
        if data.freeze_if_gate_passes:
            if gate_metrics and gate_metrics.gate_pass_recommended:
                async with db.get_connection() as conn:
                    async with conn.transaction():
                        await conn.execute(f"SET LOCAL app.user = '{user}'")
                        freeze_result = await conn.fetchrow(
                            sql_heatmap.UPDATE_SNAPSHOT_FREEZE_IF_GATE_PASS,
                            snapshot_id,
                            user,
                        )
                        if freeze_result:
                            was_frozen = True
            else:
                blockers = []
                if gate_metrics:
                    if gate_metrics.red_fragments > 0:
                        blockers.append(f"{gate_metrics.red_fragments} RED fragments")
                    if gate_metrics.unlinked_fragments > 0:
                        blockers.append(f"{gate_metrics.unlinked_fragments} unlinked fragments")
                    if gate_metrics.never_interrogated_fragments > 0:
                        blockers.append(f"{gate_metrics.never_interrogated_fragments} never interrogated")
                freeze_blocked_reason = "; ".join(blockers) if blockers else "Gate check failed"
        
        elapsed = time.time() - start_time
        
        # Refresh gate metrics after potential freeze
        if was_frozen:
            gate_record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_GATE_METRICS, snapshot_id)
            if gate_record:
                gate_metrics = SnapshotGateMetrics(**dict(gate_record))
        
        return SnapshotAutomationResponse(
            snapshot_id=snapshot_id,
            snapshot_name=data.snapshot_name,
            jurisdiction=data.jurisdiction,
            status="FROZEN" if was_frozen else "DRAFT",
            fragments_added=total_added,
            fragments_interrogated=interrogated_count,
            gate_check=gate_metrics,
            was_frozen=was_frozen,
            freeze_blocked_reason=freeze_blocked_reason,
            section_stats=section_stats,
            elapsed_seconds=round(elapsed, 2),
        )
        
    except Exception as e:
        if "submission_snapshots_name_jurisdiction_uniq" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"Snapshot '{data.snapshot_name}' already exists for '{data.jurisdiction}'"
            )
        logger.exception("Snapshot automation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/automation/batch-interrogate",
    response_model=BatchInterrogateResponse,
    tags=["Automation"],
)
async def batch_interrogate_section(
    data: BatchInterrogateRequest,
    x_user: str | None = Header(None, alias="X-User"),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    """
    Batch interrogate all fragments in a section.
    
    By default, only interrogates fragments that are stale (>24h) or never assessed.
    Set force_all=True to re-interrogate everything.
    
    Each fragment gets its own audit log entry for complete traceability.
    """
    import time
    from uuid import uuid4
    
    start_time = time.time()
    request_id = x_request_id or str(uuid4())
    
    try:
        agent = get_shadow_agent()
        
        if data.force_all:
            # Full section interrogation
            result = await agent.interrogate_section(
                section_pattern=data.section_pattern,
                jurisdiction=data.jurisdiction,
                top_k=data.top_k,
                request_id=request_id,
            )
            
            elapsed = time.time() - start_time
            
            return BatchInterrogateResponse(
                section_pattern=data.section_pattern,
                jurisdiction=data.jurisdiction,
                total_fragments=result.total_fragments,
                interrogated=result.total_fragments,
                skipped_recent=0,
                red_count=result.red_count,
                amber_count=result.amber_count,
                green_count=result.green_count,
                error_count=sum(1 for f in result.fragment_results if f.risk_status.value == "ERROR"),
                avg_drift=result.avg_drift,
                max_drift=result.max_drift,
                batch_request_id=result.batch_request_id,
                elapsed_seconds=round(elapsed, 2),
            )
        else:
            # Selective interrogation (only stale fragments)
            stale_fragments = await db.fetch(
                sql_heatmap.SELECT_STALE_FRAGMENTS_FOR_INTERROGATION,
                data.section_pattern,
                data.jurisdiction,
            )
            
            # Get total count for section
            stats = await db.fetchrow(
                sql_heatmap.SELECT_SECTION_FRAGMENT_STATS,
                data.section_pattern,
                data.jurisdiction,
            )
            total_in_section = stats["total"] if stats else 0
            
            red_count = 0
            amber_count = 0
            green_count = 0
            error_count = 0
            max_drift = 0.0
            total_drift = 0.0
            
            for frag in stale_fragments:
                try:
                    result = await agent.interrogate(
                        fragment_id=frag["fragment_id"],
                        request_id=request_id,
                        top_k=data.top_k,
                    )
                    
                    if result.risk_status.value == "DATA_DRIFT":
                        red_count += 1
                    elif result.risk_status.value == "IR_PREDICTED":
                        amber_count += 1
                    else:
                        green_count += 1
                    
                    total_drift += result.drift_magnitude
                    max_drift = max(max_drift, result.drift_magnitude)
                    
                except Exception as e:
                    logger.error(f"Error interrogating fragment {frag['fragment_id']}: {e}")
                    error_count += 1
            
            interrogated = len(stale_fragments)
            elapsed = time.time() - start_time
            
            return BatchInterrogateResponse(
                section_pattern=data.section_pattern,
                jurisdiction=data.jurisdiction,
                total_fragments=total_in_section,
                interrogated=interrogated,
                skipped_recent=total_in_section - interrogated,
                red_count=red_count,
                amber_count=amber_count,
                green_count=green_count,
                error_count=error_count,
                avg_drift=round(total_drift / max(interrogated, 1), 4),
                max_drift=round(max_drift, 4),
                batch_request_id=request_id,
                elapsed_seconds=round(elapsed, 2),
            )
            
    except Exception as e:
        logger.exception("Batch interrogation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/automation/snapshots/{snapshot_id}/freeze",
    response_model=SnapshotFreezeResponse,
    tags=["Automation"],
)
async def freeze_snapshot_with_gate(
    snapshot_id: UUID,
    data: SnapshotFreezeRequest = SnapshotFreezeRequest(),
    x_user: str | None = Header(None, alias="X-User"),
):
    """
    Freeze a snapshot with gate check.
    
    By default, only freezes if gate check passes (no RED fragments, all linked).
    Set force=True with override_reason to bypass gate check (audited).
    """
    user = x_user or "unknown"
    
    try:
        # Get current gate metrics
        gate_record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_GATE_METRICS, snapshot_id)
        if not gate_record:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        gate_metrics = SnapshotGateMetrics(**dict(gate_record))
        blockers = []
        
        if gate_metrics.red_fragments > 0:
            blockers.append(f"{gate_metrics.red_fragments} RED (DATA_DRIFT) fragments")
        if gate_metrics.unlinked_fragments > 0:
            blockers.append(f"{gate_metrics.unlinked_fragments} unlinked fragments")
        if gate_metrics.never_interrogated_fragments > 0:
            blockers.append(f"{gate_metrics.never_interrogated_fragments} never interrogated")
        if gate_metrics.max_drift and gate_metrics.max_drift > 0.25:
            blockers.append(f"Max drift {gate_metrics.max_drift:.1%} exceeds 25% threshold")
        
        gate_passed = len(blockers) == 0
        
        if data.force:
            # Force freeze with override
            async with db.get_connection() as conn:
                async with conn.transaction():
                    await conn.execute(f"SET LOCAL app.user = '{user}'")
                    await conn.execute(f"SET LOCAL app.reason = 'FORCE_FREEZE: {data.override_reason}'")
                    
                    result = await conn.fetchrow(
                        sql_heatmap.UPDATE_SNAPSHOT_FORCE_FREEZE,
                        snapshot_id,
                        user,
                        data.override_reason,
                    )
            
            if not result:
                raise HTTPException(status_code=400, detail="Snapshot not in DRAFT status")
            
            return SnapshotFreezeResponse(
                snapshot_id=snapshot_id,
                snapshot_name=result["snapshot_name"],
                status="FROZEN",
                frozen_at=result["frozen_at"],
                frozen_by=result["frozen_by"],
                was_forced=True,
                gate_passed=gate_passed,
                blockers=blockers,
            )
        
        elif gate_passed:
            # Normal freeze (gate passed)
            async with db.get_connection() as conn:
                async with conn.transaction():
                    await conn.execute(f"SET LOCAL app.user = '{user}'")
                    
                    result = await conn.fetchrow(
                        sql_heatmap.UPDATE_SNAPSHOT_FREEZE_IF_GATE_PASS,
                        snapshot_id,
                        user,
                    )
            
            if not result:
                raise HTTPException(status_code=400, detail="Snapshot not in DRAFT status or gate failed")
            
            return SnapshotFreezeResponse(
                snapshot_id=snapshot_id,
                snapshot_name=result["snapshot_name"],
                status="FROZEN",
                frozen_at=result["frozen_at"],
                frozen_by=result["frozen_by"],
                was_forced=False,
                gate_passed=True,
                blockers=[],
            )
        
        else:
            # Gate failed, cannot freeze
            return SnapshotFreezeResponse(
                snapshot_id=snapshot_id,
                snapshot_name=gate_metrics.snapshot_name,
                status="DRAFT",
                frozen_at=None,
                frozen_by=None,
                was_forced=False,
                gate_passed=False,
                blockers=blockers,
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Snapshot freeze failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/automation/snapshots/{snapshot_id}/status",
    response_model=WorkflowStatusResponse,
    tags=["Automation"],
)
async def get_snapshot_workflow_status(snapshot_id: UUID):
    """
    Get comprehensive workflow status for a snapshot.
    
    Shows current state, fragment counts by risk level, and whether
    the snapshot is ready to freeze.
    """
    record = await db.fetchrow(sql_heatmap.SELECT_SNAPSHOT_AUTOMATION_STATUS, snapshot_id)
    if not record:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    blockers = []
    if record["red_count"] > 0:
        blockers.append(f"{record['red_count']} RED fragments need remediation")
    if record["not_interrogated"] > 0:
        blockers.append(f"{record['not_interrogated']} fragments not yet interrogated")
    
    ready = (
        record["status"] == "DRAFT" and 
        record["red_count"] == 0 and 
        record["not_interrogated"] == 0 and
        record["gate_pass_recommended"] is True
    )
    
    return WorkflowStatusResponse(
        snapshot_id=record["snapshot_id"],
        snapshot_name=record["snapshot_name"],
        jurisdiction=record["jurisdiction"],
        status=record["status"],
        fragments_included=record["fragments_included"],
        not_interrogated=record["not_interrogated"],
        red_count=record["red_count"],
        amber_count=record["amber_count"],
        green_count=record["green_count"],
        avg_drift=float(record["avg_drift"]),
        max_drift=float(record["max_drift"]),
        gate_pass_recommended=record["gate_pass_recommended"],
        ready_to_freeze=ready,
        blockers=blockers,
    )


# =============================================================================
# Multi-Persona Shadow Runs (Migration 007)
# =============================================================================

from .personas import get_persona, get_all_personas, validate_persona_codes, PERSONAS, PersonaConfig
from .models import (
    PersonaInfo,
    RunGroupCreate,
    RunGroupResponse,
    RunGroupSummary,
    MultiPersonaInterrogateRequest,
    MultiPersonaInterrogateResponse,
    PersonaResult,
    CrossPersonaDisagreement,
    CrossPersonaAnalysisResponse,
)
from . import sql_run_groups


@app.get("/personas", response_model=list[PersonaInfo], tags=["Personas"])
async def list_personas():
    """
    List all available Shadow Agent personas.
    
    Each persona represents a different regulatory reviewer perspective
    (e.g., FDA Stats Reviewer, FDA Clinical Reviewer, FDA Safety, CMC Quality).
    """
    return [
        PersonaInfo(
            code=p.code,
            display_name=p.display_name,
            agency_filter=p.agency_filter,
            failure_modes=list(p.failure_modes),
            top_k=p.top_k,
            drift_red_threshold=p.drift_red_threshold,
            ir_similarity_threshold=p.ir_similarity_threshold,
        )
        for p in PERSONAS.values()
    ]


@app.get("/personas/{code}", response_model=PersonaInfo, tags=["Personas"])
async def get_persona_info(code: str):
    """Get details for a specific persona."""
    if code not in PERSONAS:
        raise HTTPException(status_code=404, detail=f"Persona not found: {code}")
    p = PERSONAS[code]
    return PersonaInfo(
        code=p.code,
        display_name=p.display_name,
        agency_filter=p.agency_filter,
        failure_modes=list(p.failure_modes),
        top_k=p.top_k,
        drift_red_threshold=p.drift_red_threshold,
        ir_similarity_threshold=p.ir_similarity_threshold,
    )


@app.post(
    "/shadow/interrogate-section",
    response_model=MultiPersonaInterrogateResponse,
    tags=["Shadow Agent", "Multi-Persona"],
)
async def interrogate_section_multi_persona(
    data: MultiPersonaInterrogateRequest,
    x_user: str = Header(default="system", alias="X-User"),
    x_request_id: str = Header(default=None, alias="X-Request-Id"),
):
    """
    Interrogate an eCTD section with multiple personas.
    
    This is the primary workflow for batch QC runs:
    - "Run FDA_STATS + FDA_CLINICAL over all of M2.7.3 before weekly QC"
    
    Creates a run_group_id that correlates all audit logs, enabling:
    - Cross-persona comparison
    - Batch reporting
    - Reproducible QC runs
    """
    import time
    import json
    start = time.time()
    
    # Validate personas
    valid_personas = validate_persona_codes(data.personas)
    if not valid_personas:
        raise HTTPException(status_code=400, detail="No valid personas specified")
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                # Set attribution
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                if x_request_id:
                    await conn.execute(f"SET LOCAL app.request_id = '{x_request_id}'")
                
                # Create run group
                run_group = await conn.fetchrow(
                    sql_run_groups.SQL_INSERT_RUN_GROUP,
                    data.run_name or f"Section QC: {data.ectd_section_like}",
                    "SECTION_BATCH",
                    data.jurisdiction,
                    None,  # agency_code derived from personas
                    valid_personas,
                    json.dumps({"top_k_override": data.top_k_override}),
                )
                run_group_id = run_group["id"]
                
                # Get fragments matching section pattern
                fragments = await conn.fetch(
                    sql_run_groups.SQL_GET_FRAGMENTS_BY_SECTION,
                    data.ectd_section_like,
                    data.jurisdiction,
                )
                
                if not fragments:
                    return MultiPersonaInterrogateResponse(
                        run_group_id=run_group_id,
                        run_name=data.run_name,
                        ectd_section_like=data.ectd_section_like,
                        jurisdiction=data.jurisdiction,
                        total_fragments=0,
                        personas_run=valid_personas,
                        persona_results=[],
                        total_evaluations=0,
                        elapsed_seconds=time.time() - start,
                    )
                
                # Get Shadow Agent
                agent = get_shadow_agent()
                
                # Track results per persona
                persona_stats = {p: {"red": 0, "amber": 0, "green": 0, "drift_sum": 0.0, "count": 0} for p in valid_personas}
                total_evals = 0
                
                # Interrogate each fragment with each persona
                for frag in fragments:
                    fragment_id = frag["fragment_id"]
                    version_id = frag["version_id"]
                    content = frag["content_prose"] or ""
                    
                    for persona_code in valid_personas:
                        persona = get_persona(persona_code)
                        top_k = data.top_k_override or persona.top_k
                        
                        # Run interrogation with persona-specific config
                        try:
                            result = await agent.interrogate(
                                fragment_text=content,
                                jurisdiction=data.jurisdiction or frag["jurisdiction"],
                                agency_filter=persona.agency_filter,
                                failure_mode_filter=list(persona.failure_modes) if persona.failure_modes else None,
                                top_k=top_k,
                            )
                            
                            # Determine risk status using persona thresholds
                            drift = result.get("drift_magnitude", 0.0)
                            max_sim = result.get("max_similarity", 0.0)
                            
                            if drift > persona.drift_red_threshold:
                                risk_status = "DATA_DRIFT"
                                persona_stats[persona_code]["red"] += 1
                            elif max_sim > persona.ir_similarity_threshold:
                                risk_status = "IR_PREDICTED"
                                persona_stats[persona_code]["amber"] += 1
                            else:
                                risk_status = "ALIGNED"
                                persona_stats[persona_code]["green"] += 1
                            
                            persona_stats[persona_code]["drift_sum"] += drift
                            persona_stats[persona_code]["count"] += 1
                            
                            # Insert audit log with version pinning
                            await conn.execute(
                                sql_run_groups.SQL_INSERT_AUDIT_LOG_ENHANCED,
                                fragment_id,
                                version_id,
                                run_group_id,
                                "SHADOW_AGENT",
                                persona_code,
                                risk_status,
                                json.dumps(result),
                                drift,
                            )
                            total_evals += 1
                            
                        except Exception as e:
                            logger.warning(f"Interrogation failed for fragment {fragment_id} persona {persona_code}: {e}")
                
                # Build persona results
                persona_results = []
                for p_code in valid_personas:
                    stats = persona_stats[p_code]
                    count = stats["count"]
                    persona_results.append(PersonaResult(
                        persona=p_code,
                        logs_count=count,
                        red_count=stats["red"],
                        amber_count=stats["amber"],
                        green_count=stats["green"],
                        avg_drift=stats["drift_sum"] / count if count > 0 else None,
                    ))
                
                return MultiPersonaInterrogateResponse(
                    run_group_id=run_group_id,
                    run_name=data.run_name,
                    ectd_section_like=data.ectd_section_like,
                    jurisdiction=data.jurisdiction,
                    total_fragments=len(fragments),
                    personas_run=valid_personas,
                    persona_results=persona_results,
                    total_evaluations=total_evals,
                    elapsed_seconds=time.time() - start,
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Multi-persona interrogation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/shadow/run-groups/{run_group_id}",
    response_model=list[RunGroupSummary],
    tags=["Shadow Agent", "Multi-Persona"],
)
async def get_run_group_summary(run_group_id: UUID):
    """
    Get summary of a batch run group.
    
    Returns aggregated counts by persona, enabling comparison
    of how different reviewer perspectives assess the same content.
    """
    records = await db.fetch(sql_run_groups.SQL_GET_RUN_GROUP_SUMMARY, run_group_id)
    if not records:
        raise HTTPException(status_code=404, detail="Run group not found")
    return [RunGroupSummary(**dict(r)) for r in records]


@app.get(
    "/shadow/cross-persona-disagreements",
    response_model=CrossPersonaAnalysisResponse,
    tags=["Shadow Agent", "Multi-Persona"],
)
async def get_cross_persona_disagreements(limit: int = Query(default=50, ge=1, le=500)):
    """
    Find fragments where different personas disagree on risk status.
    
    These disagreements flag content for human review - where
    a Stats reviewer sees RED but Clinical sees GREEN indicates
    nuanced regulatory risk that needs expert judgment.
    """
    records = await db.fetch(sql_run_groups.SQL_GET_CROSS_PERSONA_DISAGREEMENTS, limit)
    return CrossPersonaAnalysisResponse(
        total_disagreements=len(records),
        disagreements=[CrossPersonaDisagreement(**dict(r)) for r in records],
    )


# =============================================================================
# Snapshot Export Manifest (Migration 008)
# =============================================================================

from .models import (
    ExportManifestRequest,
    ExportManifestResponse,
    ExportHistoryItem,
    ExportHistoryResponse,
    IntegrityVerificationResponse,
    SnapshotManifest,
    GateMetricsExport,
    FragmentExport,
    TruthCitationExport,
)
from . import sql_exports
import hashlib


@app.post(
    "/snapshots/{snapshot_id}/export-manifest",
    response_model=ExportManifestResponse,
    tags=["Snapshots", "Export"],
)
async def export_snapshot_manifest(
    snapshot_id: UUID,
    data: ExportManifestRequest = ExportManifestRequest(),
    x_user: str = Header(default="system", alias="X-User"),
    x_request_id: str = Header(default=None, alias="X-Request-Id"),
):
    """
    Generate and optionally persist an export manifest for a snapshot.
    
    The manifest is a reproducible artifact containing:
    - Snapshot header and status
    - Gate metrics
    - Each fragment with: prose version, truth citations, audit results
    - SHA-256 integrity hash
    
    Use for:
    - Internal governance (RegOps gates)
    - External assembly workflows
    - Audit defense ("this is what we froze")
    """
    import json
    from datetime import datetime
    
    try:
        async with db.get_connection() as conn:
            # Set attribution
            await conn.execute(f"SET LOCAL app.user = '{x_user}'")
            if x_request_id:
                await conn.execute(f"SET LOCAL app.request_id = '{x_request_id}'")
            
            # Get snapshot header
            snapshot = await conn.fetchrow(sql_exports.SQL_GET_SNAPSHOT_HEADER, snapshot_id)
            if not snapshot:
                raise HTTPException(status_code=404, detail="Snapshot not found")
            
            # Get gate metrics
            gate_record = await conn.fetchrow(sql_exports.SQL_GET_SNAPSHOT_GATE_METRICS, snapshot_id)
            gate_metrics = None
            if gate_record:
                gate_metrics = GateMetricsExport(
                    overall_status=gate_record.get("overall_status"),
                    red_count=gate_record.get("red_count", 0),
                    amber_count=gate_record.get("amber_count", 0),
                    green_count=gate_record.get("green_count", 0),
                    avg_drift=gate_record.get("avg_drift"),
                    max_drift=gate_record.get("max_drift"),
                )
            
            # Get fragments with content
            frag_records = await conn.fetch(sql_exports.SQL_GET_SNAPSHOT_FRAGMENTS_WITH_CONTENT, snapshot_id)
            
            # Get fragment IDs for truth citation lookup
            fragment_ids = [r["fragment_id"] for r in frag_records if r["fragment_id"]]
            
            # Get truth citations for all fragments
            citations_by_fragment: dict[int, list[TruthCitationExport]] = {}
            if fragment_ids:
                citation_records = await conn.fetch(sql_exports.SQL_GET_FRAGMENT_TRUTH_CITATIONS, fragment_ids)
                for cr in citation_records:
                    fid = cr["fragment_id"]
                    if fid not in citations_by_fragment:
                        citations_by_fragment[fid] = []
                    citations_by_fragment[fid].append(TruthCitationExport(
                        truth_id=cr["truth_id"],
                        link_type=cr["link_type"],
                        truth_type=cr.get("truth_type"),
                        source_reference=cr.get("source_reference"),
                        numeric_value=cr.get("numeric_value"),
                        confidence_score=cr.get("confidence_score"),
                    ))
            
            # Build fragment exports
            fragments = []
            for fr in frag_records:
                fid = fr["fragment_id"]
                fragments.append(FragmentExport(
                    fragment_id=fid,
                    version_id=fr["version_id"],
                    ectd_section_path=fr["ectd_section_path"] or "",
                    jurisdiction=fr["jurisdiction"] or "Global",
                    content_prose=fr["content_prose"],
                    audit_log_id=fr.get("audit_log_id"),
                    risk_status=fr.get("risk_status"),
                    drift_magnitude=fr.get("drift_magnitude"),
                    truth_citations=citations_by_fragment.get(fid, []),
                ))
            
            # Build manifest
            manifest = SnapshotManifest(
                manifest_version="1.0.0",
                generated_at=datetime.utcnow(),
                snapshot={
                    "id": str(snapshot["id"]),
                    "label": snapshot["label"],
                    "status": snapshot["status"],
                    "jurisdiction": snapshot.get("jurisdiction"),
                    "agency_code": snapshot.get("agency_code"),
                    "frozen_at": snapshot.get("frozen_at").isoformat() if snapshot.get("frozen_at") else None,
                    "created_by": snapshot.get("created_by"),
                },
                gate_metrics=gate_metrics,
                fragments=fragments,
            )
            
            # Calculate SHA-256 of canonical JSON
            manifest_json = manifest.model_dump_json(indent=None)
            sha256 = hashlib.sha256(manifest_json.encode()).hexdigest()
            
            export_id = None
            if data.persist:
                # Persist export record
                export_record = await conn.fetchrow(
                    sql_exports.SQL_INSERT_EXPORT_RECORD,
                    snapshot_id,
                    data.export_format,
                    sha256,
                    manifest_json,
                    data.export_purpose,
                    data.export_destination,
                )
                export_id = export_record["id"]
            
            return ExportManifestResponse(
                export_id=export_id,
                snapshot_id=snapshot_id,
                manifest_sha256=sha256,
                manifest=manifest,
                persisted=data.persist,
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Export manifest generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/exports/history",
    response_model=ExportHistoryResponse,
    tags=["Export"],
)
async def list_export_history(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    List export history across all snapshots.
    
    Shows all persisted export manifests for audit trail purposes.
    """
    records = await db.fetch(sql_exports.SQL_GET_EXPORT_HISTORY, limit, offset)
    return ExportHistoryResponse(
        total=len(records),
        items=[ExportHistoryItem(**dict(r)) for r in records],
    )


@app.get(
    "/snapshots/{snapshot_id}/exports",
    response_model=ExportHistoryResponse,
    tags=["Snapshots", "Export"],
)
async def list_snapshot_exports(snapshot_id: UUID):
    """List all exports for a specific snapshot."""
    records = await db.fetch(sql_exports.SQL_GET_EXPORTS_FOR_SNAPSHOT, snapshot_id)
    return ExportHistoryResponse(
        total=len(records),
        items=[ExportHistoryItem(**dict(r)) for r in records],
    )


@app.get(
    "/exports/{export_id}/verify",
    response_model=IntegrityVerificationResponse,
    tags=["Export"],
)
async def verify_export_integrity(export_id: UUID):
    """
    Verify integrity of an export manifest.
    
    Re-computes SHA-256 of stored manifest JSON and compares
    against stored hash. Returns VALID or TAMPERED status.
    """
    record = await db.fetchrow(sql_exports.SQL_VERIFY_MANIFEST_INTEGRITY, export_id)
    if not record:
        raise HTTPException(status_code=404, detail="Export not found")
    
    return IntegrityVerificationResponse(
        export_id=record["export_id"],
        manifest_sha256=record["manifest_sha256"],
        computed_sha256=record["computed_sha256"],
        integrity_status=record["integrity_status"],
    )


# =============================================================================
# E-Signatures + Submission Gate (Migration 009 - Part 11 Support)
# =============================================================================

from .models import (
    SignedObjectType,
    SignatureMeaning,
    SignatureMethod,
    ESignatureCreate,
    ESignatureResponse,
    SignatureStatusItem,
    ExportSignoffStatus,
    SubmissionReadiness,
    SubmitSnapshotRequest,
    SubmitSnapshotResponse,
    SubmissionEventResponse,
    PendingSubmissionItem,
    PendingSubmissionsResponse,
    RecentSubmissionItem,
    RecentSubmissionsResponse,
)
from . import sql_esign


@app.post(
    "/exports/{export_id}/sign",
    response_model=ESignatureResponse,
    tags=["E-Signatures", "Submission"],
)
async def sign_export(
    export_id: UUID,
    data: ESignatureCreate,
    x_user: str = Header(default="system", alias="X-User"),
    x_request_id: str = Header(default=None, alias="X-Request-Id"),
):
    """
    Add an electronic signature to an export manifest.
    
    This is a Part 11-supporting signature manifestation record.
    Signatures are immutable and append-only.
    
    The signature binds the signer's identity and role to the specific
    export artifact (identified by SHA-256 hash).
    
    Common workflow:
    1. QA signs with meaning=APPROVE
    2. RA signs with meaning=APPROVE
    3. Once all required signatures are collected, snapshot can be submitted
    """
    import json
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                # Set attribution
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                if x_request_id:
                    await conn.execute(f"SET LOCAL app.request_id = '{x_request_id}'")
                
                # Get export to verify it exists and get its hash
                export = await conn.fetchrow(sql_exports.SQL_GET_EXPORT_BY_ID, export_id)
                if not export:
                    raise HTTPException(status_code=404, detail="Export not found")
                
                manifest_sha256 = export["manifest_sha256"]
                
                # Prepare signature payload with additional context
                payload = data.signature_payload.copy()
                payload["export_sha256"] = manifest_sha256
                
                # Insert signature
                record = await conn.fetchrow(
                    sql_esign.SQL_INSERT_E_SIGNATURE,
                    "SNAPSHOT_EXPORT",  # signed_object_type
                    export_id,           # signed_object_id
                    x_user,              # signer_identity
                    data.signer_role,    # signer_role
                    data.meaning.value,  # meaning
                    data.signature_method.value,  # signature_method
                    data.signature_statement,     # signature_statement
                    manifest_sha256,     # signature_hash (binds to artifact)
                    json.dumps(payload), # signature_payload
                )
                
                # Log the signature event
                await conn.execute(
                    sql_esign.SQL_INSERT_SUBMISSION_EVENT,
                    export["snapshot_id"],
                    export_id,
                    "SIGNATURE_ADDED",
                    json.dumps({
                        "signer": x_user,
                        "role": data.signer_role,
                        "meaning": data.meaning.value,
                    }),
                )
                
                return ESignatureResponse(
                    id=record["id"],
                    signed_object_type="SNAPSHOT_EXPORT",
                    signed_object_id=export_id,
                    signer_identity=x_user,
                    signer_role=data.signer_role,
                    meaning=data.meaning.value,
                    signature_method=data.signature_method.value,
                    signature_statement=data.signature_statement,
                    signature_hash=manifest_sha256,
                    signature_payload=payload,
                    signed_at=record["signed_at"],
                    request_id=record.get("request_id"),
                )
                
    except HTTPException:
        raise
    except Exception as e:
        if "e_signatures_unique_role_meaning_per_object" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"Signature already exists for role {data.signer_role} with meaning {data.meaning.value}"
            )
        logger.exception("Failed to sign export")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/exports/{export_id}/signatures",
    response_model=list[ESignatureResponse],
    tags=["E-Signatures"],
)
async def get_export_signatures(export_id: UUID):
    """
    List all signatures on an export.
    
    Shows who signed, when, in what role, and with what meaning.
    """
    records = await db.fetch(sql_esign.SQL_GET_SIGNATURES_FOR_EXPORT, export_id)
    return [
        ESignatureResponse(
            id=r["id"],
            signed_object_type=r["signed_object_type"],
            signed_object_id=r["signed_object_id"],
            signer_identity=r["signer_identity"],
            signer_role=r["signer_role"],
            meaning=r["meaning"],
            signature_method=r["signature_method"],
            signature_statement=r.get("signature_statement"),
            signature_hash=r.get("signature_hash"),
            signature_payload=r.get("signature_payload", {}),
            signed_at=r["signed_at"],
            request_id=r.get("request_id"),
        )
        for r in records
    ]


@app.get(
    "/exports/{export_id}/signoff-status",
    response_model=ExportSignoffStatus,
    tags=["E-Signatures", "Submission"],
)
async def get_export_signoff_status(export_id: UUID):
    """
    Get comprehensive signoff status for an export.
    
    Shows all signatures collected and counts by type.
    """
    record = await db.fetchrow(sql_esign.SQL_GET_EXPORT_SIGNOFF_STATUS, export_id)
    if not record:
        raise HTTPException(status_code=404, detail="Export not found")
    
    signatures = []
    if record["signatures"]:
        for sig in record["signatures"]:
            signatures.append(SignatureStatusItem(
                signature_id=sig["signature_id"],
                signer_identity=sig["signer_identity"],
                signer_role=sig["signer_role"],
                meaning=sig["meaning"],
                signed_at=sig["signed_at"],
                method=sig["method"],
                statement=sig.get("statement"),
            ))
    
    return ExportSignoffStatus(
        export_id=record["export_id"],
        snapshot_id=record["snapshot_id"],
        manifest_sha256=record["manifest_sha256"],
        export_format=record["export_format"],
        export_created_at=record["export_created_at"],
        export_created_by=record["export_created_by"],
        signatures=signatures,
        approve_count=record["approve_count"] or 0,
        review_count=record["review_count"] or 0,
        author_count=record["author_count"] or 0,
    )


@app.get(
    "/snapshots/{snapshot_id}/submission-readiness",
    response_model=SubmissionReadiness,
    tags=["Submission"],
)
async def get_snapshot_submission_readiness(snapshot_id: UUID):
    """
    Check if a snapshot is ready for submission.
    
    Shows:
    - Required approver roles
    - Which roles have signed
    - Which roles are missing
    - Whether submission is allowed
    """
    record = await db.fetchrow(sql_esign.SQL_GET_SNAPSHOT_SUBMISSION_READINESS, snapshot_id)
    if not record:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    return SubmissionReadiness(
        snapshot_id=record["snapshot_id"],
        snapshot_label=record["snapshot_label"],
        status=record["status"],
        jurisdiction=record.get("jurisdiction"),
        required_approver_roles=record["required_approver_roles"] or [],
        required_approval_meaning=record.get("required_approval_meaning", "APPROVE"),
        submitted_export_id=record.get("submitted_export_id"),
        latest_export_id=record.get("latest_export_id"),
        latest_export_sha256=record.get("latest_export_sha256"),
        latest_export_at=record.get("latest_export_at"),
        signed_roles=record.get("signed_roles") or [],
        missing_roles=record.get("missing_roles") or [],
        ready_to_submit=record.get("ready_to_submit", False),
    )


@app.post(
    "/snapshots/{snapshot_id}/submit",
    response_model=SubmitSnapshotResponse,
    tags=["Submission"],
)
async def submit_snapshot(
    snapshot_id: UUID,
    data: SubmitSnapshotRequest,
    x_user: str = Header(default="system", alias="X-User"),
    x_request_id: str = Header(default=None, alias="X-Request-Id"),
):
    """
    Submit a frozen snapshot for regulatory submission.
    
    This is the promotion gate: FROZEN → SUBMITTED.
    
    **Database-enforced requirements:**
    - Snapshot must be FROZEN
    - export_id must belong to this snapshot
    - All required approver roles must have signed with required meaning
    
    If any requirement is missing, the DB will reject the transition.
    This is a HARD GATE that cannot be bypassed by application code.
    """
    import json
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                # Set attribution
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                if x_request_id:
                    await conn.execute(f"SET LOCAL app.request_id = '{x_request_id}'")
                
                # Log the submission attempt
                await conn.execute(
                    sql_esign.SQL_INSERT_SUBMISSION_EVENT,
                    snapshot_id,
                    data.export_id,
                    "SUBMISSION_ATTEMPTED",
                    json.dumps({"user": x_user}),
                )
                
                # Attempt the submission - DB trigger will enforce requirements
                result = await conn.fetchrow(
                    sql_esign.SQL_SUBMIT_SNAPSHOT,
                    snapshot_id,
                    data.export_id,
                )
                
                if not result:
                    # Snapshot wasn't updated - check why
                    snapshot = await conn.fetchrow(
                        sql_esign.SQL_GET_SNAPSHOT_FOR_SUBMISSION,
                        snapshot_id,
                    )
                    if not snapshot:
                        raise HTTPException(status_code=404, detail="Snapshot not found")
                    if snapshot["status"] != "FROZEN":
                        raise HTTPException(
                            status_code=400,
                            detail=f"Snapshot is {snapshot['status']}, must be FROZEN to submit"
                        )
                    raise HTTPException(status_code=500, detail="Submission failed for unknown reason")
                
                # Log success
                await conn.execute(
                    sql_esign.SQL_INSERT_SUBMISSION_EVENT,
                    snapshot_id,
                    data.export_id,
                    "SUBMISSION_SUCCEEDED",
                    json.dumps({"user": x_user, "export_id": str(data.export_id)}),
                )
                
                return SubmitSnapshotResponse(
                    snapshot_id=result["id"],
                    snapshot_label=result["label"],
                    status=result["status"],
                    submitted_export_id=result["submitted_export_id"],
                    submitted_at=result["updated_at"],
                    success=True,
                )
                
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        # Log the blocked submission
        try:
            await db.execute(
                sql_esign.SQL_INSERT_SUBMISSION_EVENT,
                snapshot_id,
                data.export_id,
                "SUBMISSION_BLOCKED",
                json.dumps({"user": x_user, "error": error_str}),
            )
        except:
            pass
        
        # Parse DB error messages for user-friendly responses
        if "Missing required" in error_str:
            raise HTTPException(status_code=403, detail=error_str)
        if "submitted_export_id" in error_str:
            raise HTTPException(status_code=400, detail=error_str)
        if "does not belong to snapshot" in error_str:
            raise HTTPException(status_code=400, detail=error_str)
            
        logger.exception("Snapshot submission failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/snapshots/{snapshot_id}/submission-events",
    response_model=list[SubmissionEventResponse],
    tags=["Submission"],
)
async def get_submission_events(
    snapshot_id: UUID,
    limit: int = Query(default=50, ge=1, le=500),
):
    """
    Get submission workflow events for a snapshot.
    
    Shows the audit trail of export creation, signatures, and submission attempts.
    """
    records = await db.fetch(sql_esign.SQL_GET_SUBMISSION_EVENTS, snapshot_id, limit)
    return [
        SubmissionEventResponse(
            id=r["id"],
            snapshot_id=r["snapshot_id"],
            export_id=r.get("export_id"),
            event_type=r["event_type"],
            event_details=r.get("event_details", {}),
            actor=r["actor"],
            created_at=r["created_at"],
            request_id=r.get("request_id"),
        )
        for r in records
    ]


@app.get(
    "/submissions/pending",
    response_model=PendingSubmissionsResponse,
    tags=["Submission"],
)
async def list_pending_submissions():
    """
    List all snapshots pending submission.
    
    Shows frozen snapshots with exports that are awaiting signatures.
    """
    records = await db.fetch(sql_esign.SQL_GET_PENDING_SUBMISSIONS)
    items = [
        PendingSubmissionItem(
            snapshot_id=r["snapshot_id"],
            label=r["label"],
            status=r["status"],
            jurisdiction=r.get("jurisdiction"),
            frozen_at=r.get("frozen_at"),
            required_approver_roles=r.get("required_approver_roles") or [],
            latest_export_id=r.get("latest_export_id"),
            signed_roles=r.get("signed_roles") or [],
            missing_roles=r.get("missing_roles") or [],
            ready_to_submit=r.get("ready_to_submit", False),
        )
        for r in records
    ]
    return PendingSubmissionsResponse(total=len(items), items=items)


@app.get(
    "/submissions/recent",
    response_model=RecentSubmissionsResponse,
    tags=["Submission"],
)
async def list_recent_submissions(limit: int = Query(default=20, ge=1, le=100)):
    """
    List recently submitted snapshots.
    
    Shows snapshots that have completed the submission workflow.
    """
    records = await db.fetch(sql_esign.SQL_GET_RECENT_SUBMISSIONS, limit)
    items = [
        RecentSubmissionItem(
            snapshot_id=r["snapshot_id"],
            label=r["label"],
            status=r["status"],
            jurisdiction=r.get("jurisdiction"),
            submitted_export_id=r.get("submitted_export_id"),
            submitted_at=r.get("submitted_at"),
            manifest_sha256=r.get("manifest_sha256"),
            approvers=r.get("approvers"),
        )
        for r in records
    ]
    return RecentSubmissionsResponse(total=len(items), items=items)


# =============================================================================
# Program Scoping Endpoints (Migration 010)
# =============================================================================

from .models import (
    ProgramCreate,
    ProgramResponse,
    ProgramUpdate,
    ProgramListResponse,
    MembershipCreate,
    MembershipResponse,
    MembershipListResponse,
    AccessCheckResponse,
    SessionContextRequest,
    SessionContextResponse,
    ConfigBundleCreate,
    ConfigBundleResponse,
    ConfigBundleListResponse,
    GetOrCreateBundleResponse,
)
from . import sql_programs


@app.post(
    "/programs",
    response_model=ProgramResponse,
    tags=["Programs"],
)
async def create_program(
    data: ProgramCreate,
    x_user: str = Header(default="system", alias="X-User"),
):
    """
    Create a new program (asset/product/sponsor workspace).
    
    Programs are the foundation for multi-tenant access control.
    All major records (truth, fragments, snapshots, etc.) belong to a program.
    """
    import json
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                
                metadata_json = json.dumps(data.metadata) if data.metadata else None
                
                record = await conn.fetchrow(
                    sql_programs.SQL_CREATE_PROGRAM,
                    str(data.id) if data.id else None,
                    data.program_code,
                    data.program_name,
                    data.sponsor_name,
                    data.substance_id,
                    data.therapeutic_area,
                    data.indication,
                    data.phase,
                    data.status.value if data.status else None,
                    metadata_json,
                )
                
                return ProgramResponse(**dict(record))
    except Exception as e:
        logger.exception("Failed to create program")
        if "duplicate key" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Program code already exists")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/programs/{program_id}",
    response_model=ProgramResponse,
    tags=["Programs"],
)
async def get_program(program_id: UUID):
    """Get a program by ID."""
    record = await db.fetchrow(sql_programs.SQL_GET_PROGRAM, program_id)
    if not record:
        raise HTTPException(status_code=404, detail="Program not found")
    return ProgramResponse(**dict(record))


@app.get(
    "/programs/code/{program_code}",
    response_model=ProgramResponse,
    tags=["Programs"],
)
async def get_program_by_code(program_code: str):
    """Get a program by its unique code."""
    record = await db.fetchrow(sql_programs.SQL_GET_PROGRAM_BY_CODE, program_code)
    if not record:
        raise HTTPException(status_code=404, detail="Program not found")
    return ProgramResponse(**dict(record))


@app.get(
    "/programs",
    response_model=ProgramListResponse,
    tags=["Programs"],
)
async def list_programs(
    status: str = Query(None, description="Filter by status (ACTIVE, ARCHIVED, SUSPENDED)")
):
    """List all programs, optionally filtered by status."""
    records = await db.fetch(sql_programs.SQL_LIST_PROGRAMS, status)
    items = [
        ProgramResponse(
            id=r["id"],
            program_code=r["program_code"],
            program_name=r.get("program_name"),
            sponsor_name=r.get("sponsor_name"),
            substance_id=r.get("substance_id"),
            therapeutic_area=r.get("therapeutic_area"),
            indication=r.get("indication"),
            phase=r.get("phase"),
            status=r["status"],
            metadata=r.get("metadata"),
            created_at=r["created_at"],
            created_by=r["created_by"],
            updated_at=r.get("updated_at"),
            member_count=r.get("member_count"),
        )
        for r in records
    ]
    return ProgramListResponse(total=len(items), items=items)


@app.patch(
    "/programs/{program_id}",
    response_model=ProgramResponse,
    tags=["Programs"],
)
async def update_program(
    program_id: UUID,
    data: ProgramUpdate,
    x_user: str = Header(default="system", alias="X-User"),
):
    """Update a program's metadata."""
    import json
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                
                metadata_json = json.dumps(data.metadata) if data.metadata else None
                
                record = await conn.fetchrow(
                    sql_programs.SQL_UPDATE_PROGRAM,
                    program_id,
                    data.program_name,
                    data.sponsor_name,
                    data.substance_id,
                    data.therapeutic_area,
                    data.indication,
                    data.phase,
                    data.status.value if data.status else None,
                    metadata_json,
                )
                
                if not record:
                    raise HTTPException(status_code=404, detail="Program not found")
                
                return ProgramResponse(**dict(record))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update program")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/programs/global/id",
    tags=["Programs"],
)
async def get_global_program_id():
    """Get the deterministic UUID for the GLOBAL program."""
    record = await db.fetchrow(sql_programs.SQL_GET_GLOBAL_PROGRAM_ID)
    return {"global_program_id": record["global_program_id"]}


# =============================================================================
# Program Membership Endpoints
# =============================================================================

@app.post(
    "/memberships",
    response_model=MembershipResponse,
    tags=["Programs", "Memberships"],
)
async def add_membership(
    data: MembershipCreate,
    x_user: str = Header(default="system", alias="X-User"),
):
    """
    Add or update a user's membership in a program.
    
    This grants the user access to the program with the specified role and access level.
    If the membership already exists, it will be reactivated/updated.
    """
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                
                record = await conn.fetchrow(
                    sql_programs.SQL_ADD_MEMBERSHIP,
                    data.user_identity,
                    data.program_id,
                    data.membership_role.value,
                    data.access_level.value if data.access_level else None,
                    data.expires_at,
                    data.notes,
                )
                
                return MembershipResponse(**dict(record))
    except Exception as e:
        logger.exception("Failed to add membership")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete(
    "/memberships/{user_identity}/{program_id}/{role}",
    tags=["Programs", "Memberships"],
)
async def revoke_membership(
    user_identity: str,
    program_id: UUID,
    role: str,
    x_user: str = Header(default="system", alias="X-User"),
):
    """Revoke (deactivate) a user's membership."""
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                
                record = await conn.fetchrow(
                    sql_programs.SQL_REVOKE_MEMBERSHIP,
                    user_identity,
                    program_id,
                    role,
                )
                
                if not record:
                    raise HTTPException(status_code=404, detail="Membership not found")
                
                return {"status": "revoked", "membership_id": record["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to revoke membership")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/memberships/user/{user_identity}",
    response_model=MembershipListResponse,
    tags=["Programs", "Memberships"],
)
async def get_user_memberships(
    user_identity: str,
    include_inactive: bool = Query(False, description="Include inactive memberships"),
):
    """Get all program memberships for a user."""
    records = await db.fetch(
        sql_programs.SQL_GET_USER_MEMBERSHIPS,
        user_identity,
        None if include_inactive else True,
    )
    items = [MembershipResponse(**dict(r)) for r in records]
    return MembershipListResponse(total=len(items), items=items)


@app.get(
    "/memberships/program/{program_id}",
    response_model=MembershipListResponse,
    tags=["Programs", "Memberships"],
)
async def get_program_members(
    program_id: UUID,
    include_inactive: bool = Query(False, description="Include inactive memberships"),
):
    """Get all members of a program."""
    records = await db.fetch(
        sql_programs.SQL_GET_PROGRAM_MEMBERS,
        program_id,
        include_inactive,
    )
    items = [MembershipResponse(**dict(r)) for r in records]
    return MembershipListResponse(total=len(items), items=items)


@app.get(
    "/access/check/{program_id}",
    response_model=AccessCheckResponse,
    tags=["Programs", "Access Control"],
)
async def check_access(
    program_id: UUID,
    x_user: str = Header(default="system", alias="X-User"),
):
    """
    Check if the current user can access a program.
    
    This simulates RLS policy evaluation by setting session context
    and calling the access-check functions.
    """
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                
                access_record = await conn.fetchrow(sql_programs.SQL_CHECK_ACCESS, program_id)
                write_record = await conn.fetchrow(sql_programs.SQL_CHECK_WRITE_ACCESS, program_id)
                
                return AccessCheckResponse(
                    program_id=program_id,
                    can_access=access_record["can_access"],
                    can_write=write_record["can_write"],
                )
    except Exception as e:
        logger.exception("Failed to check access")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Config Bundle Endpoints (Migration 011)
# =============================================================================

@app.post(
    "/config-bundles",
    response_model=ConfigBundleResponse,
    tags=["Config Bundles", "Reproducibility"],
)
async def create_config_bundle(
    data: ConfigBundleCreate,
    x_user: str = Header(default="system", alias="X-User"),
    x_request_id: str = Header(default=None, alias="X-Request-Id"),
):
    """
    Create a new configuration bundle (append-only).
    
    Config bundles capture the exact configuration used for AI decisions,
    enabling reproducibility and audit trail for Part 11 compliance.
    
    If a bundle with the same content (SHA-256) already exists, returns the existing one.
    """
    import hashlib
    import json
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                if x_request_id:
                    await conn.execute(f"SET LOCAL app.request_id = '{x_request_id}'")
                
                # Calculate SHA-256 of canonical JSON
                canonical_json = json.dumps(data.bundle_json, sort_keys=True, separators=(',', ':'))
                bundle_sha256 = hashlib.sha256(canonical_json.encode()).hexdigest()
                
                # Try to insert (will do nothing on conflict)
                record = await conn.fetchrow(
                    sql_programs.SQL_CREATE_CONFIG_BUNDLE,
                    data.bundle_name,
                    data.bundle_version,
                    data.bundle_type.value,
                    bundle_sha256,
                    canonical_json,
                )
                
                # If no record returned, the bundle already exists
                if not record:
                    record = await conn.fetchrow(
                        sql_programs.SQL_GET_CONFIG_BUNDLE_BY_SHA,
                        bundle_sha256,
                    )
                
                result = dict(record)
                result["bundle_json"] = data.bundle_json
                return ConfigBundleResponse(**result)
    except Exception as e:
        logger.exception("Failed to create config bundle")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/config-bundles/get-or-create",
    response_model=GetOrCreateBundleResponse,
    tags=["Config Bundles", "Reproducibility"],
)
async def get_or_create_config_bundle(
    data: ConfigBundleCreate,
    x_user: str = Header(default="system", alias="X-User"),
):
    """
    Get existing config bundle by content hash, or create if not exists.
    
    Returns the bundle ID and whether it was newly created.
    This is the recommended way to register config bundles for reproducibility.
    """
    import hashlib
    import json
    
    try:
        async with db.get_connection() as conn:
            async with conn.transaction():
                await conn.execute(f"SET LOCAL app.user = '{x_user}'")
                
                # Calculate SHA-256
                canonical_json = json.dumps(data.bundle_json, sort_keys=True, separators=(',', ':'))
                bundle_sha256 = hashlib.sha256(canonical_json.encode()).hexdigest()
                
                # Check if exists
                existing = await conn.fetchrow(
                    sql_programs.SQL_GET_CONFIG_BUNDLE_BY_SHA,
                    bundle_sha256,
                )
                
                if existing:
                    return GetOrCreateBundleResponse(
                        bundle_id=existing["id"],
                        created=False,
                        bundle_sha256=bundle_sha256,
                    )
                
                # Create new
                record = await conn.fetchrow(
                    sql_programs.SQL_CREATE_CONFIG_BUNDLE,
                    data.bundle_name,
                    data.bundle_version,
                    data.bundle_type.value,
                    bundle_sha256,
                    canonical_json,
                )
                
                return GetOrCreateBundleResponse(
                    bundle_id=record["id"],
                    created=True,
                    bundle_sha256=bundle_sha256,
                )
    except Exception as e:
        logger.exception("Failed to get or create config bundle")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/config-bundles/{bundle_id}",
    response_model=ConfigBundleResponse,
    tags=["Config Bundles", "Reproducibility"],
)
async def get_config_bundle(bundle_id: UUID):
    """Get a config bundle by ID, including full JSON payload."""
    record = await db.fetchrow(sql_programs.SQL_GET_CONFIG_BUNDLE, bundle_id)
    if not record:
        raise HTTPException(status_code=404, detail="Config bundle not found")
    return ConfigBundleResponse(**dict(record))


@app.get(
    "/config-bundles/sha/{sha256}",
    response_model=ConfigBundleResponse,
    tags=["Config Bundles", "Reproducibility"],
)
async def get_config_bundle_by_sha(sha256: str):
    """Get a config bundle by its SHA-256 hash."""
    record = await db.fetchrow(sql_programs.SQL_GET_CONFIG_BUNDLE_BY_SHA, sha256)
    if not record:
        raise HTTPException(status_code=404, detail="Config bundle not found")
    return ConfigBundleResponse(**dict(record))


@app.get(
    "/config-bundles",
    response_model=ConfigBundleListResponse,
    tags=["Config Bundles", "Reproducibility"],
)
async def list_config_bundles(
    bundle_type: str = Query(None, description="Filter by bundle type"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results"),
):
    """List config bundles (without full JSON payload for efficiency)."""
    records = await db.fetch(sql_programs.SQL_LIST_CONFIG_BUNDLES, bundle_type, limit)
    items = [ConfigBundleResponse(**dict(r)) for r in records]
    return ConfigBundleListResponse(total=len(items), items=items)


@app.get(
    "/config-bundles/{bundle_id}/usage",
    tags=["Config Bundles", "Reproducibility"],
)
async def get_config_bundle_usage(bundle_id: UUID):
    """Get usage statistics for a config bundle."""
    record = await db.fetchrow(sql_programs.SQL_GET_CONFIG_BUNDLE_USAGE, bundle_id)
    if not record:
        raise HTTPException(status_code=404, detail="Config bundle not found")
    return dict(record)


# =============================================================================
# Session Context Endpoint
# =============================================================================

@app.post(
    "/session/context",
    response_model=SessionContextResponse,
    tags=["Session", "Programs"],
)
async def set_session_context(data: SessionContextRequest):
    """
    Set session context for subsequent operations.
    
    This is primarily for testing RLS policies. In production,
    context should be set automatically by middleware based on auth token.
    
    Returns the configured context plus the GLOBAL program ID for reference.
    """
    try:
        async with db.get_connection() as conn:
            await conn.execute(
                sql_programs.SQL_SET_SESSION_CONTEXT,
                data.user,
                str(data.program_id),
                data.request_id,
            )
            
            global_record = await conn.fetchrow(sql_programs.SQL_GET_GLOBAL_PROGRAM_ID)
            
            return SessionContextResponse(
                user=data.user,
                program_id=data.program_id,
                request_id=data.request_id,
                global_program_id=global_record["global_program_id"],
            )
    except Exception as e:
        logger.exception("Failed to set session context")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Legacy Dashboard Endpoints (for compatibility)
# =============================================================================


@app.get("/dashboard/section-rollup", tags=["Dashboard"])
async def dashboard_section_rollup():
    """Legacy endpoint: Get section risk rollup."""
    records = await db.fetch(sql_heatmap.SELECT_SECTION_ROLLUP, None, None)
    # Convert to list of dicts for JSON serialization
    return [dict(r) for r in records]


@app.get("/dashboard/jurisdiction-rollup", tags=["Dashboard"])
async def dashboard_jurisdiction_rollup():
    """Legacy endpoint: Get jurisdiction risk rollup."""
    records = await db.fetch(sql_heatmap.SELECT_JURISDICTION_ROLLUP)
    return [dict(r) for r in records]


# =============================================================================
# Entry Point
# =============================================================================

def run():
    """Run the service using uvicorn."""
    uvicorn.run(
        "shadow_service.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    run()
