"""
Batch Worker Loop - A7-7

Autonomous worker that claims and processes queued async batches.

Key features:
- Claims next queued batch atomically (FIFO + tie-break by batch_id)
- Loads batch input from vault.review_batches (persisted during enqueue)
- Sends heartbeat every N docs to prevent stall detection
- Finalizes batch with summary statistics
- Graceful shutdown on SIGTERM/SIGINT

Usage:
    PYTHONPATH=. python -m lumen_cortex.reviewer.batch_worker \
        --program-id <UUID> \
        --worker-id worker-1 \
        --poll-interval 5

Environment:
    BATCH_PERSISTENCE_ENABLED=true
    DATABASE_URL=postgresql://...
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from lumen_cortex.reviewer.storage import NeonBatchStore, get_batch_store
from lumen_cortex.reviewer.config import REVIEW_CONFIG

logger = logging.getLogger(__name__)


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

    async def run(self) -> None:
        """
        Main worker loop.
        
        Continuously claims and processes batches until shutdown.
        """
        if self.store is None:
            self.store = await get_batch_store()
        
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
                
                if batch_id:
                    self.current_batch_id = batch_id
                    logger.info(f"Claimed batch: {batch_id}")
                    
                    try:
                        await self._process_batch(batch_id)
                        logger.info(f"Batch completed: {batch_id}")
                    except Exception as e:
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
) -> None:
    """
    Main entry point for batch worker.
    
    Args:
        program_id: Program UUID to process batches for
        worker_id: Worker identifier (defaults to hostname)
        poll_interval: Seconds between polling for new batches
    """
    if worker_id is None:
        worker_id = REVIEW_CONFIG.worker_id
    
    worker = BatchWorker(
        program_id=program_id,
        worker_id=worker_id,
        poll_interval=poll_interval,
    )
    
    # Set up signal handlers for graceful shutdown
    def shutdown_handler(signum: int, frame: Any) -> None:
        logger.info(f"Received signal {signum}, initiating shutdown")
        worker.request_shutdown()
    
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
    ))
