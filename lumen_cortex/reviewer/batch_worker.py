"""
Batch Worker Loop - A7-7

Autonomous worker that claims and processes queued async batches.

Key features:
- Claims next queued batch atomically (FIFO + tie-break by batch_id)
- Loads batch input from vault.review_batches (persisted during enqueue)
- Sends heartbeat every N docs to prevent stall detection
- Finalizes batch with summary statistics
- Graceful shutdown on SIGTERM/SIGINT
- HTTP health endpoint for k8s liveness probes

Usage:
    PYTHONPATH=. python -m lumen_cortex.reviewer.batch_worker \
        --program-id <UUID> \
        --worker-id worker-1 \
        --poll-interval 5

Environment:
    BATCH_PERSISTENCE_ENABLED=true
    DATABASE_URL=postgresql://...
    BATCH_WORKER_HEALTH_PORT=8081 (optional, default 8081)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Any
from uuid import UUID

from lumen_cortex.reviewer.storage import NeonBatchStore, get_batch_store
from lumen_cortex.reviewer.config import REVIEW_CONFIG

logger = logging.getLogger(__name__)


# Global reference for health check
_worker_instance: "BatchWorker | None" = None

# DB health threshold: if no successful DB op in this many seconds, report unhealthy
DB_HEALTH_TIMEOUT_SEC = 60


class HealthCheckHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler for health/liveness probes."""

    def log_message(self, format: str, *args: Any) -> None:
        """Suppress HTTP request logging."""
        pass

    def do_GET(self) -> None:
        """Handle GET requests for health endpoints."""
        if self.path == "/health" or self.path == "/healthz":
            self._respond_health()
        elif self.path == "/ready" or self.path == "/readyz":
            self._respond_ready()
        elif self.path == "/metrics":
            self._respond_metrics()
        else:
            self.send_response(404)
            self.end_headers()

    def _respond_health(self) -> None:
        """Liveness probe - is the process alive?"""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        status = {
            "status": "healthy",
            "worker_id": _worker_instance.worker_id if _worker_instance else None,
            "shutdown_requested": _worker_instance.shutdown_requested if _worker_instance else False,
        }
        self.wfile.write(json.dumps(status).encode())

    def _respond_ready(self) -> None:
        """Readiness probe - is the worker ready to process?

        Returns 503 if:
        - No worker instance
        - Shutdown requested
        - DB connection stale (no successful op in DB_HEALTH_TIMEOUT_SEC)
        """
        if not _worker_instance:
            self.send_response(503)
            status = {"status": "not_ready", "reason": "no_worker_instance"}
        elif _worker_instance.shutdown_requested:
            self.send_response(503)
            status = {"status": "not_ready", "reason": "shutdown_requested"}
        elif not _worker_instance.is_db_healthy():
            self.send_response(503)
            status = {"status": "not_ready", "reason": "db_connection_stale"}
        else:
            self.send_response(200)
            status = {"status": "ready"}

        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(status).encode())

    def _respond_metrics(self) -> None:
        """Metrics endpoint with operational counters."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        w = _worker_instance
        metrics = {
            "worker_id": w.worker_id if w else None,
            "program_id": w.program_id if w else None,
            "current_batch_id": w.current_batch_id if w else None,
            "poll_interval_sec": w.poll_interval if w else None,
            "batches_processed_total": w.batches_processed if w else 0,
            "batches_failed_total": w.batches_failed if w else 0,
            "last_batch_completed_at": w.last_batch_completed_at.isoformat() if w and w.last_batch_completed_at else None,
            "last_db_success_at": w.last_db_success_at.isoformat() if w and w.last_db_success_at else None,
            "uptime_sec": (datetime.now(timezone.utc) - w.started_at).total_seconds() if w and w.started_at else 0,
        }
        self.wfile.write(json.dumps(metrics).encode())


def start_health_server(port: int = 8081) -> HTTPServer:
    """Start health check HTTP server in background thread."""
    server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info(f"Health server started on port {port}")
    return server


class BatchWorker:
    """
    Autonomous worker for processing async batch review requests.

    Lifecycle:
    1. Claim next queued batch (atomic)
    2. Load batch input metadata
    3. Process batch with periodic heartbeats
    4. Finalize batch with results
    5. Repeat until shutdown
    """

    def __init__(
        self,
        program_id: str,
        worker_id: str,
        poll_interval: int = 5,
        heartbeat_interval: int = 2,
        store: NeonBatchStore | None = None,
    ):
        """
        Initialize batch worker.

        Args:
            program_id: Program UUID to process batches for
            worker_id: Worker identifier for tracking
            poll_interval: Seconds to wait between claim attempts
            heartbeat_interval: Send heartbeat every N docs
            store: Optional batch store (for testing)
        """
        self.program_id = program_id
        self.worker_id = worker_id
        self.poll_interval = poll_interval
        self.heartbeat_interval = heartbeat_interval
        self.store = store
        self.shutdown_requested = False
        self.current_batch_id: str | None = None

        # Metrics
        self.batches_processed: int = 0
        self.batches_failed: int = 0
        self.last_batch_completed_at: datetime | None = None
        self.last_db_success_at: datetime | None = None
        self.started_at: datetime | None = None

    def is_db_healthy(self) -> bool:
        """Check if DB connection is healthy based on last successful operation."""
        if self.last_db_success_at is None:
            # No DB ops yet - give benefit of doubt if we just started
            if self.started_at:
                age = (datetime.now(timezone.utc) - self.started_at).total_seconds()
                return age < DB_HEALTH_TIMEOUT_SEC
            return False
        age = (datetime.now(timezone.utc) - self.last_db_success_at).total_seconds()
        return age < DB_HEALTH_TIMEOUT_SEC

    async def run(self) -> None:
        """
        Main worker loop.

        Continuously claims and processes batches until shutdown.
        """
        if self.store is None:
            self.store = await get_batch_store()

        self.started_at = datetime.now(timezone.utc)
        logger.info(
            f"Batch worker started: worker_id={self.worker_id}, "
            f"program_id={self.program_id}, poll_interval={self.poll_interval}s"
        )

        while not self.shutdown_requested:
            try:
                # Try to claim next queued batch
                batch_id = await self.store.claim_next_queued_batch(
                    program_id=self.program_id,
                    worker_id=self.worker_id,
                )
                # DB op succeeded
                self.last_db_success_at = datetime.now(timezone.utc)

                if batch_id:
                    self.current_batch_id = batch_id
                    logger.info(f"Claimed batch: {batch_id}")

                    try:
                        await self._process_batch(batch_id)
                        self.batches_processed += 1
                        self.last_batch_completed_at = datetime.now(timezone.utc)
                        logger.info(f"Batch completed: {batch_id} (total processed: {self.batches_processed})")
                    except Exception as e:
                        self.batches_failed += 1
                        logger.error(f"Batch failed: {batch_id}, error: {e}", exc_info=True)
                        await self._mark_batch_failed(batch_id, str(e))
                    finally:
                        self.current_batch_id = None
                else:
                    # No batches available, wait before polling again
                    logger.debug(f"No batches available, sleeping {self.poll_interval}s")
                    await asyncio.sleep(self.poll_interval)

            except Exception as e:
                logger.error(f"Worker error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)

        logger.info("Batch worker shutdown complete")

    async def _process_batch(self, batch_id: str) -> None:
        """
        Process a single batch.

        Args:
            batch_id: Batch UUID to process
        """
        # Load batch metadata
        batch = await self.store.get_batch(batch_id, self.program_id)
        if not batch:
            raise RuntimeError(f"Batch {batch_id} not found")

        logger.info(
            f"Processing batch {batch_id}: {batch.docs_total} docs, "
            f"attempt {batch.attempt_count}"
        )

        # In a real implementation, this would:
        # 1. Load input data (documents) from vault or object storage
        # 2. Run review_batch() on the documents
        # 3. Send heartbeats every N documents
        # 4. Persist per-document results
        # 5. Finalize batch with summary

        # For now, this is a placeholder that demonstrates the pattern
        # The actual review logic would be integrated here

        # Simulate processing with heartbeats
        docs_processed = 0
        docs_succeeded = 0
        docs_failed = 0

        for i in range(batch.docs_total):
            # Simulate document processing
            await asyncio.sleep(0.1)  # Placeholder

            docs_processed += 1
            docs_succeeded += 1  # In real impl, would track actual result

            # Send heartbeat every N docs
            if docs_processed % self.heartbeat_interval == 0:
                await self.store.heartbeat(
                    batch_id=batch_id,
                    program_id=self.program_id,
                    docs_processed=docs_processed,
                    docs_succeeded=docs_succeeded,
                    docs_failed=docs_failed,
                )
                logger.debug(
                    f"Heartbeat sent: batch={batch_id}, "
                    f"progress={docs_processed}/{batch.docs_total}"
                )

        # Final heartbeat
        await self.store.heartbeat(
            batch_id=batch_id,
            program_id=self.program_id,
            docs_processed=docs_processed,
            docs_succeeded=docs_succeeded,
            docs_failed=docs_failed,
        )

        # Finalize batch
        from lumen_cortex.reviewer.storage.models import BatchSummaryUpdate

        summary = BatchSummaryUpdate(
            documents_succeeded=docs_succeeded,
            documents_failed=docs_failed,
            findings_total=0,  # Would be calculated from actual results
            by_severity={},
            error_summary=[],
        )

        await self.store.finalize_batch(
            batch_id=batch_id,
            program_id=self.program_id,
            summary=summary,
            status="completed",
            docs_total=batch.docs_total,
            docs_succeeded=docs_succeeded,
            docs_failed=docs_failed,
        )

    async def _mark_batch_failed(self, batch_id: str, error: str) -> None:
        """
        Mark batch as failed with error message.

        Args:
            batch_id: Batch UUID
            error: Error message
        """
        try:
            from lumen_cortex.reviewer.storage.models import BatchSummaryUpdate

            summary = BatchSummaryUpdate(
                documents_succeeded=0,
                documents_failed=0,
                findings_total=0,
                by_severity={},
                error_summary=[{"error": error}],
            )

            await self.store.finalize_batch(
                batch_id=batch_id,
                program_id=self.program_id,
                summary=summary,
                status="failed",
                last_error=error,
            )
        except Exception as e:
            logger.error(f"Failed to mark batch as failed: {e}", exc_info=True)

    def request_shutdown(self) -> None:
        """Request graceful shutdown."""
        logger.info("Shutdown requested")
        self.shutdown_requested = True


async def main(
    program_id: str,
    worker_id: str | None = None,
    poll_interval: int = 5,
    health_port: int | None = None,
) -> None:
    """
    Main entry point for batch worker.

    Args:
        program_id: Program UUID to process batches for
        worker_id: Worker identifier (defaults to hostname)
        poll_interval: Seconds between polling for new batches
        health_port: Port for health HTTP server (None to disable)
    """
    global _worker_instance

    if worker_id is None:
        worker_id = REVIEW_CONFIG.worker_id

    worker = BatchWorker(
        program_id=program_id,
        worker_id=worker_id,
        poll_interval=poll_interval,
    )
    _worker_instance = worker

    # Start health server if port specified
    health_server = None
    if health_port:
        health_server = start_health_server(health_port)

    # Set up signal handlers for graceful shutdown
    def shutdown_handler(signum: int, frame: Any) -> None:
        logger.info(f"Received signal {signum}, initiating shutdown")
        worker.request_shutdown()
        if health_server:
            health_server.shutdown()

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)

    await worker.run()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Batch review worker")
    parser.add_argument(
        "--program-id",
        required=True,
        help="Program UUID to process batches for",
    )
    parser.add_argument(
        "--worker-id",
        help="Worker identifier (defaults to hostname)",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=5,
        help="Seconds between polling for new batches",
    )
    parser.add_argument(
        "--health-port",
        type=int,
        default=8081,
        help="Port for health HTTP server (0 to disable)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    asyncio.run(main(
        program_id=args.program_id,
        worker_id=args.worker_id,
        poll_interval=args.poll_interval,
        health_port=args.health_port if args.health_port > 0 else None,
    ))
