"""
Ops Endpoint Auth Guard Tests - A8-7.1

Tests that ops endpoints require admin token (fail-closed).
"""

from __future__ import annotations

import os
from uuid import UUID

import pytest

fastapi = pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen_cortex.reviewer.api import router


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


class TestOpsAuthGuard:
    """Test that ops endpoints require admin authentication."""

    def test_list_batches_without_token_returns_403(self, client, valid_token):
        """GET /batches without token should return 403."""
        resp = client.get(
            "/review/batches",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Forbidden"

    def test_list_batches_with_wrong_token_returns_403(self, client, valid_token):
        """GET /batches with wrong token should return 403."""
        resp = client.get(
            "/review/batches",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            headers={"X-Admin-Token": "wrong-token"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Forbidden"

    def test_list_batches_with_valid_token_passes_auth(self, client, valid_token, monkeypatch):
        """GET /batches with correct token should pass auth check (may fail later due to no DB)."""
        # Disable batch persistence so we hit that error instead of auth error
        monkeypatch.setenv("BATCH_PERSISTENCE_ENABLED", "false")

        resp = client.get(
            "/review/batches",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            headers={"X-Admin-Token": valid_token},
        )
        # 501 means auth passed but batch persistence is disabled
        assert resp.status_code == 501
        assert "persistence is not enabled" in resp.json()["detail"]

    def test_cancel_batch_without_token_returns_403(self, client, valid_token):
        """POST /batch/{id}/cancel without token should return 403."""
        resp = client.post(
            "/review/batch/some-batch-id/cancel",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert resp.status_code == 403

    def test_requeue_batch_without_token_returns_403(self, client, valid_token):
        """POST /batch/{id}/requeue without token should return 403."""
        resp = client.post(
            "/review/batch/some-batch-id/requeue",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert resp.status_code == 403

    def test_admin_view_without_token_returns_403(self, client, valid_token):
        """GET /batch/{id}/admin without token should return 403."""
        resp = client.get(
            "/review/batch/some-batch-id/admin",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert resp.status_code == 403

    def test_retry_batch_without_token_returns_403(self, client, valid_token):
        """POST /batch/{id}/retry without token should return 403."""
        resp = client.post(
            "/review/batch/some-batch-id/retry",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert resp.status_code == 403

    def test_failed_batches_without_token_returns_403(self, client, valid_token):
        """GET /batches/failed without token should return 403."""
        resp = client.get(
            "/review/batches/failed",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
        )
        assert resp.status_code == 403


class TestOpsAuthFailClosed:
    """Test fail-closed behavior when REVIEW_ADMIN_TOKEN is not set."""

    def test_list_batches_without_env_returns_503(self, client, monkeypatch):
        """GET /batches without REVIEW_ADMIN_TOKEN env should return 503."""
        monkeypatch.delenv("REVIEW_ADMIN_TOKEN", raising=False)

        resp = client.get(
            "/review/batches",
            params={"program_id": "11111111-1111-1111-1111-111111111111"},
            headers={"X-Admin-Token": "any-token"},
        )
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"]
