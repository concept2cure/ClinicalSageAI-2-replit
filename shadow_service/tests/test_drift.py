"""
Tests for drift monitoring operations.
"""
import pytest
from datetime import datetime, date, timedelta
from uuid import uuid4
from shadow_service.models_drift import (
    DriftJob, DriftJobCreate, DriftJobList, DriftJobStatusUpdate,
    JobType, JobStatus,
    DriftRun, DriftRunCreate, DriftRunComplete, DriftRunList,
    DriftAlert, DriftAlertCreate, DriftAlertList,
    AlertAcknowledge, AlertResolve,
    AlertSeverity, AlertStatus,
    AlertSummary, AlertSummaryItem,
    DriftHistoryPoint, DriftHistoryList,
    SectionDriftTrend, SectionTrendList
)


class TestDriftJobModels:
    """Test DriftJob Pydantic models."""

    def test_drift_job_create_valid(self):
        data = DriftJobCreate(
            job_type=JobType.SCHEDULED,
            job_name="Daily Section 2.5 Drift Check",
            description="Monitor clinical overview for unauthorized changes",
            program_id=uuid4(),
            section_filter="m2/25%",
            jurisdiction_filter="FDA",
            schedule_cron="0 6 * * *",
            drift_threshold_red=0.35,
            drift_threshold_amber=0.20
        )
        assert data.job_name == "Daily Section 2.5 Drift Check"
        assert data.drift_threshold_red == 0.35

    def test_drift_job_create_minimal(self):
        data = DriftJobCreate(
            job_name="On-demand check"
        )
        assert data.job_type == JobType.SCHEDULED  # default
        assert data.drift_threshold_red == 0.35  # default
        assert data.drift_threshold_amber == 0.20  # default

    def test_drift_job_full(self):
        job = DriftJob(
            id=uuid4(),
            job_number=1,
            job_type=JobType.SCHEDULED,
            job_name="Test Job",
            drift_threshold_red=0.35,
            drift_threshold_amber=0.20,
            is_active=True,
            created_at=datetime.utcnow(),
            created_by="test_user"
        )
        assert job.is_active is True
        assert job.last_run_status is None


class TestDriftRunModels:
    """Test DriftRun Pydantic models."""

    def test_drift_run_create(self):
        job_id = uuid4()
        data = DriftRunCreate(
            job_id=job_id,
            config_bundle_id=uuid4()
        )
        assert data.job_id == job_id

    def test_drift_run_complete_success(self):
        data = DriftRunComplete(
            status=JobStatus.COMPLETED,
            fragments_checked=150,
            red_count=2,
            amber_count=8,
            green_count=140
        )
        assert data.status == JobStatus.COMPLETED
        assert data.red_count + data.amber_count + data.green_count == data.fragments_checked

    def test_drift_run_complete_failure(self):
        data = DriftRunComplete(
            status=JobStatus.FAILED,
            fragments_checked=50,
            error_message="Database connection timeout"
        )
        assert data.status == JobStatus.FAILED
        assert data.error_message is not None

    def test_drift_run_full(self):
        run = DriftRun(
            id=uuid4(),
            job_id=uuid4(),
            run_number=5,
            status=JobStatus.COMPLETED,
            started_at=datetime.utcnow() - timedelta(minutes=10),
            completed_at=datetime.utcnow(),
            duration_ms=600000,
            fragments_checked=100,
            red_count=1,
            amber_count=5,
            green_count=94,
            triggered_by="scheduler"
        )
        assert run.duration_ms == 600000


