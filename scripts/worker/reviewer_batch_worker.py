"""Single-process batch worker loop for reviewer batches."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import time
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from lumen_cortex.core.canonical.document import CanonicalDocument, CanonicalParagraph
from lumen_cortex.core.events import derive_error_content_hash
from lumen_cortex.core.extractors.text_extract import normalize_text
from lumen_cortex.reviewer import ReviewRunner
from lumen_cortex.reviewer.config import REVIEW_CONFIG
from lumen_cortex.reviewer.storage import BatchSummaryUpdate, NeonBatchStore, get_batch_store
from lumen_cortex.reviewer.storage.models import BatchInputRow


def _build_canonical_from_text(
    doc_id: UUID,
    content: str,
    source_type: str,
    extractor_version: str,
    title: str | None,
) -> CanonicalDocument:
    normalized_text = normalize_text(content)
    content_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
    raw_paragraphs = [p.strip() for p in normalized_text.split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [normalized_text]

    paragraphs = [
        CanonicalParagraph(index=i, text=text)
        for i, text in enumerate(raw_paragraphs)
    ]

    return CanonicalDocument(
        doc_id=doc_id,
        content_hash=content_hash,
        source_type=source_type,
        paragraphs=paragraphs,
        extraction_timestamp=datetime.now(timezone.utc),
        extractor_version=extractor_version,
        title=title,
    )


def _extract_text_from_input(input_row: BatchInputRow) -> str:
    return input_row.text_content or ""


async def run_once(
    program_id: UUID,
    store: NeonBatchStore,
    runner: ReviewRunner,
    now_factory: Callable[[], datetime],
    sleep_seconds: float = 0,
) -> int:
    """Process a single queued or stale batch. Returns 0 or 1."""
    heartbeat_timeout_sec = int(os.environ.get("REVIEW_WORKER_STALL_SEC", "60"))
    heartbeat_sec = int(os.environ.get("REVIEW_WORKER_HEARTBEAT_SEC", "10"))
    now = now_factory()

    batch_id = await store.claim_next_batch(
        program_id=str(program_id),
        now=now,
        heartbeat_timeout_sec=heartbeat_timeout_sec,
    )
    if not batch_id:
        if sleep_seconds:
            await asyncio.sleep(sleep_seconds)
        return 0

    try:
        await store.heartbeat_batch(str(program_id), batch_id, now_factory())
        inputs = await store.get_batch_inputs(batch_id, str(program_id))
        if not inputs:
            await store.mark_batch_failed(
                str(program_id),
                batch_id,
                now_factory(),
                "missing_inputs",
            )
            return 1

        canonical_docs: list[CanonicalDocument] = []
        errored_docs_info: list[dict[str, object]] = []
        content_hashes_all: list[str] = []

        for input_row in inputs:
            doc_id = UUID(input_row.doc_id)
            extracted_text = _extract_text_from_input(input_row)
            normalized_text = normalize_text(extracted_text)
            if not normalized_text:
                error_codes = ["empty_text"]
                error_hash = derive_error_content_hash(input_row.filename or "unknown", error_codes)
                content_hashes_all.append(error_hash)
                errored_docs_info.append({
                    "doc_id": str(doc_id),
                    "content_hash": error_hash,
                    "filename": input_row.filename,
                    "error_codes": error_codes,
                })
                await store.upsert_doc_result(
                    batch_id=batch_id,
                    program_id=str(program_id),
                    doc_id=str(doc_id),
                    content_hash=error_hash,
                    status="failed",
                    errors=[{"code": "empty_text", "message": "Extracted text is empty"}],
                    findings_count=0,
                    findings_preview=[],
                )
                continue

            canonical_doc = _build_canonical_from_text(
                doc_id=doc_id,
                content=normalized_text,
                source_type=input_row.source_type,
                extractor_version=runner.extractor_version,
                title=input_row.filename,
            )
            canonical_docs.append(canonical_doc)
            content_hashes_all.append(canonical_doc.content_hash)

            if len(canonical_docs) % max(1, heartbeat_sec) == 0:
                await store.heartbeat_batch(str(program_id), batch_id, now_factory())

        result = runner.review_batch(
            docs=canonical_docs,
            program_id=program_id,
            extractor_version=runner.extractor_version,
            ruleset_version=runner.ruleset_version,
            content_hashes=content_hashes_all,
            errored_docs=errored_docs_info,
        )

        preview_cap = min(REVIEW_CONFIG.max_findings_preview, REVIEW_CONFIG.max_findings_per_doc)
        for doc_result in result.documents:
            findings_preview = [
                {
                    "finding_id": str(f.finding_id),
                    "rule_id": f.rule_id,
                    "severity": f.severity,
                    "description": f.description[:200],
                }
                for f in doc_result.findings[:preview_cap]
            ]
            await store.upsert_doc_result(
                batch_id=batch_id,
                program_id=str(program_id),
                doc_id=doc_result.doc_id,
                content_hash=doc_result.content_hash,
                status="succeeded",
                findings_count=doc_result.findings_count,
                findings_digest=doc_result.findings_digest,
                findings_preview=findings_preview,
            )

        summary = BatchSummaryUpdate(
            documents_succeeded=len(result.documents),
            documents_failed=len(errored_docs_info),
            findings_total=result.total_findings,
            by_severity=result.findings_by_severity,
            error_summary=[],
        )
        await store.finalize_batch(batch_id, summary, status="completed")
        await store.heartbeat_batch(str(program_id), batch_id, now_factory())
        return 1
    except Exception as exc:
        await store.mark_batch_failed(str(program_id), batch_id, now_factory(), str(exc))
        return 1


async def run_loop(program_id: UUID, seconds: int) -> int:
    """Run the worker loop for a fixed duration. Returns total processed."""
    idle_sleep = float(os.environ.get("REVIEW_WORKER_IDLE_SLEEP_SEC", "0.5"))
    end_time = time.monotonic() + seconds

    store = await get_batch_store()
    runner = ReviewRunner(program_id=program_id)

    processed_total = 0
    while time.monotonic() < end_time:
        processed = await run_once(
            program_id=program_id,
            store=store,
            runner=runner,
            now_factory=lambda: datetime.now(timezone.utc),
            sleep_seconds=0,
        )
        processed_total += processed
        if processed == 0:
            await asyncio.sleep(idle_sleep)

    return processed_total


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reviewer batch worker")
    parser.add_argument("--program-id", required=True, type=UUID)
    parser.add_argument("--seconds", type=int, default=60)
    parser.add_argument("--run-once", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.run_once:
        async def _run_once():
            store = await get_batch_store()
            runner = ReviewRunner(program_id=args.program_id)
            await run_once(
                program_id=args.program_id,
                store=store,
                runner=runner,
                now_factory=lambda: datetime.now(timezone.utc),
                sleep_seconds=0,
            )
        asyncio.run(_run_once())
    else:
        asyncio.run(run_loop(program_id=args.program_id, seconds=args.seconds))


if __name__ == "__main__":
    main()
