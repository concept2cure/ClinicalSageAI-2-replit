"""Pytest configuration for Shadow Interrogation Service tests."""

import os
import pytest

# Mark all tests in this directory as asyncio
pytestmark = pytest.mark.asyncio


def has_db() -> bool:
    """Check if database connection is available."""
    return bool(
        os.environ.get("DATABASE_URL") or
        os.environ.get("DATABASE_NEON_NEW_SECRET")
    )


@pytest.fixture(scope="session")
def database_url() -> str:
    """Get database URL, skip tests if not available."""
    url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_NEON_NEW_SECRET")
    if not url:
        pytest.skip("DATABASE_URL not set; skipping integration tests")
    return url


@pytest.fixture(autouse=True)
def reset_db_pool():
    """Reset the database pool before each test to avoid event loop issues.

    Note: The db module requires asyncpg at import time, which may not
    be available in lightweight test environments.  Guard the import
    so pure-unit tests (risk codes, manifest, etc.) can run regardless.
    """
    try:
        from shadow_service import db
        db._pool = None
        db._lite_mode = False
    except (ImportError, ModuleNotFoundError):
        db = None  # type: ignore[assignment]

    yield

    if db is not None:
        db._pool = None
        db._lite_mode = False


@pytest.fixture
def sample_fragment_data() -> dict:
    """Sample fragment creation data."""
    return {
        "ectd_section_path": "m2.7.3-test-efficacy",
        "jurisdiction": "FDA",
        "content_prose": "The primary endpoint demonstrated statistically significant improvement (p=0.025).",
        "confidence_rating": "Conclusive",
    }


@pytest.fixture
def sample_truth_data() -> dict:
    """Sample truth datapoint creation data."""
    return {
        "nct_id": "NCT_TEST_001",
        "substance_id": "UNII-TEST-001",
        "metric_name": "p_value",
        "metric_value_float": 0.025,
        "is_primary_endpoint": True,
        "source_document_ref": "CSR Table 14-2",
    }


@pytest.fixture
def sample_precedent_data() -> dict:
    """Sample precedent creation data."""
    return {
        "agency_code": "FDA",
        "failure_mode": "Statistical Plan Gap",
        "historical_question": "Please provide the pre-specified alpha spending approach for the primary endpoint.",
        "source_ref": "TEST-IR-001",
    }
