#!/usr/bin/env python3
"""
Retention Sweep Job - Automated purge request creation for expired records.

This job scans for records that have passed their retention date and are not
under legal hold, then creates purge requests for them. It does NOT execute
the purge - that requires human approval.

Usage:
    # Dry run (default) - show what would be created
    python -m shadow_service.jobs.retention_sweep --dry-run
    
    # Create purge requests
    python -m shadow_service.jobs.retention_sweep --execute
    
    # Limit number of requests to create
    python -m shadow_service.jobs.retention_sweep --execute --limit 10

Part 11 alignment: Automated identification of retention-expired records
with human approval required before any data destruction.
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from shadow_service import db
from shadow_service import sql_purge as sql

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("retention_sweep")


class RetentionSweepJob:
    """Job to scan for retention-expired records and create purge requests."""
    
    def __init__(
        self,
        dry_run: bool = True,
        limit: int = 100,
        actor: str = "retention.sweep@system",
        default_action: str = "TOMBSTONE",
        required_approvals: List[str] = None,
    ):
        self.dry_run = dry_run
        self.limit = limit
        self.actor = actor
        self.default_action = default_action
        self.required_approvals = required_approvals or ["QA", "LEGAL"]
        
        # Stats
        self.stats = {
            "scanned_at": None,
            "total_expired": 0,
            "by_type": {},
            "requests_created": 0,
            "errors": [],
        }
    
    async def run(self) -> Dict[str, Any]:
        """Execute the retention sweep."""
        self.stats["scanned_at"] = datetime.utcnow().isoformat()
        
        logger.info(f"Starting retention sweep (dry_run={self.dry_run}, limit={self.limit})")
        
        try:
            # Initialize database connection
            await db.get_pool()
            
            # Find expired records
            expired_records = await self._find_expired_records()
            self.stats["total_expired"] = len(expired_records)
            
            logger.info(f"Found {len(expired_records)} retention-expired records")
            
            if len(expired_records) == 0:
                logger.info("No expired records found - sweep complete")
                return self.stats
            
            # Group by type for reporting
            for record in expired_records:
                obj_type = record["object_type"]
                self.stats["by_type"][obj_type] = self.stats["by_type"].get(obj_type, 0) + 1
            
            logger.info(f"Expired by type: {self.stats['by_type']}")
            
            if self.dry_run:
                logger.info("DRY RUN - Would create purge requests for:")
                for record in expired_records:
                    logger.info(
                        f"  - {record['object_type']} {record['object_id']}: "
                        f"{record['object_label']} (expired: {record['retention_until']})"
                    )
                return self.stats
            
            # Create purge requests
            for record in expired_records:
                try:
                    await self._create_purge_request(record)
                    self.stats["requests_created"] += 1
                except Exception as e:
                    error_msg = f"Failed to create request for {record['object_id']}: {e}"
                    logger.error(error_msg)
                    self.stats["errors"].append(error_msg)
            
            logger.info(f"Created {self.stats['requests_created']} purge requests")
            
        except Exception as e:
            logger.exception("Retention sweep failed")
            self.stats["errors"].append(f"Job failed: {e}")
        
        finally:
            await db.close_pool()
        
        return self.stats
    
    async def _find_expired_records(self) -> List[Dict[str, Any]]:
        """Find records past retention date without active purge requests."""
        records = await db.fetch(sql.SQL_FIND_RETENTION_EXPIRED_RECORDS, self.limit)
        return [dict(r) for r in records]
    
    async def _create_purge_request(self, record: Dict[str, Any]) -> None:
        """Create a purge request for an expired record."""
        conn = await db.get_connection()
        try:
            async with conn.transaction():
                # Set attribution
                await conn.execute(f"SET LOCAL app.user = '{self.actor}'")
                await conn.execute(
                    f"SET LOCAL app.request_id = 'RETENTION-SWEEP-{datetime.utcnow().strftime(\"%Y%m%d-%H%M%S\")}'"
                )
                
                reason = (
                    f"Automated retention sweep: Record retention period expired on "
                    f"{record['retention_until']}. Created by system job for review."
                )
                
                await conn.fetchrow(
                    sql.SQL_CREATE_PURGE_REQUEST_SIMPLE,
                    record.get("program_id"),
                    record["object_type"],
                    record["object_id"],
                    record["object_label"],
                    self.default_action,
                    reason,
                    self.actor,
                    self.required_approvals,
                    None,  # scheduled_execution_at
                )
                
                logger.debug(f"Created purge request for {record['object_type']} {record['object_id']}")
                
        finally:
            await db.release_connection(conn)


async def get_retention_summary() -> Dict[str, Any]:
    """Get a summary of retention status across the system."""
    try:
        await db.get_pool()
        
        record = await db.fetchrow(sql.SQL_COUNT_RETENTION_EXPIRED)
        
        return {
            "expired_snapshots": record["expired_snapshots"] if record else 0,
            "expired_fragments": record["expired_fragments"] if record else 0,
            "total_expired": record["total_expired"] if record else 0,
            "checked_at": datetime.utcnow().isoformat(),
        }
        
    finally:
        await db.close_pool()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Retention Sweep Job - Create purge requests for expired records"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Show what would be done without creating requests (default: True)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually create purge requests (overrides --dry-run)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of purge requests to create (default: 100)",
    )
    parser.add_argument(
        "--actor",
        type=str,
        default="retention.sweep@system",
        help="Actor identity for created requests",
    )
    parser.add_argument(
        "--action",
        type=str,
        choices=["ARCHIVE", "TOMBSTONE", "FULL_PURGE"],
        default="TOMBSTONE",
        help="Default purge action (default: TOMBSTONE)",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Only show retention summary, don't create requests",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Summary mode
    if args.summary_only:
        summary = asyncio.run(get_retention_summary())
        print("\nRetention Status Summary")
        print("=" * 40)
        print(f"  Expired Snapshots:  {summary['expired_snapshots']}")
        print(f"  Expired Fragments:  {summary['expired_fragments']}")
        print(f"  Total Expired:      {summary['total_expired']}")
        print(f"  Checked At:         {summary['checked_at']}")
        return
    
    # Determine dry run mode
    dry_run = not args.execute
    
    if dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN MODE - No changes will be made")
        print("Use --execute to create purge requests")
        print("=" * 60 + "\n")
    else:
        print("\n" + "=" * 60)
        print("EXECUTE MODE - Purge requests will be created")
        print("=" * 60 + "\n")
    
    # Run the job
    job = RetentionSweepJob(
        dry_run=dry_run,
        limit=args.limit,
        actor=args.actor,
        default_action=args.action,
    )
    
    stats = asyncio.run(job.run())
    
    # Print results
    print("\nRetention Sweep Results")
    print("=" * 40)
    print(f"  Scanned At:         {stats['scanned_at']}")
    print(f"  Total Expired:      {stats['total_expired']}")
    print(f"  By Type:")
    for obj_type, count in stats["by_type"].items():
        print(f"    - {obj_type}: {count}")
    print(f"  Requests Created:   {stats['requests_created']}")
    
    if stats["errors"]:
        print(f"\nErrors ({len(stats['errors'])}):")
        for error in stats["errors"]:
            print(f"  - {error}")
    
    # Exit with error code if there were failures
    if stats["errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
