"""
Ops Endpoint Audit Attribution Tests - A8-7.3

Tests that ops endpoints properly attribute actions with:
- X-Request-Id header tracking
- Admin token hash prefix for actor identification
- Audit events emitted with actor info
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest

fastapi = pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen_cortex.reviewer.api import (
    AdminContext,
    _hash_token_prefix,
    get_admin_context,
    router,
)


@pytest.fixture()
def client():
    """Create test client with router."""
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture()
def valid_token(monkeypatch):
    """Set valid admin token in environment."""
    token = "test-admin-token-12345"
    monkeypatch.setenv("REVIEW_ADMIN_TOKEN", token)
    return token


class TestAdminContext:
    """Test AdminContext extraction and token hashing."""

    def test_hash_token_prefix_returns_8_chars(self):
        """Token hash prefix should be exactly 8 characters."""
        token = "my-secret-token"
        prefix = _hash_token_prefix(token)
        assert len(prefix) == 8
        # Should be hex characters
        assert all(c in "0123456789abcdef" for c in prefix)

    def test_hash_token_prefix_is_deterministic(self):
        """Same token should always produce same hash prefix."""
        token = "consistent-token-value"
        prefix1 = _hash_token_prefix(token)
        prefix2 = _hash_token_prefix(token)
        assert prefix1 == prefix2

    def test_hash_token_prefix_differs_for_different_tokens(self):
        """Different tokens should produce different hash prefixes."""
        prefix1 = _hash_token_prefix("token-a")
        prefix2 = _hash_token_prefix("token-b")
        assert prefix1 != prefix2

    def test_hash_token_prefix_matches_sha256(self):
        """Hash prefix should match first 8 chars of sha256."""
        token = "verify-sha256"
        expected = hashlib.sha256(token.encode()).hexdigest()[:8]
        actual = _hash_token_prefix(token)
        assert actual == expected


class TestGetAdminContext:
    """Test the get_admin_context dependency."""

    def test_uses_provided_request_id(self):
        """Should use X-Request-Id header when provided."""
        ctx = get_admin_context(
            x_admin_token="some-token",
            x_request_id="custom-request-id-123",
        )
        assert ctx.request_id == "custom-request-id-123"

    def test_generates_request_id_if_not_provided(self):
        """Should generate UUID if X-Request-Id not provided."""
        ctx = get_admin_context(
            x_admin_token="some-token",
            x_request_id=None,
        )
        # Should be a valid UUID format
        assert len(ctx.request_id) == 36
        assert ctx.request_id.count("-") == 4

    def test_extracts_token_hash_prefix(self):
        """Should extract token hash prefix for attribution."""
        token = "my-admin-token"
        ctx = get_admin_context(
            x_admin_token=token,
            x_request_id="req-1",
        )
        expected_prefix = _hash_token_prefix(token)
        assert ctx.token_hash_prefix == expected_prefix

    def test_handles_missing_token(self):
        """Should handle missing token gracefully."""
        ctx = get_admin_context(
            x_admin_token=None,
            x_request_id="req-1",
        )
        assert ctx.token_hash_prefix == "no-token"

    def test_timestamp_is_iso_format(self):
        """Timestamp should be ISO format."""
        ctx = get_admin_context(
            x_admin_token="token",
            x_request_id="req-1",
        )
        # Should end with +00:00 or Z for UTC
        assert "T" in ctx.timestamp


class TestOpsEndpointsIncludeAuditTracking:
    """Test that ops endpoints pass audit context to events."""

    def test_list_batches_respects_request_id_header(self, client, valid_token, monkeypatch):
        """GET /batches should include X-Request-Id in response context."""
        monkeypatch.setenv("BATCH_PERSISTENCE_ENABLED", "false")

        resp = client.get(
            "/review/batches",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            headers={
                "X-Admin-Token": valid_token,
                "X-Request-Id": "test-req-abc123",
            },
        )
        # Auth should pass (501 = persistence disabled, not auth failure)
        assert resp.status_code == 501

    def test_cancel_batch_respects_request_id_header(self, client, valid_token, monkeypatch):
        """POST /batch/{id}/cancel should include X-Request-Id."""
        monkeypatch.setenv("BATCH_PERSISTENCE_ENABLED", "false")

        resp = client.post(
            "/review/batch/test-batch/cancel",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            headers={
                "X-Admin-Token": valid_token,
                "X-Request-Id": "test-req-cancel-001",
            },
        )
        # Auth should pass (501 = persistence disabled)
        assert resp.status_code == 501

    def test_requeue_batch_respects_request_id_header(self, client, valid_token, monkeypatch):
        """POST /batch/{id}/requeue should include X-Request-Id."""
        monkeypatch.setenv("BATCH_PERSISTENCE_ENABLED", "false")

        resp = client.post(
            "/review/batch/test-batch/requeue",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            json={"reset_attempts": False, "force": False},
            headers={
                "X-Admin-Token": valid_token,
                "X-Request-Id": "test-req-requeue-001",
            },
        )
        # Auth should pass (501 = persistence disabled)
        assert resp.status_code == 501

    def test_admin_details_respects_request_id_header(self, client, valid_token, monkeypatch):
        """GET /batch/{id}/admin should include X-Request-Id."""
        monkeypatch.setenv("BATCH_PERSISTENCE_ENABLED", "false")

        resp = client.get(
            "/review/batch/test-batch/admin",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            headers={
                "X-Admin-Token": valid_token,
                "X-Request-Id": "test-req-admin-001",
            },
        )
        # Auth should pass (501 = persistence disabled)
        assert resp.status_code == 501


class TestEmitOpsEventWithAuditContext:
    """Test that _emit_ops_event includes audit attribution."""

    def test_emit_ops_event_adds_admin_context_to_payload(self):
        """Event payload should include request_id, admin_actor, event_timestamp."""
        import asyncio
        from lumen_cortex.reviewer.api import _emit_ops_event

        admin_ctx = AdminContext(
            request_id="req-emit-test-001",
            token_hash_prefix="abc12345",
            timestamp="2026-02-05T12:00:00+00:00",
        )

        captured_payload = {}

        # Mock the event_bus.publish
        async def mock_publish(event_type, payload, source_service):
            captured_payload.update(payload)

        with patch("lumen_cortex.enterprise.core.event_bus") as mock_bus:
            mock_bus.publish = AsyncMock(side_effect=mock_publish)
            asyncio.get_event_loop().run_until_complete(
                _emit_ops_event(
                    "test.event",
                    {"batch_id": "b123", "action": "test"},
                    admin_context=admin_ctx,
                )
            )

        # Verify audit attribution was added
        assert captured_payload.get("request_id") == "req-emit-test-001"
        assert captured_payload.get("admin_actor") == "abc12345"
        assert captured_payload.get("event_timestamp") == "2026-02-05T12:00:00+00:00"
        assert captured_payload.get("batch_id") == "b123"

    def test_emit_ops_event_without_context_still_works(self):
        """Event emission should work without admin_context (backwards compat)."""
        import asyncio
        from lumen_cortex.reviewer.api import _emit_ops_event

        captured_payload = {}

        async def mock_publish(event_type, payload, source_service):
            captured_payload.update(payload)

        with patch("lumen_cortex.enterprise.core.event_bus") as mock_bus:
            mock_bus.publish = AsyncMock(side_effect=mock_publish)
            asyncio.get_event_loop().run_until_complete(
                _emit_ops_event(
                    "test.event",
                    {"batch_id": "b456"},
                    admin_context=None,
                )
            )

        # Should have original payload without audit fields
        assert captured_payload.get("batch_id") == "b456"
        assert "admin_actor" not in captured_payload
