"""
Test Data Seed Script for Shadow Service
=========================================

Inserts sample data for testing and demonstration purposes.
Part 11 compliant - all insertions use proper attribution headers.

Usage:
    python -m shadow_service.seed_test_data [--program-id UUID]
    
Environment:
    DATABASE_URL: PostgreSQL connection string
    
Note: This script is for development/testing only. Do not run in production.
"""
import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta
from uuid import UUID, uuid4
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)

# =============================================================================
# Sample Data Generators
# =============================================================================

def generate_program_id() -> UUID:
    """Generate or return the test program ID."""
    return uuid4()


def generate_drift_test_data(program_id: UUID) -> list:
    """Generate sample drift monitoring data."""
    base_time = datetime.utcnow()
    
    return [
        # Active drift jobs
        {
            "sql": """
                INSERT INTO monitoring.drift_jobs (
                    id, program_id, source_type, target_id, schedule_cron,
                    status, last_run_at, next_run_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "PROSE_SNAPSHOT", uuid4(),
                "0 */6 * * *", "ACTIVE", base_time - timedelta(hours=6),
                base_time + timedelta(hours=6), "system@trialsage.ai"
            ],
            "description": "Active drift job - prose snapshot monitoring"
        },
        {
            "sql": """
                INSERT INTO monitoring.drift_jobs (
                    id, program_id, source_type, target_id, schedule_cron,
                    status, last_run_at, next_run_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "REGULATORY_CHECKPOINT", uuid4(),
                "0 0 * * *", "ACTIVE", base_time - timedelta(days=1),
                base_time + timedelta(days=1), "system@trialsage.ai"
            ],
            "description": "Active drift job - regulatory checkpoint"
        },
        {
            "sql": """
                INSERT INTO monitoring.drift_jobs (
                    id, program_id, source_type, target_id, schedule_cron,
                    status, last_run_at, next_run_at, error_message, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "TRUTH_STORE", uuid4(),
                "0 */4 * * *", "FAILED", base_time - timedelta(hours=4),
                base_time + timedelta(hours=4), "Connection timeout during hash computation",
                "system@trialsage.ai"
            ],
            "description": "Failed drift job - for testing error states"
        },
    ]


def generate_drift_alerts(program_id: UUID, job_ids: list) -> list:
    """Generate sample drift alerts."""
    base_time = datetime.utcnow()
    
    return [
        {
            "sql": """
                INSERT INTO monitoring.drift_alerts (
                    id, program_id, job_id, alert_type, severity,
                    message, created_at, acknowledged_at, acknowledged_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, job_ids[0] if job_ids else uuid4(),
                "CONTENT_DRIFT", "HIGH",
                "Significant content drift detected in Module 2.5 (>15% semantic change)",
                base_time - timedelta(hours=2), None, None
            ],
            "description": "Unacknowledged high-severity drift alert"
        },
        {
            "sql": """
                INSERT INTO monitoring.drift_alerts (
                    id, program_id, job_id, alert_type, severity,
                    message, created_at, acknowledged_at, acknowledged_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, job_ids[1] if len(job_ids) > 1 else uuid4(),
                "SCHEDULE_MISSED", "MEDIUM",
                "Scheduled drift check was delayed by 15 minutes",
                base_time - timedelta(days=1), base_time - timedelta(hours=12),
                "qa_manager@trialsage.ai"
            ],
            "description": "Acknowledged medium-severity alert"
        },
        {
            "sql": """
                INSERT INTO monitoring.drift_alerts (
                    id, program_id, job_id, alert_type, severity,
                    message, created_at, acknowledged_at, acknowledged_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, job_ids[0] if job_ids else uuid4(),
                "VERSION_MISMATCH", "CRITICAL",
                "Source document version mismatch detected - potential regulatory impact",
                base_time - timedelta(minutes=30), None, None
            ],
            "description": "Critical alert requiring immediate attention"
        },
    ]


