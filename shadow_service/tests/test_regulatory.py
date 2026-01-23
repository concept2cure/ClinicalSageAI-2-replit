"""
Tests for regulatory timeline and milestone operations.
"""
import pytest
from datetime import datetime, date, timedelta
from uuid import uuid4
from shadow_service.models_regulatory import (
    Submission, SubmissionCreate, SubmissionList,
    SubmissionStatusUpdate, SubmissionDatesUpdate,
    SubmissionStatus,
    Milestone, MilestoneCreate, MilestoneList, MilestoneStatusUpdate,
    MilestoneStatus, UpcomingDeadline, UpcomingDeadlineList,
    AgencyCorrespondence, AgencyCorrespondenceCreate, CorrespondenceList,
    CorrespondenceDirection, PendingResponse, PendingResponseList,
    InformationRequest, InformationRequestCreate, InformationRequestList,
    IRStatus, IRStatusUpdate,
    TimelineEvent, TimelineEventList,
    ProgramRegulatoryOverview
)


class TestSubmissionModels:
    """Test Submission Pydantic models."""

    def test_submission_create_valid(self):
        data = SubmissionCreate(
            submission_code="NDA-2024-001",
            submission_name="DrugX NDA Initial Submission",
            submission_type_id=uuid4(),
            program_id=uuid4(),
            target_date=date(2024, 12, 15),
            notes="First NDA submission for DrugX indication"
        )
        assert data.submission_code == "NDA-2024-001"
        assert data.status == SubmissionStatus.PLANNING

    def test_submission_create_minimal(self):
        data = SubmissionCreate(
            submission_code="BLA-001",
            submission_name="Test BLA",
            submission_type_id=uuid4(),
            program_id=uuid4()
        )
        assert data.status == SubmissionStatus.PLANNING
        assert data.target_date is None

    def test_submission_full(self):
        sub = Submission(
            id=uuid4(),
            submission_code="NDA-2024-001",
            submission_name="DrugX NDA",
            submission_type_id=uuid4(),
            program_id=uuid4(),
            status=SubmissionStatus.UNDER_REVIEW,
            submission_date=date(2024, 6, 1),
            acceptance_date=date(2024, 6, 15),
            pdufa_date=date(2025, 4, 1),
            created_at=datetime.utcnow(),
            created_by="reg_affairs"
        )
        assert sub.status == SubmissionStatus.UNDER_REVIEW

    def test_submission_status_update(self):
        data = SubmissionStatusUpdate(status=SubmissionStatus.SUBMITTED)
        assert data.status == SubmissionStatus.SUBMITTED

    def test_submission_dates_update(self):
        data = SubmissionDatesUpdate(
            submission_date=date(2024, 6, 1),
            acceptance_date=date(2024, 6, 15),
            pdufa_date=date(2025, 4, 1)
        )
        assert data.pdufa_date == date(2025, 4, 1)


class TestMilestoneModels:
    """Test Milestone Pydantic models."""

    def test_milestone_create_valid(self):
        data = MilestoneCreate(
            submission_id=uuid4(),
            milestone_code="MS-DRAFT-COMPLETE",
            milestone_name="Module 2 Draft Complete",
            description="All Module 2 sections drafted and QC'd",
            planned_date=date(2024, 9, 1),
            deadline=date(2024, 9, 15),
            owner="clinical_writing@company.com"
        )
        assert data.milestone_code == "MS-DRAFT-COMPLETE"
        assert data.status == MilestoneStatus.PLANNED

    def test_milestone_full(self):
        ms = Milestone(
            id=uuid4(),
            submission_id=uuid4(),
            milestone_code="MS-001",
            milestone_name="Test Milestone",
            status=MilestoneStatus.IN_PROGRESS,
            planned_date=date(2024, 8, 1),
            deadline=date(2024, 8, 15),
            days_until_deadline=10,
            created_at=datetime.utcnow(),
            created_by="test"
        )
        assert ms.status == MilestoneStatus.IN_PROGRESS
        assert ms.actual_date is None

    def test_milestone_status_update(self):
        data = MilestoneStatusUpdate(
            status=MilestoneStatus.COMPLETED,
            actual_date=date.today()
        )
        assert data.status == MilestoneStatus.COMPLETED

    def test_upcoming_deadline(self):
        deadline = UpcomingDeadline(
            id=uuid4(),
            submission_id=uuid4(),
            submission_code="NDA-001",
            milestone_code="MS-001",
            milestone_name="Final QC",
            deadline=date.today() + timedelta(days=5),
            days_until_deadline=5,
            status=MilestoneStatus.IN_PROGRESS
        )
        assert deadline.days_until_deadline == 5


