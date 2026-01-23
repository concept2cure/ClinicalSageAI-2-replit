"""
Tests for program scoping and config bundle endpoints.
Multi-tenant access control + reproducible AI decisions.
"""

import hashlib
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from shadow_service.models import (
    ProgramCreate,
    ProgramResponse,
    ProgramUpdate,
    ProgramStatus,
    MembershipCreate,
    MembershipRole,
    AccessLevel,
    ConfigBundleCreate,
    ConfigBundleType,
)


# =============================================================================
# Program Model Tests
# =============================================================================

def test_program_create_minimal():
    """Test creating a program with minimal fields."""
    prog = ProgramCreate(program_code="PROG-001")
    assert prog.program_code == "PROG-001"
    assert prog.status == ProgramStatus.ACTIVE
    assert prog.id is None


def test_program_create_full():
    """Test creating a program with all fields."""
    prog_id = uuid4()
    prog = ProgramCreate(
        id=prog_id,
        program_code="PROG-ONC-001",
        program_name="Oncology Program Alpha",
        sponsor_name="Acme Pharma",
        substance_id="ABC123",
        therapeutic_area="Oncology",
        indication="NSCLC",
        phase="Phase 3",
        status=ProgramStatus.ACTIVE,
        metadata={"region": "US", "lead": "Dr. Smith"},
    )
    assert prog.id == prog_id
    assert prog.program_code == "PROG-ONC-001"
    assert prog.therapeutic_area == "Oncology"
    assert prog.metadata["region"] == "US"


def test_program_update_partial():
    """Test partial program update."""
    update = ProgramUpdate(status=ProgramStatus.ARCHIVED)
    assert update.status == ProgramStatus.ARCHIVED
    assert update.program_name is None
    assert update.sponsor_name is None


# =============================================================================
# Membership Model Tests
# =============================================================================

def test_membership_create():
    """Test creating a membership."""
    prog_id = uuid4()
    mem = MembershipCreate(
        user_identity="alice@example.com",
        program_id=prog_id,
        membership_role=MembershipRole.RA,
        access_level=AccessLevel.READ_WRITE,
    )
    assert mem.user_identity == "alice@example.com"
    assert mem.program_id == prog_id
    assert mem.membership_role == MembershipRole.RA
    assert mem.access_level == AccessLevel.READ_WRITE


def test_membership_create_defaults():
    """Test membership creation with defaults."""
    prog_id = uuid4()
    mem = MembershipCreate(
        user_identity="bob@example.com",
        program_id=prog_id,
        membership_role=MembershipRole.CLINICAL,
    )
    assert mem.access_level == AccessLevel.READ_WRITE
    assert mem.expires_at is None


def test_membership_roles():
    """Test all membership roles are valid."""
    valid_roles = ["QA", "RA", "CLINICAL", "STATS", "SAFETY", "CMC", "ADMIN", "SHADOW"]
    for role in valid_roles:
        assert MembershipRole(role) is not None


# =============================================================================
# Config Bundle Model Tests
# =============================================================================

def test_config_bundle_create():
    """Test creating a config bundle."""
    bundle = ConfigBundleCreate(
        bundle_name="Shadow Agent Default",
        bundle_version="1.0.0",
        bundle_type=ConfigBundleType.SHADOW_AGENT,
        bundle_json={
            "embedding": {
                "model": "text-embedding-3-small",
                "dimensions": 1536,
            },
            "llm": {
                "model": "gpt-4-turbo",
                "temperature": 0.1,
            },
            "persona": {
                "code": "FDA_STATS",
                "drift_red_threshold": 0.18,
            },
        },
    )
    assert bundle.bundle_name == "Shadow Agent Default"
    assert bundle.bundle_type == ConfigBundleType.SHADOW_AGENT
    assert bundle.bundle_json["persona"]["code"] == "FDA_STATS"


def test_config_bundle_sha256_calculation():
    """Test SHA-256 calculation for deduplication."""
    config_json = {
        "model": "gpt-4",
        "temperature": 0.1,
    }
    canonical = json.dumps(config_json, sort_keys=True, separators=(',', ':'))
    sha256 = hashlib.sha256(canonical.encode()).hexdigest()
    
    # Same config should produce same hash
    config_json2 = {"temperature": 0.1, "model": "gpt-4"}
    canonical2 = json.dumps(config_json2, sort_keys=True, separators=(',', ':'))
    sha256_2 = hashlib.sha256(canonical2.encode()).hexdigest()
    
    assert sha256 == sha256_2


