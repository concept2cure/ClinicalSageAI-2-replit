#!/usr/bin/env python3
"""
Batch Worker Runner Script

Production entry point for the Lumen Cortex batch review worker.
Reads configuration from environment variables for container/k8s deployment.

REQUIRED ENVIRONMENT VARIABLES:
    BATCH_WORKER_PROGRAM_ID     - UUID of the program to process batches for

OPTIONAL ENVIRONMENT VARIABLES:
    BATCH_WORKER_ID             - Worker identifier (defaults to hostname)
    BATCH_WORKER_POLL_INTERVAL  - Seconds between polling (default: 5)
    BATCH_WORKER_LOG_LEVEL      - DEBUG|INFO|WARNING|ERROR (default: INFO)
    BATCH_WORKER_HEARTBEAT_SEC  - Heartbeat interval in docs (default: 10)
    BATCH_WORKER_HEALTH_PORT    - Port for health endpoint (default: 8081, 0 to disable)

    # Database connection (via NeonBatchStore)
    DATABASE_URL                - PostgreSQL connection string

HEALTH ENDPOINTS:
    GET /health   - Liveness probe (always 200 if process is alive)
    GET /ready    - Readiness probe (503 if shutdown requested)
    GET /metrics  - Basic worker metrics JSON

EXAMPLE USAGE:
    # Direct execution
    BATCH_WORKER_PROGRAM_ID=abc123 python scripts/worker/run_batch_worker.py

    # Docker Compose
    docker-compose up batch-worker

    # Kubernetes
    kubectl apply -f k8s/batch-worker-deployment.yaml
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from uuid import UUID

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from lumen_cortex.reviewer.batch_worker import BatchWorker, main


def get_config_from_env() -> dict:
    """
    Read worker configuration from environment variables.

    Returns:
        Configuration dict for BatchWorker

    Raises:
        ValueError: If required environment variables are missing
    """
    program_id = os.environ.get("BATCH_WORKER_PROGRAM_ID")
    if not program_id:
        raise ValueError(
            "BATCH_WORKER_PROGRAM_ID environment variable is required. "
            "Set it to the UUID of the program to process batches for."
        )

    # Validate UUID format
    try:
        UUID(program_id)
    except ValueError as e:
        raise ValueError(
            f"BATCH_WORKER_PROGRAM_ID must be a valid UUID, got: {program_id}"
        ) from e

    # Parse health port (default 8081, 0 to disable)
    health_port_str = os.environ.get("BATCH_WORKER_HEALTH_PORT", "8081")
    health_port = int(health_port_str) if health_port_str else 8081

    return {
        "program_id": program_id,
        "worker_id": os.environ.get("BATCH_WORKER_ID"),
        "poll_interval": int(os.environ.get("BATCH_WORKER_POLL_INTERVAL", "5")),
        "health_port": health_port if health_port > 0 else None,
    }


def setup_logging() -> None:
    """Configure logging based on environment."""
    log_level = os.environ.get("BATCH_WORKER_LOG_LEVEL", "INFO").upper()

    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Reduce noise from third-party libraries
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def main_cli() -> None:
    """
    CLI entry point. Reads config from environment and runs worker.
    """
    setup_logging()
    logger = logging.getLogger(__name__)

    try:
        config = get_config_from_env()
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)

    logger.info(
        f"Starting batch worker: program_id={config['program_id']}, "
        f"worker_id={config.get('worker_id', '<hostname>')}, "
        f"poll_interval={config['poll_interval']}s"
    )

    try:
        asyncio.run(main(**config))
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
    except Exception as e:
        logger.exception(f"Worker crashed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main_cli()