class TestCorrespondenceModels:
    """Test AgencyCorrespondence Pydantic models."""

    def test_correspondence_create_inbound(self):
        data = AgencyCorrespondenceCreate(
            submission_id=uuid4(),
            correspondence_type="Information Request",
            reference_number="FDA-IR-2024-001",
            subject="Request for Additional CMC Information",
            direction=CorrespondenceDirection.INBOUND,
            correspondence_date=date(2024, 7, 15),
            due_date=date(2024, 8, 15),
            summary="FDA requests additional stability data for drug product"
        )
        assert data.direction == CorrespondenceDirection.INBOUND
        assert data.due_date is not None

    def test_correspondence_create_outbound(self):
        data = AgencyCorrespondenceCreate(
            submission_id=uuid4(),
            correspondence_type="Response to IR",
            subject="Response to FDA Information Request",
            direction=CorrespondenceDirection.OUTBOUND,
            correspondence_date=date.today()
        )
        assert data.direction == CorrespondenceDirection.OUTBOUND

    def test_correspondence_full(self):
        corr = AgencyCorrespondence(
            id=uuid4(),
            submission_id=uuid4(),
            correspondence_type="Complete Response Letter",
            subject="CRL for NDA",
            direction=CorrespondenceDirection.INBOUND,
            correspondence_date=date(2024, 4, 1),
            document_refs=["CRL-001.pdf", "appendix-a.pdf"],
            created_at=datetime.utcnow(),
            created_by="reg_admin"
        )
        assert len(corr.document_refs) == 2

    def test_pending_response(self):
        pr = PendingResponse(
            id=uuid4(),
            submission_id=uuid4(),
            submission_code="NDA-001",
            correspondence_type="Information Request",
            subject="CMC Questions",
            due_date=date.today() + timedelta(days=10),
            days_until_due=10
        )
        assert pr.days_until_due == 10


class TestInformationRequestModels:
    """Test InformationRequest Pydantic models."""

    def test_ir_create_valid(self):
        data = InformationRequestCreate(
            submission_id=uuid4(),
            ir_number="IR-001",
            ir_type="Clinical",
            received_date=date(2024, 7, 1),
            due_date=date(2024, 8, 1),
            question_count=15,
            questions=[
                {"number": 1, "question": "Clarify inclusion criteria"},
                {"number": 2, "question": "Provide missing AE data"}
            ]
        )
        assert data.ir_number == "IR-001"
        assert data.question_count == 15

    def test_ir_full(self):
        ir = InformationRequest(
            id=uuid4(),
            submission_id=uuid4(),
            ir_number="IR-001",
            ir_type="CMC",
            status=IRStatus.IN_PROGRESS,
            received_date=date(2024, 7, 1),
            due_date=date(2024, 8, 1),
            question_count=10,
            answered_count=6,
            created_at=datetime.utcnow(),
            created_by="reg_admin"
        )
        assert ir.status == IRStatus.IN_PROGRESS
        assert ir.answered_count < ir.question_count

    def test_ir_status_update(self):
        data = IRStatusUpdate(
            status=IRStatus.SUBMITTED,
            submitted_date=date.today(),
            answered_count=10
        )
        assert data.status == IRStatus.SUBMITTED


class TestTimelineModels:
    """Test timeline and overview models."""

    def test_timeline_event_milestone(self):
        event = TimelineEvent(
            event_type="MILESTONE",
            event_id=uuid4(),
            event_name="Draft Complete",
            event_date=date(2024, 6, 1),
            status="COMPLETED"
        )
        assert event.event_type == "MILESTONE"

    def test_timeline_event_correspondence(self):
        event = TimelineEvent(
            event_type="CORRESPONDENCE",
            event_id=uuid4(),
            event_name="FDA Information Request",
            event_date=date(2024, 7, 15),
            status="INBOUND",
            reference_number="FDA-IR-001"
        )
        assert event.reference_number == "FDA-IR-001"

    def test_timeline_event_list(self):
        sub_id = uuid4()
        events = [
            TimelineEvent(
                event_type="MILESTONE",
                event_id=uuid4(),
                event_name="Event 1",
                event_date=date(2024, 6, 1)
            ),
            TimelineEvent(
                event_type="CORRESPONDENCE",
                event_id=uuid4(),
                event_name="Event 2",
                event_date=date(2024, 7, 1)
            )
        ]
        lst = TimelineEventList(submission_id=sub_id, items=events)
        assert len(lst.items) == 2

    def test_program_regulatory_overview(self):
        overview = ProgramRegulatoryOverview(
            program_id=uuid4(),
            program_code="PROG-001",
            program_name="DrugX Development Program",
            submission_count=3,
            active_submissions=2,
            approved_count=0,
            next_deadline=date.today() + timedelta(days=30),
            open_ir_count=1
        )
        assert overview.submission_count == 3
        assert overview.active_submissions == 2


class TestRegulatoryListModels:
    """Test list response models."""

    def test_submission_list_empty(self):
        lst = SubmissionList(items=[], count=0)
        assert lst.count == 0

    def test_milestone_list_with_items(self):
        ms = Milestone(
            id=uuid4(),
            submission_id=uuid4(),
            milestone_code="MS-001",
            milestone_name="Test",
            status=MilestoneStatus.PLANNED,
            created_at=datetime.utcnow(),
            created_by="test"
        )
        lst = MilestoneList(items=[ms], count=1)
        assert lst.count == 1

    def test_upcoming_deadline_list(self):
        deadline = UpcomingDeadline(
            id=uuid4(),
            submission_id=uuid4(),
            submission_code="NDA-001",
            milestone_code="MS-001",
            milestone_name="Test",
            deadline=date.today() + timedelta(days=7),
            days_until_deadline=7,
            status=MilestoneStatus.IN_PROGRESS
        )
        lst = UpcomingDeadlineList(items=[deadline], count=1)
        assert lst.items[0].days_until_deadline == 7