# =============================================================================
# SQL Query Tests
# =============================================================================

def test_sql_imports():
    """Test that SQL module imports without error."""
    from shadow_service import sql_programs
    
    assert hasattr(sql_programs, 'SQL_CREATE_PROGRAM')
    assert hasattr(sql_programs, 'SQL_GET_PROGRAM')
    assert hasattr(sql_programs, 'SQL_ADD_MEMBERSHIP')
    assert hasattr(sql_programs, 'SQL_CREATE_CONFIG_BUNDLE')
    assert hasattr(sql_programs, 'SQL_SET_SESSION_CONTEXT')


def test_sql_placeholders():
    """Test that SQL queries use proper placeholders."""
    from shadow_service import sql_programs
    
    # All queries should use $1, $2, etc. for parameters
    assert "$1" in sql_programs.SQL_CREATE_PROGRAM
    assert "$1" in sql_programs.SQL_GET_PROGRAM
    assert "$1" in sql_programs.SQL_ADD_MEMBERSHIP


# =============================================================================
# Model Validation Tests
# =============================================================================

def test_program_code_required():
    """Test that program_code is required."""
    with pytest.raises(Exception):
        ProgramCreate()


def test_membership_user_identity_required():
    """Test that user_identity is required for membership."""
    with pytest.raises(Exception):
        MembershipCreate(
            program_id=uuid4(),
            membership_role=MembershipRole.QA,
        )


def test_config_bundle_json_required():
    """Test that bundle_json is required."""
    with pytest.raises(Exception):
        ConfigBundleCreate(
            bundle_name="Test",
            bundle_type=ConfigBundleType.SHADOW_AGENT,
        )


# =============================================================================
# Deduplication Logic Tests
# =============================================================================

def test_config_bundle_deduplication_logic():
    """Test that config bundles with same content get same SHA."""
    config1 = {"a": 1, "b": 2}
    config2 = {"b": 2, "a": 1}  # Same content, different order
    
    json1 = json.dumps(config1, sort_keys=True, separators=(',', ':'))
    json2 = json.dumps(config2, sort_keys=True, separators=(',', ':'))
    
    sha1 = hashlib.sha256(json1.encode()).hexdigest()
    sha2 = hashlib.sha256(json2.encode()).hexdigest()
    
    assert sha1 == sha2, "Same config should produce same SHA"


def test_config_bundle_type_enum():
    """Test all config bundle types are valid."""
    valid_types = ["SHADOW_AGENT", "DRIFT_MONITOR", "BATCH_QC", "EMBEDDING", "PROMPTS"]
    for type_name in valid_types:
        assert ConfigBundleType(type_name) is not None


def test_program_status_enum():
    """Test all program statuses are valid."""
    valid_statuses = ["ACTIVE", "ARCHIVED", "SUSPENDED"]
    for status in valid_statuses:
        assert ProgramStatus(status) is not None


def test_access_level_enum():
    """Test all access levels are valid."""
    valid_levels = ["READ_ONLY", "READ_WRITE", "ADMIN"]
    for level in valid_levels:
        assert AccessLevel(level) is not None


# =============================================================================
# Integration Tests (requires DB - skipped in CI lite mode)
# =============================================================================

@pytest.mark.skip(reason="Requires database connection")
def test_rls_blocks_cross_program_access():
    """Test that RLS prevents accessing other programs' data."""
    pass


@pytest.mark.skip(reason="Requires database connection")
def test_rls_write_requires_membership():
    """Test that RLS prevents writing without membership."""
    pass


@pytest.mark.skip(reason="Requires database connection")
def test_config_bundle_cannot_be_updated():
    """Test that config bundles are truly append-only."""
    pass


@pytest.mark.skip(reason="Requires database connection")
def test_config_bundle_cannot_be_deleted():
    """Test that config bundles cannot be deleted."""
    pass