class TestDriftAlertModels:
    """Test DriftAlert Pydantic models."""

    def test_drift_alert_create_valid(self):
        data = DriftAlertCreate(
            run_id=uuid4(),
            fragment_id=uuid4(),
            severity=AlertSeverity.RED,
            drift_score=0.42,
            similarity_score=0.58,
            alert_title="Critical drift detected in Clinical Overview",
            alert_message="Content similarity dropped below threshold",
            affected_truth_ids=[uuid4(), uuid4()],
            program_id=uuid4()
        )
        assert data.severity == AlertSeverity.RED
        assert data.drift_score == 0.42

    def test_drift_alert_full(self):
        alert = DriftAlert(
            id=uuid4(),
            run_id=uuid4(),
            fragment_id=uuid4(),
            severity=AlertSeverity.AMBER,
            drift_score=0.25,
            alert_title="Moderate drift",
            status=AlertStatus.OPEN,
            created_at=datetime.utcnow()
        )
        assert alert.status == AlertStatus.OPEN
        assert alert.acknowledged_at is None

    def test_alert_acknowledge(self):
        data = AlertAcknowledge(
            acknowledgment_notes="Investigating root cause"
        )
        assert data.acknowledgment_notes is not None

    def test_alert_resolve(self):
        data = AlertResolve(
            resolution_notes="Fragment updated to match truth source. Verified by QA."
        )
        assert len(data.resolution_notes) > 0


class TestAlertSummary:
    """Test alert summary models."""

    def test_alert_summary_item(self):
        item = AlertSummaryItem(
            severity="RED",
            count=3,
            oldest=datetime.utcnow() - timedelta(days=2)
        )
        assert item.severity == "RED"
        assert item.count == 3

    def test_alert_summary(self):
        items = [
            AlertSummaryItem(severity="RED", count=2, oldest=datetime.utcnow()),
            AlertSummaryItem(severity="AMBER", count=5, oldest=datetime.utcnow())
        ]
        summary = AlertSummary(items=items, total_open=7)
        assert summary.total_open == 7
        assert len(summary.items) == 2


class TestDriftHistoryModels:
    """Test drift history and trend models."""

    def test_drift_history_point(self):
        point = DriftHistoryPoint(
            id=uuid4(),
            run_id=uuid4(),
            drift_score=0.15,
            similarity_score=0.85,
            risk_color="GREEN",
            measured_at=datetime.utcnow()
        )
        assert point.risk_color == "GREEN"

    def test_drift_history_list(self):
        frag_id = uuid4()
        points = [
            DriftHistoryPoint(
                id=uuid4(),
                run_id=uuid4(),
                drift_score=0.1 + i * 0.05,
                risk_color="GREEN" if i < 3 else "AMBER",
                measured_at=datetime.utcnow() - timedelta(days=5-i)
            )
            for i in range(5)
        ]
        lst = DriftHistoryList(fragment_id=frag_id, items=points)
        assert lst.fragment_id == frag_id
        assert len(lst.items) == 5

    def test_section_drift_trend(self):
        trend = SectionDriftTrend(
            day=date.today() - timedelta(days=1),
            avg_drift=0.18,
            max_drift=0.32,
            red_count=1
        )
        assert trend.avg_drift < trend.max_drift

    def test_section_trend_list(self):
        items = [
            SectionDriftTrend(
                day=date.today() - timedelta(days=i),
                avg_drift=0.15,
                max_drift=0.25,
                red_count=0
            )
            for i in range(7)
        ]
        lst = SectionTrendList(section_path="m2/25", items=items)
        assert lst.section_path == "m2/25"
        assert len(lst.items) == 7


class TestDriftListModels:
    """Test list response models."""

    def test_drift_job_list_empty(self):
        lst = DriftJobList(items=[], count=0)
        assert lst.count == 0

    def test_drift_run_list_with_items(self):
        run = DriftRun(
            id=uuid4(),
            job_id=uuid4(),
            run_number=1,
            status=JobStatus.COMPLETED,
            started_at=datetime.utcnow(),
            triggered_by="test"
        )
        lst = DriftRunList(items=[run], count=1)
        assert lst.count == 1

    def test_drift_alert_list_with_items(self):
        alert = DriftAlert(
            id=uuid4(),
            run_id=uuid4(),
            fragment_id=uuid4(),
            severity=AlertSeverity.RED,
            drift_score=0.4,
            alert_title="Test Alert",
            status=AlertStatus.OPEN,
            created_at=datetime.utcnow()
        )
        lst = DriftAlertList(items=[alert], count=1)
        assert lst.count == 1
        assert lst.items[0].severity == AlertSeverity.RED