def generate_regulatory_test_data(program_id: UUID) -> list:
    """Generate sample regulatory timeline data."""
    base_time = datetime.utcnow()
    
    return [
        # Active IND submission
        {
            "sql": """
                INSERT INTO regulatory.submissions (
                    id, program_id, submission_type, submission_subtype,
                    status, target_date, agency, region, dossier_format,
                    created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "IND", "ORIGINAL",
                "IN_PREPARATION", base_time + timedelta(days=45),
                "FDA", "US", "eCTD",
                "reg_affairs@trialsage.ai", base_time - timedelta(days=30)
            ],
            "description": "Active IND submission - in preparation"
        },
        # Submitted NDA
        {
            "sql": """
                INSERT INTO regulatory.submissions (
                    id, program_id, submission_type, submission_subtype,
                    status, target_date, actual_date, agency, region, dossier_format,
                    created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "NDA", "505(b)(2)",
                "SUBMITTED", base_time - timedelta(days=10), base_time - timedelta(days=10),
                "FDA", "US", "eCTD",
                "reg_affairs@trialsage.ai", base_time - timedelta(days=180)
            ],
            "description": "Submitted NDA - awaiting response"
        },
        # EU MAA
        {
            "sql": """
                INSERT INTO regulatory.submissions (
                    id, program_id, submission_type, submission_subtype,
                    status, target_date, agency, region, dossier_format,
                    created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "MAA", "CENTRALIZED",
                "PLANNING", base_time + timedelta(days=90),
                "EMA", "EU", "eCTD",
                "reg_affairs@trialsage.ai", base_time - timedelta(days=14)
            ],
            "description": "EU MAA in planning phase"
        },
    ]


def generate_regulatory_milestones(program_id: UUID, submission_ids: list) -> list:
    """Generate sample regulatory milestones."""
    base_time = datetime.utcnow()
    
    milestones = []
    if submission_ids:
        # Milestones for first submission
        milestones.extend([
            {
                "sql": """
                    INSERT INTO regulatory.milestones (
                        id, submission_id, milestone_type, milestone_name,
                        planned_date, status, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO NOTHING
                    RETURNING id
                """,
                "params": [
                    uuid4(), submission_ids[0], "DOCUMENT_PREPARATION",
                    "CTD Module 2.5 Clinical Overview",
                    base_time + timedelta(days=14), "IN_PROGRESS",
                    "reg_affairs@trialsage.ai"
                ],
                "description": "Module 2.5 preparation milestone"
            },
            {
                "sql": """
                    INSERT INTO regulatory.milestones (
                        id, submission_id, milestone_type, milestone_name,
                        planned_date, status, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO NOTHING
                    RETURNING id
                """,
                "params": [
                    uuid4(), submission_ids[0], "QUALITY_REVIEW",
                    "QC Review - eCTD Validation",
                    base_time + timedelta(days=30), "NOT_STARTED",
                    "qa_manager@trialsage.ai"
                ],
                "description": "QC validation milestone"
            },
            {
                "sql": """
                    INSERT INTO regulatory.milestones (
                        id, submission_id, milestone_type, milestone_name,
                        planned_date, actual_date, status, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO NOTHING
                    RETURNING id
                """,
                "params": [
                    uuid4(), submission_ids[0], "INTERNAL_APPROVAL",
                    "Regulatory Strategy Sign-off",
                    base_time - timedelta(days=5), base_time - timedelta(days=3),
                    "COMPLETED", "reg_director@trialsage.ai"
                ],
                "description": "Completed strategy sign-off"
            },
        ])
    
    return milestones


def generate_ectd_test_data(program_id: UUID) -> list:
    """Generate sample eCTD package data."""
    base_time = datetime.utcnow()
    
    return [
        # Complete package
        {
            "sql": """
                INSERT INTO ectd.packages (
                    id, program_id, sequence_number, package_type,
                    status, validation_status, created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "0001", "ORIGINAL",
                "VALIDATED", "PASSED",
                "ectd_specialist@trialsage.ai", base_time - timedelta(days=7)
            ],
            "description": "Validated original sequence"
        },
        # Draft package
        {
            "sql": """
                INSERT INTO ectd.packages (
                    id, program_id, sequence_number, package_type,
                    status, validation_status, created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "0002", "AMENDMENT",
                "DRAFT", "NOT_VALIDATED",
                "ectd_specialist@trialsage.ai", base_time - timedelta(days=2)
            ],
            "description": "Draft amendment sequence"
        },
        # Package with validation errors
        {
            "sql": """
                INSERT INTO ectd.packages (
                    id, program_id, sequence_number, package_type,
                    status, validation_status, validation_errors,
                    created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "0003", "RESPONSE",
                "VALIDATION_FAILED", "FAILED",
                '["Missing regional.xml", "Invalid lifecycle operator in m2.5"]',
                "ectd_specialist@trialsage.ai", base_time - timedelta(days=1)
            ],
            "description": "Package with validation errors for testing"
        },
    ]


def generate_governance_test_data(program_id: UUID) -> list:
    """Generate sample purge/governance data."""
    base_time = datetime.utcnow()
    
    return [
        # Pending purge request
        {
            "sql": """
                INSERT INTO retention.purge_requests (
                    id, program_id, object_type, object_id, object_label,
                    requested_action, reason, requested_by, required_approvals,
                    status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "SNAPSHOT", uuid4(),
                "Outdated draft - superseded by v2.0",
                "TOMBSTONE", "Superseded by updated submission snapshot",
                "data_steward@trialsage.ai", ["QA_MANAGER", "LEGAL"],
                "PENDING_APPROVAL", base_time - timedelta(days=3)
            ],
            "description": "Pending purge request awaiting approval"
        },
        # Approved and executed
        {
            "sql": """
                INSERT INTO retention.purge_requests (
                    id, program_id, object_type, object_id, object_label,
                    requested_action, reason, requested_by, required_approvals,
                    status, approved_at, executed_at, executed_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "AUDIT_LOG_BUNDLE", uuid4(),
                "Audit bundle 2023-Q1 - archived",
                "ARCHIVE", "Quarterly archive as per retention policy",
                "compliance_officer@trialsage.ai", ["QA_MANAGER", "DATA_GOVERNANCE"],
                "COMPLETED", base_time - timedelta(days=30),
                base_time - timedelta(days=28), "system@trialsage.ai",
                base_time - timedelta(days=35)
            ],
            "description": "Completed purge request"
        },
        # Rejected request
        {
            "sql": """
                INSERT INTO retention.purge_requests (
                    id, program_id, object_type, object_id, object_label,
                    requested_action, reason, requested_by, required_approvals,
                    status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            """,
            "params": [
                uuid4(), program_id, "TRUTH_DATAPOINT", uuid4(),
                "Clinical endpoint data - study ABC-001",
                "FULL_PURGE", "Data quality issue identified",
                "data_analyst@trialsage.ai", ["QA_MANAGER", "LEGAL", "REGULATORY_AFFAIRS"],
                "REJECTED", base_time - timedelta(days=10)
            ],
            "description": "Rejected purge request - regulatory data"
        },
    ]


# =============================================================================
# Seed Execution
# =============================================================================

async def seed_data(program_id: Optional[UUID] = None, dry_run: bool = False):
    """
    Execute the data seeding process.
    
    Args:
        program_id: Optional program ID. If not provided, generates a new one.
        dry_run: If True, only prints SQL without executing.
    """
    from . import db
    
    pid = program_id or generate_program_id()
    logger.info(f"Seeding test data for program: {pid}")
    
    # Track created IDs for dependent data
    drift_job_ids = []
    submission_ids = []
    ectd_package_ids = []
    
    try:
        # Initialize database connection
        await db.init_pool()
        
        # Set attribution context using parameterized queries
        conn = await db.acquire_connection()
        await db.set_session_context(
            conn,
            user='seed_script@trialsage.ai',
            reason='Test data seeding for development',
            request_id=str(uuid4()),
        )
        
        async with conn.transaction():
            # 1. Seed Drift Monitoring Data
            logger.info("Seeding drift monitoring data...")
            for item in generate_drift_test_data(pid):
                if dry_run:
                    logger.info(f"[DRY RUN] {item['description']}")
                    continue
                try:
                    result = await conn.fetchrow(item['sql'], *item['params'])
                    if result:
                        drift_job_ids.append(result['id'])
                        logger.info(f"  ✓ {item['description']}")
                except Exception as e:
                    logger.warning(f"  ✗ {item['description']}: {e}")
            
            # 1b. Seed Drift Alerts (depends on jobs)
            if drift_job_ids and not dry_run:
                logger.info("Seeding drift alerts...")
                for item in generate_drift_alerts(pid, drift_job_ids):
                    try:
                        result = await conn.fetchrow(item['sql'], *item['params'])
                        if result:
                            logger.info(f"  ✓ {item['description']}")
                    except Exception as e:
                        logger.warning(f"  ✗ {item['description']}: {e}")
            
            # 2. Seed Regulatory Data
            logger.info("Seeding regulatory data...")
            for item in generate_regulatory_test_data(pid):
                if dry_run:
                    logger.info(f"[DRY RUN] {item['description']}")
                    continue
                try:
                    result = await conn.fetchrow(item['sql'], *item['params'])
                    if result:
                        submission_ids.append(result['id'])
                        logger.info(f"  ✓ {item['description']}")
                except Exception as e:
                    logger.warning(f"  ✗ {item['description']}: {e}")
            
            # 2b. Seed Regulatory Milestones (depends on submissions)
            if submission_ids and not dry_run:
                logger.info("Seeding regulatory milestones...")
                for item in generate_regulatory_milestones(pid, submission_ids):
                    try:
                        result = await conn.fetchrow(item['sql'], *item['params'])
                        if result:
                            logger.info(f"  ✓ {item['description']}")
                    except Exception as e:
                        logger.warning(f"  ✗ {item['description']}: {e}")
            
            # 3. Seed eCTD Data
            logger.info("Seeding eCTD package data...")
            for item in generate_ectd_test_data(pid):
                if dry_run:
                    logger.info(f"[DRY RUN] {item['description']}")
                    continue
                try:
                    result = await conn.fetchrow(item['sql'], *item['params'])
                    if result:
                        ectd_package_ids.append(result['id'])
                        logger.info(f"  ✓ {item['description']}")
                except Exception as e:
                    logger.warning(f"  ✗ {item['description']}: {e}")
            
            # 4. Seed Governance Data
            logger.info("Seeding governance data...")
            for item in generate_governance_test_data(pid):
                if dry_run:
                    logger.info(f"[DRY RUN] {item['description']}")
                    continue
                try:
                    result = await conn.fetchrow(item['sql'], *item['params'])
                    if result:
                        logger.info(f"  ✓ {item['description']}")
                except Exception as e:
                    logger.warning(f"  ✗ {item['description']}: {e}")
        
        await db.release_connection(conn)
        
        # Summary
        logger.info("=" * 60)
        logger.info("SEED SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Program ID: {pid}")
        logger.info(f"Drift Jobs Created: {len(drift_job_ids)}")
        logger.info(f"Submissions Created: {len(submission_ids)}")
        logger.info(f"eCTD Packages Created: {len(ectd_package_ids)}")
        
        if not dry_run:
            logger.info("\nTest the seeded data with:")
            logger.info(f"  curl -X GET 'http://localhost:8000/drift/dashboard/summary?program_id={pid}'")
            logger.info(f"  curl -X GET 'http://localhost:8000/regulatory/dashboard/summary?program_id={pid}'")
            logger.info(f"  curl -X GET 'http://localhost:8000/ectd/dashboard/summary?program_id={pid}'")
            logger.info(f"  curl -X GET 'http://localhost:8000/governance/dashboard/summary?program_id={pid}'")
        
        return {
            "program_id": str(pid),
            "drift_jobs": [str(i) for i in drift_job_ids],
            "submissions": [str(i) for i in submission_ids],
            "ectd_packages": [str(i) for i in ectd_package_ids],
        }
        
    except Exception as e:
        logger.exception(f"Seeding failed: {e}")
        raise


async def cleanup_test_data(program_id: UUID):
    """
    Remove test data for a specific program.
    
    Warning: This permanently deletes data. Use with caution.
    """
    from . import db
    
    logger.warning(f"Cleaning up test data for program: {program_id}")
    
    try:
        await db.init_pool()
        conn = await db.acquire_connection()
        await db.set_session_context(
            conn,
            user='cleanup_script@trialsage.ai',
            reason='Test data cleanup',
        )
        
        async with conn.transaction():
            # Delete in reverse dependency order
            cleanup_queries = [
                ("retention.purge_approvals", "request_id IN (SELECT id FROM retention.purge_requests WHERE program_id = $1)"),
                ("retention.purge_requests", "program_id = $1"),
                ("ectd.documents", "package_id IN (SELECT id FROM ectd.packages WHERE program_id = $1)"),
                ("ectd.packages", "program_id = $1"),
                ("regulatory.milestones", "submission_id IN (SELECT id FROM regulatory.submissions WHERE program_id = $1)"),
                ("regulatory.submissions", "program_id = $1"),
                ("monitoring.drift_alerts", "program_id = $1"),
                ("monitoring.drift_history", "job_id IN (SELECT id FROM monitoring.drift_jobs WHERE program_id = $1)"),
                ("monitoring.drift_jobs", "program_id = $1"),
            ]
            
            for table, condition in cleanup_queries:
                try:
                    result = await conn.execute(f"DELETE FROM {table} WHERE {condition}", program_id)
                    logger.info(f"  ✓ Cleaned {table}: {result}")
                except Exception as e:
                    logger.warning(f"  ✗ Failed to clean {table}: {e}")
        
        await db.release_connection(conn)
        logger.info("Cleanup complete")
        
    except Exception as e:
        logger.exception(f"Cleanup failed: {e}")
        raise


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    """CLI entry point for seeding script."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Seed test data for Shadow Service",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Seed with new program ID
    python -m shadow_service.seed_test_data
    
    # Seed with specific program ID
    python -m shadow_service.seed_test_data --program-id 12345678-1234-1234-1234-123456789abc
    
    # Dry run (show SQL without executing)
    python -m shadow_service.seed_test_data --dry-run
    
    # Cleanup test data
    python -m shadow_service.seed_test_data --cleanup --program-id 12345678-1234-1234-1234-123456789abc
        """
    )
    
    parser.add_argument(
        "--program-id", "-p",
        type=str,
        help="Program ID to use (generates new if not provided)"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Print SQL without executing"
    )
    parser.add_argument(
        "--cleanup", "-c",
        action="store_true",
        help="Remove test data for the specified program"
    )
    
    args = parser.parse_args()
    
    program_id = UUID(args.program_id) if args.program_id else None
    
    if args.cleanup:
        if not program_id:
            parser.error("--cleanup requires --program-id")
        asyncio.run(cleanup_test_data(program_id))
    else:
        asyncio.run(seed_data(program_id=program_id, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
