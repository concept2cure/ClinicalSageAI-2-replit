"""
Batch File Upload Endpoint Tests - A7-2

These tests are skipped if FastAPI is not installed.
"""

from __future__ import annotations

import hashlib
from uuid import UUID, uuid5, NAMESPACE_URL

import pytest

fastapi = pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen_cortex.reviewer.api import (
    router,
    MAX_BATCH_FILES,
    MAX_FILE_BYTES,
    MAX_TOTAL_BYTES,
    DEFAULT_MAX_FINDINGS_PER_DOC,
)


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _make_file_tuple(filename: str, content: bytes, content_type: str):
    return ("files", (filename, content, content_type))


class TestBatchFileEndpoint:
    def test_order_invariance_batch_id(self, client):
        program_id = UUID("11111111-1111-1111-1111-111111111111")
        extractor_version = "v1"

        file_a = _make_file_tuple("a.pdf", b"AAA", "application/pdf")
        file_b = _make_file_tuple("b.pdf", b"BBB", "application/pdf")

        resp_1 = client.post(
            "/review/batch/file",
            params={
                "program_id": str(program_id),
                "extractor_version": extractor_version,
                "response_mode": "summary",
            },
            files=[file_a, file_b],
        )
        resp_2 = client.post(
            "/review/batch/file",
            params={
                "program_id": str(program_id),
                "extractor_version": extractor_version,
                "response_mode": "summary",
            },
            files=[file_b, file_a],
        )

        assert resp_1.status_code == 200
        assert resp_2.status_code == 200
        assert resp_1.json()["batch_id"] == resp_2.json()["batch_id"]

    def test_limits_too_many_files(self, client, monkeypatch):
        monkeypatch.setattr("lumen_cortex.reviewer.api.MAX_BATCH_FILES", 1)

        program_id = UUID("22222222-2222-2222-2222-222222222222")
        extractor_version = "v1"

        files = [
            _make_file_tuple("a.pdf", b"AAA", "application/pdf"),
            _make_file_tuple("b.pdf", b"BBB", "application/pdf"),
        ]

        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=files,
        )
        assert resp.status_code == 413

    def test_limits_single_file_too_large(self, client, monkeypatch):
        monkeypatch.setattr("lumen_cortex.reviewer.api.MAX_FILE_BYTES", 10)

        program_id = UUID("33333333-3333-3333-3333-333333333333")
        extractor_version = "v1"

        big_file = _make_file_tuple("a.pdf", b"A" * 11, "application/pdf")
        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[big_file],
        )
        assert resp.status_code == 200
        errors = resp.json()["documents"][0]["errors"]
        assert errors
        assert errors[0]["code"] == "too_large"

    def test_limits_total_bytes_too_large(self, client, monkeypatch):
        monkeypatch.setattr("lumen_cortex.reviewer.api.MAX_TOTAL_BYTES", 10)

        program_id = UUID("44444444-4444-4444-4444-444444444444")
        extractor_version = "v1"

        files = [
            _make_file_tuple("a.pdf", b"A" * 6, "application/pdf"),
            _make_file_tuple("b.pdf", b"B" * 6, "application/pdf"),
        ]
        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=files,
        )
        assert resp.status_code == 413

    def test_type_rejection(self, client):
        program_id = UUID("55555555-5555-5555-5555-555555555555")
        extractor_version = "v1"

        bad_file = _make_file_tuple("malware.exe", b"MZ", "application/octet-stream")
        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[bad_file],
        )
        assert resp.status_code == 200
        errors = resp.json()["documents"][0]["errors"]
        assert errors
        assert errors[0]["code"] == "unsupported_type"

    def test_deterministic_doc_id(self, client):
        program_id = UUID("66666666-6666-6666-6666-666666666666")
        extractor_version = "v1"

        content = b"SAMEBYTES"
        expected_hash = hashlib.sha256(content).hexdigest()
        expected_doc_id = str(uuid5(NAMESPACE_URL, f"doc|{program_id}|{expected_hash}"))

        file_a = _make_file_tuple("a.pdf", content, "application/pdf")
        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[file_a],
        )
        assert resp.status_code == 200
        doc_id = resp.json()["documents"][0]["doc_id"]
        assert doc_id == expected_doc_id

    def test_response_mode_summary(self, client):
        program_id = UUID("77777777-7777-7777-7777-777777777777")
        extractor_version = "v1"

        file_a = _make_file_tuple("a.pdf", b"AAA", "application/pdf")
        resp = client.post(
            "/review/batch/file",
            params={
                "program_id": str(program_id),
                "extractor_version": extractor_version,
                "response_mode": "summary",
            },
            files=[file_a],
        )
        assert resp.status_code == 200
        preview = resp.json()["documents"][0]["findings_preview"]
        assert len(preview) <= DEFAULT_MAX_FINDINGS_PER_DOC

    def test_response_mode_full(self, client):
        program_id = UUID("88888888-8888-8888-8888-888888888888")
        extractor_version = "v1"

        file_a = _make_file_tuple("a.pdf", b"AAA", "application/pdf")
        resp_summary = client.post(
            "/review/batch/file",
            params={
                "program_id": str(program_id),
                "extractor_version": extractor_version,
                "response_mode": "summary",
            },
            files=[file_a],
        )
        resp_full = client.post(
            "/review/batch/file",
            params={
                "program_id": str(program_id),
                "extractor_version": extractor_version,
                "response_mode": "full",
            },
            files=[file_a],
        )

        assert resp_summary.status_code == 200
        assert resp_full.status_code == 200
        assert len(resp_full.json()["documents"][0]["findings_preview"]) >= len(
            resp_summary.json()["documents"][0]["findings_preview"]
        )

    def test_corrupt_file_returns_error(self, client):
        program_id = UUID("99999999-9999-9999-9999-999999999999")
        extractor_version = "v1"

        bad_file = _make_file_tuple("bad.pdf", b"NOTPDF", "application/pdf")
        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[bad_file],
        )

        assert resp.status_code == 200
        errors = resp.json()["documents"][0]["errors"]
        assert errors
        assert errors[0]["code"] in {"empty_text", "extract_failed"}
    def test_error_content_hash_is_distinct(self, client):
        """Errored docs get distinct content_hash values derived from filename+error."""
        program_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        extractor_version = "v1"

        # Two different corrupt files should get different content_hash values
        bad_file_1 = _make_file_tuple("bad1.exe", b"NOTPDF1", "application/octet-stream")
        bad_file_2 = _make_file_tuple("bad2.exe", b"NOTPDF2", "application/octet-stream")

        resp = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[bad_file_1, bad_file_2],
        )

        assert resp.status_code == 200
        docs = resp.json()["documents"]
        assert len(docs) == 2

        # Both should have errors
        assert docs[0]["errors"]
        assert docs[1]["errors"]

        # Content hashes should be different (derived from filename)
        assert docs[0]["content_hash"] != docs[1]["content_hash"]

        # doc_ids should also be different
        assert docs[0]["doc_id"] != docs[1]["doc_id"]

    def test_same_error_same_filename_produces_same_hash(self, client):
        """Same filename + same error = same content_hash (deterministic)."""
        program_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
        extractor_version = "v1"

        bad_file = _make_file_tuple("same.exe", b"GARBAGE", "application/octet-stream")

        resp_1 = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[bad_file],
        )
        resp_2 = client.post(
            "/review/batch/file",
            params={"program_id": str(program_id), "extractor_version": extractor_version},
            files=[bad_file],
        )

        assert resp_1.status_code == 200
        assert resp_2.status_code == 200
        assert resp_1.json()["documents"][0]["content_hash"] == resp_2.json()["documents"][0]["content_hash"]
