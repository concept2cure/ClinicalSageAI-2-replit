"""
FastAPI router for drift monitoring endpoints.
Fully implemented with database integration.
"""
import logging
from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Query, HTTPException, Header

from . import db
from .db import LiteModeError
from . import sql_drift as sql
from .models_drift import (
    DriftJob, DriftJobList, DriftJobCreate, DriftJobStatusUpdate,
    DriftRun, DriftRunList, DriftRunCreate, DriftRunComplete,
    DriftAlert, DriftAlertList, DriftAlertCreate, AlertAcknowledge, AlertResolve,
    AlertSummary, AlertSummaryItem, DriftHistoryList, SectionTrendList,
    JobStatus, AlertStatus, AlertSeverity
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drift", tags=["Drift Monitoring"])


def _handle_lite_mode(e: LiteModeError):
    """Convert LiteModeError to HTTP 503."""
    raise HTTPException(status_code=503, detail="Database not available. Service running in lite mode.")


# =============================================================================
# Drift Jobs
# =============================================================================

@router.get("/jobs", response_model=DriftJobList)
async def list_drift_jobs(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """List all drift monitoring jobs."""
    try:
        records = await db.fetch(sql.SQL_LIST_DRIFT_JOBS, is_active, program_id)
        items = [DriftJob(**dict(r)) for r in records]
        return DriftJobList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list drift jobs")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}", response_model=DriftJob)
async def get_drift_job(job_id: UUID):
    """Get a specific drift job by ID."""
    try:
        record = await db.fetchrow(sql.SQL_GET_DRIFT_JOB, job_id)
        if not record:
            raise HTTPException(status_code=404, detail="Job not found")
        return DriftJob(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get drift job")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs", response_model=DriftJob, status_code=201)
async def create_drift_job(
    data: DriftJobCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Create a new drift monitoring job."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_DRIFT_JOB,
                data.job_type.value if data.job_type else 'INCREMENTAL_DRIFT',
                data.job_name,
                data.description,
                data.program_id,
                data.section_filter,
                data.jurisdiction_filter,
                data.schedule_cron,
                data.next_run_at,
                data.drift_threshold_red or 0.3,
                data.drift_threshold_amber or 0.15,
                data.config_bundle_id,
            )
        await db.release_connection(conn)
        return DriftJob(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create drift job")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/jobs/{job_id}/status", response_model=DriftJob)
async def update_drift_job_status(
    job_id: UUID, 
    data: DriftJobStatusUpdate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Update drift job status after a run."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_UPDATE_DRIFT_JOB_STATUS,
                job_id,
                data.last_run_at or datetime.utcnow(),
                data.last_run_status.value,
                data.next_run_at,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Job not found")
        return DriftJob(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update drift job status")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Drift Runs
# =============================================================================

@router.get("/jobs/{job_id}/runs", response_model=DriftRunList)
async def list_drift_runs(
    job_id: UUID,
    limit: int = Query(20, ge=1, le=100)
):
    """List runs for a specific drift job."""
    try:
        records = await db.fetch(sql.SQL_LIST_DRIFT_RUNS, job_id, limit)
        items = [DriftRun(**dict(r)) for r in records]
        return DriftRunList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list drift runs")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runs", response_model=DriftRun, status_code=201)
async def create_drift_run(
    data: DriftRunCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Start a new drift monitoring run."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_DRIFT_RUN,
                data.job_id,
                data.config_bundle_id,
            )
        await db.release_connection(conn)
        return DriftRun(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create drift run")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/runs/{run_id}/complete", response_model=DriftRun)
async def complete_drift_run(
    run_id: UUID, 
    data: DriftRunComplete,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Mark a drift run as complete with results."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_COMPLETE_DRIFT_RUN,
                run_id,
                data.status.value,
                data.fragments_checked,
                data.red_count,
                data.amber_count,
                data.green_count,
                data.error_message,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Run not found")
        return DriftRun(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to complete drift run")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Drift Alerts
# =============================================================================

@router.get("/alerts", response_model=DriftAlertList)
async def list_drift_alerts(
    status: Optional[str] = Query(None, description="Filter by status"),
    program_id: Optional[UUID] = Query(None, description="Filter by program"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    limit: int = Query(50, ge=1, le=200)
):
    """List drift alerts with optional filters."""
    try:
        records = await db.fetch(sql.SQL_LIST_DRIFT_ALERTS, status, program_id, severity, limit)
        items = [DriftAlert(**dict(r)) for r in records]
        return DriftAlertList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list drift alerts")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/summary", response_model=AlertSummary)
async def get_alerts_summary():
    """Get summary of open alerts by severity."""
    try:
        records = await db.fetch(sql.SQL_GET_OPEN_ALERTS_SUMMARY)
        items = [AlertSummaryItem(**dict(r)) for r in records]
        total = sum(item.count for item in items)
        return AlertSummary(items=items, total_open=total)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get alerts summary")
        # Return empty summary on error (table may not exist)
        return AlertSummary(items=[], total_open=0)


@router.get("/alerts/{alert_id}", response_model=DriftAlert)
async def get_drift_alert(alert_id: UUID):
    """Get a specific drift alert."""
    try:
        record = await db.fetchrow(sql.SQL_GET_DRIFT_ALERT, alert_id)
        if not record:
            raise HTTPException(status_code=404, detail="Alert not found")
        return DriftAlert(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get drift alert")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts", response_model=DriftAlert, status_code=201)
async def create_drift_alert(
    data: DriftAlertCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Create a new drift alert."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_DRIFT_ALERT,
                data.run_id,
                data.fragment_id,
                data.fragment_version_id,
                data.severity.value,
                data.drift_score,
                data.similarity_score,
                data.alert_title,
                data.alert_message,
                data.affected_truth_ids,
                data.program_id,
            )
        await db.release_connection(conn)
        return DriftAlert(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create drift alert")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/acknowledge", response_model=DriftAlert)
async def acknowledge_drift_alert(
    alert_id: UUID, 
    data: AlertAcknowledge,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Acknowledge a drift alert."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_ACKNOWLEDGE_DRIFT_ALERT,
                alert_id,
                data.notes,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Alert not found")
        return DriftAlert(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to acknowledge drift alert")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/resolve", response_model=DriftAlert)
async def resolve_drift_alert(
    alert_id: UUID, 
    data: AlertResolve,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Resolve a drift alert."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_RESOLVE_DRIFT_ALERT,
                alert_id,
                data.resolution_notes,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Alert not found")
        return DriftAlert(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to resolve drift alert")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Drift History / Trends
# =============================================================================

@router.get("/history/fragment/{fragment_id}", response_model=DriftHistoryList)
async def get_fragment_drift_history(
    fragment_id: UUID,
    days: int = Query(30, ge=1, le=365)
):
    """Get drift score history for a specific fragment."""
    try:
        records = await db.fetch(sql.SQL_GET_FRAGMENT_DRIFT_HISTORY, fragment_id, days)
        items = [dict(r) for r in records]
        return DriftHistoryList(fragment_id=fragment_id, items=items)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get fragment drift history")
        return DriftHistoryList(fragment_id=fragment_id, items=[])


@router.get("/trends/section", response_model=SectionTrendList)
async def get_section_drift_trend(
    section_path: str = Query(..., description="eCTD section path prefix"),
    days: int = Query(30, ge=1, le=365)
):
    """Get drift trend for an eCTD section."""
    try:
        records = await db.fetch(sql.SQL_GET_SECTION_DRIFT_TREND, section_path, days)
        items = [dict(r) for r in records]
        return SectionTrendList(section_path=section_path, items=items)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get section drift trend")
        return SectionTrendList(section_path=section_path, items=[])


# =============================================================================
# Enhanced Analytics & Dashboard Support
# =============================================================================

@router.get("/dashboard/summary")
async def get_drift_dashboard_summary(
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get summary statistics for drift monitoring dashboard.
    
    Returns aggregated metrics including:
    - Active jobs count
    - Total alerts by severity
    - Recent run statistics
    - Fragments at risk
    """
    try:
        # Get active job count
        jobs = await db.fetch(sql.SQL_LIST_DRIFT_JOBS, True, program_id)
        
        # Get alert summary
        alert_summary = await db.fetchrow(sql.SQL_GET_OPEN_ALERTS_SUMMARY, program_id)
        
        return {
            "active_jobs": len(jobs),
            "alerts": {
                "red": alert_summary["red_count"] if alert_summary else 0,
                "amber": alert_summary["amber_count"] if alert_summary else 0,
                "total_open": alert_summary["total_open"] if alert_summary else 0,
            },
            "last_updated": datetime.utcnow().isoformat(),
        }
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get drift dashboard summary")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-assessment/{program_id}")
async def get_program_risk_assessment(program_id: UUID):
    """Get risk assessment for a program based on drift analysis.
    
    Provides:
    - Overall drift risk score (0-100)
    - Sections with highest drift
    - Recommended remediation priorities
    """
    try:
        # Get open alerts for the program
        alerts = await db.fetch(sql.SQL_LIST_DRIFT_ALERTS, program_id, None, None, 100)
        
        # Calculate risk metrics
        red_alerts = sum(1 for a in alerts if dict(a).get('severity') == 'RED')
        amber_alerts = sum(1 for a in alerts if dict(a).get('severity') == 'AMBER')
        
        # Risk score calculation (weighted)
        risk_score = min(100, (red_alerts * 15) + (amber_alerts * 5))
        
        # Get affected sections
        affected_sections = {}
        for alert in alerts:
            section = dict(alert).get('section_path', 'Unknown')
            if section not in affected_sections:
                affected_sections[section] = {'red': 0, 'amber': 0}
            if dict(alert).get('severity') == 'RED':
                affected_sections[section]['red'] += 1
            else:
                affected_sections[section]['amber'] += 1
        
        # Sort by severity
        prioritized_sections = sorted(
            affected_sections.items(),
            key=lambda x: (x[1]['red'] * 3 + x[1]['amber']),
            reverse=True
        )[:10]
        
        return {
            "program_id": str(program_id),
            "risk_score": risk_score,
            "risk_level": "HIGH" if risk_score >= 70 else "MEDIUM" if risk_score >= 40 else "LOW",
            "open_alerts": {
                "red": red_alerts,
                "amber": amber_alerts,
                "total": len(alerts),
            },
            "prioritized_sections": [
                {
                    "section_path": section,
                    "red_alerts": counts["red"],
                    "amber_alerts": counts["amber"],
                }
                for section, counts in prioritized_sections
            ],
            "recommendations": _generate_remediation_recommendations(risk_score, red_alerts, amber_alerts),
            "assessed_at": datetime.utcnow().isoformat(),
        }
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get program risk assessment")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_remediation_recommendations(risk_score: int, red_count: int, amber_count: int) -> list[str]:
    """Generate remediation recommendations based on risk metrics."""
    recommendations = []
    
    if risk_score >= 70:
        recommendations.append("CRITICAL: Immediate review required for high-risk sections")
        recommendations.append("Schedule emergency drift remediation session")
    
    if red_count > 0:
        recommendations.append(f"Address {red_count} RED alerts as priority - truth/prose drift exceeds threshold")
    
    if amber_count > 5:
        recommendations.append(f"Review {amber_count} AMBER alerts to prevent escalation")
    
    if risk_score >= 40:
        recommendations.append("Consider increasing drift monitoring frequency")
        recommendations.append("Review source truth data for potential updates")
    
    if not recommendations:
        recommendations.append("No immediate actions required - drift levels within acceptable range")
    
    return recommendations

