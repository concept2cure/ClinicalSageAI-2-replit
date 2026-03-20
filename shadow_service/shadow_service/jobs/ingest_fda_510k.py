"""FDA 510(k) Clearance Ingestor — Phase 6.6.A.

Downloads clearances, enforcement reports, and safety signals from openFDA
and upserts into predicate.fda_510k_clearances + predicate_safety_signals.

Usage:
    python -m shadow_service.jobs.ingest_fda_510k

Idempotent: safe to run repeatedly (upsert on k_number).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Optional

import httpx

from shadow_service import sql_fda_universe as sql

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# openFDA API endpoints
# ─────────────────────────────────────────────────────────────────────────────
OPENFDA_510K_URL = "https://api.fda.gov/device/510k.json"
OPENFDA_ENFORCEMENT_URL = "https://api.fda.gov/device/enforcement.json"
OPENFDA_RECALL_URL = "https://api.fda.gov/device/recall.json"
OPENFDA_EVENT_URL = "https://api.fda.gov/device/event.json"

# Severity mappings
RECALL_SEVERITY: dict[str, tuple[str, float]] = {
    "Class I":   ("Class1Recall", 0.95),
    "Class II":  ("Class2Recall", 0.50),
    "Class III": ("Class3Recall", 0.15),
}

PAGE_SIZE = 100
MAX_PAGES = 50  # Safety limit per run


class FDA510kIngestor:
    """Downloads and upserts FDA 510(k) data from openFDA."""

    def __init__(self, pool: Any, api_key: Optional[str] = None) -> None:
        self.pool = pool
        self.api_key = api_key
        self.stats = {
            "clearances_processed": 0,
            "clearances_upserted": 0,
            "signals_processed": 0,
            "signals_upserted": 0,
            "errors": [],
        }

    # ─────────────────────────────────────────────────────────────────────
    # Public entry point
    # ─────────────────────────────────────────────────────────────────────

    async def run(
        self,
        product_codes: Optional[list[str]] = None,
        max_clearances: int = 5_000,
        triggered_by: str = "manual",
    ) -> dict[str, Any]:
        """Full ingestion pipeline.  Idempotent (upsert).

        Writes a row to predicate.fda_ingest_runs at start (status=running)
        and updates it on completion/failure with final stats.
        """
        start = datetime.now(timezone.utc)
        logger.info("FDA 510(k) ingestion started")

        # ── Record run start ──
        run_fingerprint = hashlib.sha256(
            f"{product_codes}:{max_clearances}:{start.date()}".encode()
        ).hexdigest()
        run_id = None
        try:
            async with self.pool.acquire() as conn:
                run_id = await conn.fetchval(
                    sql.INSERT_INGEST_RUN,
                    "ingest_fda_510k",          # $1 job_name
                    product_codes,              # $2 product_codes_filter
                    max_clearances,             # $3 max_clearances_limit
                    triggered_by,               # $4 triggered_by
                    run_fingerprint,            # $5 run_fingerprint
                )
        except Exception as exc:
            logger.warning("Could not log ingest run start: %s", exc)

        final_status = "completed"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # 1. Fetch clearances
                clearances = await self._fetch_clearances(
                    client, product_codes, max_clearances,
                )
                await self._upsert_clearances(clearances)

                # 2. Fetch enforcement (recall) data → safety signals
                await self._fetch_and_flag_enforcement(client)
        except Exception as exc:
            final_status = "failed"
            self.stats["errors"].append(f"Pipeline error: {exc}")
            logger.error("FDA ingestion failed: %s", exc)

        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        self.stats["duration_seconds"] = elapsed

        if self.stats["errors"] and final_status == "completed":
            final_status = "partial"

        # ── Record run completion ──
        if run_id:
            try:
                import json as _json
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        sql.UPDATE_INGEST_RUN_COMPLETED,
                        run_id,                                     # $1
                        final_status,                               # $2
                        elapsed,                                    # $3
                        self.stats["clearances_processed"],         # $4
                        self.stats["clearances_upserted"],          # $5
                        self.stats["signals_processed"],            # $6
                        self.stats["signals_upserted"],             # $7
                        len(self.stats["errors"]),                  # $8
                        _json.dumps(self.stats["errors"][:50]),     # $9 (cap at 50)
                    )
            except Exception as exc:
                logger.warning("Could not log ingest run completion: %s", exc)

        logger.info(
            "FDA ingestion %s in %.1fs — %d clearances, %d signals",
            final_status,
            elapsed,
            self.stats["clearances_upserted"],
            self.stats["signals_upserted"],
        )
        self.stats["run_id"] = str(run_id) if run_id else None
        self.stats["status"] = final_status
        return self.stats

    # ─────────────────────────────────────────────────────────────────────
    # Clearances
    # ─────────────────────────────────────────────────────────────────────

    async def _fetch_clearances(
        self,
        client: httpx.AsyncClient,
        product_codes: Optional[list[str]],
        limit: int,
    ) -> list[dict[str, Any]]:
        """Paginated download from openFDA 510(k) endpoint."""
        all_results: list[dict[str, Any]] = []
        search_parts: list[str] = []

        if product_codes:
            code_filter = "+OR+".join(
                f'product_code:"{c}"' for c in product_codes
            )
            search_parts.append(f"({code_filter})")

        search_query = "+AND+".join(search_parts) if search_parts else ""

        for page in range(MAX_PAGES):
            skip = page * PAGE_SIZE
            if skip >= limit:
                break
            params: dict[str, Any] = {
                "limit": min(PAGE_SIZE, limit - skip),
                "skip": skip,
            }
            if search_query:
                params["search"] = search_query
            if self.api_key:
                params["api_key"] = self.api_key

            try:
                resp = await client.get(OPENFDA_510K_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                results = data.get("results", [])
                if not results:
                    break
                all_results.extend(results)
            except httpx.HTTPStatusError as exc:
                msg = f"openFDA 510k page {page}: HTTP {exc.response.status_code}"
                logger.warning(msg)
                self.stats["errors"].append(msg)
                break
            except Exception as exc:  # noqa: BLE001
                msg = f"openFDA 510k page {page}: {exc}"
                logger.warning(msg)
                self.stats["errors"].append(msg)
                break

        logger.info("Fetched %d clearances from openFDA", len(all_results))
        return all_results

    async def _upsert_clearances(self, clearances: list[dict[str, Any]]) -> None:
        """Upsert clearance rows.  Skips product_codes not yet in ref table."""
        async with self.pool.acquire() as conn:
            for raw in clearances:
                self.stats["clearances_processed"] += 1
                try:
                    knum = raw.get("k_number", "").strip()
                    if not knum:
                        continue

                    # Ensure product code exists
                    pc = raw.get("product_code", "").strip() or None
                    if pc:
                        await conn.execute(
                            sql.UPSERT_PRODUCT_CODE,
                            pc,                                     # $1 code
                            None,                                   # $2 device_class
                            None,                                   # $3 regulation_number
                            raw.get("review_panel"),                # $4 review_panel
                            raw.get("device_name", "Unknown"),      # $5 name
                        )

                    await conn.execute(
                        sql.UPSERT_CLEARANCE,
                        knum,                                           # $1
                        raw.get("applicant"),                           # $2
                        raw.get("device_name", "Unknown"),              # $3
                        pc,                                             # $4
                        _parse_date(raw.get("decision_date")),          # $5
                        _normalize_decision(raw.get("decision_code")),  # $6
                        raw.get("statement_or_summary_url"),            # $7
                        raw.get("clearance_type"),                      # $8
                        None,                                           # $9 txt_content
                        raw.get("statement_or_summary"),                # $10
                        raw.get("third_party_flag") == "Y",             # $11
                        raw.get("expedited_review_flag") == "Y",        # $12
                    )
                    self.stats["clearances_upserted"] += 1
                except Exception as exc:  # noqa: BLE001
                    msg = f"Upsert clearance {raw.get('k_number')}: {exc}"
                    logger.warning(msg)
                    self.stats["errors"].append(msg)

    # ─────────────────────────────────────────────────────────────────────
    # Enforcement / Recalls → Safety Signals
    # ─────────────────────────────────────────────────────────────────────

    async def _fetch_and_flag_enforcement(
        self, client: httpx.AsyncClient,
    ) -> None:
        """Fetch FDA enforcement reports and cross-reference with clearances."""
        for page in range(MAX_PAGES):
            params: dict[str, Any] = {
                "search": 'classification:"Class I"+OR+classification:"Class II"',
                "limit": PAGE_SIZE,
                "skip": page * PAGE_SIZE,
            }
            if self.api_key:
                params["api_key"] = self.api_key

            try:
                resp = await client.get(OPENFDA_ENFORCEMENT_URL, params=params)
                resp.raise_for_status()
                results = resp.json().get("results", [])
                if not results:
                    break
                await self._process_enforcement_batch(results)
            except httpx.HTTPStatusError as exc:
                msg = f"Enforcement page {page}: HTTP {exc.response.status_code}"
                logger.warning(msg)
                self.stats["errors"].append(msg)
                break
            except Exception as exc:  # noqa: BLE001
                msg = f"Enforcement page {page}: {exc}"
                logger.warning(msg)
                self.stats["errors"].append(msg)
                break

    async def _process_enforcement_batch(
        self, results: list[dict[str, Any]],
    ) -> None:
        """Extract K-numbers from recall text + flag safety signals."""
        async with self.pool.acquire() as conn:
            for recall in results:
                self.stats["signals_processed"] += 1
                k_numbers = self._extract_k_numbers(recall)
                if not k_numbers:
                    continue

                classification = recall.get("classification", "")
                signal_type, severity = RECALL_SEVERITY.get(
                    classification, ("Class3Recall", 0.15),
                )

                for knum in k_numbers:
                    # Only flag if clearance exists in our table
                    exists = await conn.fetchval(
                        "SELECT 1 FROM predicate.fda_510k_clearances WHERE k_number = $1",
                        knum,
                    )
                    if not exists:
                        continue

                    try:
                        await conn.execute(
                            sql.UPSERT_SAFETY_SIGNAL,
                            knum,                                            # $1
                            signal_type,                                     # $2
                            _parse_date(recall.get("recall_initiation_date")),  # $3
                            recall.get("reason_for_recall", "")[:2000],      # $4
                            severity,                                        # $5
                            None,                                            # $6 source_url
                            recall.get("recall_number"),                     # $7
                            recall.get("event_id"),                          # $8
                        )
                        self.stats["signals_upserted"] += 1
                    except Exception as exc:  # noqa: BLE001
                        msg = f"Signal upsert {knum}: {exc}"
                        logger.warning(msg)
                        self.stats["errors"].append(msg)

    @staticmethod
    def _extract_k_numbers(recall: dict[str, Any]) -> list[str]:
        """Extract K-numbers (e.g. K123456) from recall text fields."""
        text_fields = [
            recall.get("product_description", ""),
            recall.get("code_info", ""),
            recall.get("reason_for_recall", ""),
        ]
        combined = " ".join(str(f) for f in text_fields if f)
        matches = re.findall(r"\bK\d{6}\b", combined, re.IGNORECASE)
        return list({m.upper() for m in matches})

    # ─────────────────────────────────────────────────────────────────────
    # Lineage Graph Builder
    # ─────────────────────────────────────────────────────────────────────

    async def rebuild_lineage_graph(self, batch_size: int = 200) -> int:
        """Parse 'Predicate Device' references from summary text to build lineage."""
        links_created = 0
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT k_number, txt_content
                FROM predicate.fda_510k_clearances
                WHERE txt_content IS NOT NULL AND LENGTH(txt_content) > 100
                ORDER BY decision_date DESC
                LIMIT $1
                """,
                batch_size,
            )
            for row in rows:
                knum = row["k_number"]  # type: ignore[index]
                text = row["txt_content"] or ""  # type: ignore[index]
                parent_refs = re.findall(
                    r"predicate\s+device[:\s].*?\b(K\d{6})\b",
                    text,
                    re.IGNORECASE,
                )
                for parent in set(p.upper() for p in parent_refs):
                    if parent == knum:
                        continue
                    # Only add if parent exists
                    exists = await conn.fetchval(
                        "SELECT 1 FROM predicate.fda_510k_clearances WHERE k_number = $1",
                        parent,
                    )
                    if exists:
                        await conn.execute(
                            sql.UPSERT_LINEAGE,
                            knum,               # $1 child
                            parent,             # $2 parent
                            "DirectPredicate",  # $3
                            1,                  # $4 distance
                            "summary_parse",    # $5 source
                        )
                        links_created += 1

        logger.info("Lineage graph: %d links created/updated", links_created)
        return links_created


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_date(raw: Any) -> Optional[date]:
    """Parse various FDA date formats → date or None."""
    if raw is None:
        return None
    if isinstance(raw, date):
        return raw
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y%m%d", "%B %d, %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _normalize_decision(raw: Any) -> Optional[str]:
    """Map FDA decision codes to our CHECK constraint values."""
    if raw is None:
        return None
    s = str(raw).strip().upper()
    mapping = {"SESE": "SESE", "SE": "SE", "NSE": "NSE"}
    return mapping.get(s, s if s in ("SE", "NSE", "SESE", "PanelTrack") else None)


def content_hash(text: str) -> str:
    """SHA-256 hash for cache invalidation."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

async def _main() -> None:
    """Run ingestion from CLI.

    Usage:
        python -m shadow_service.jobs.ingest_fda_510k
        python -m shadow_service.jobs.ingest_fda_510k --dry-run
        python -m shadow_service.jobs.ingest_fda_510k --limit 200
        python -m shadow_service.jobs.ingest_fda_510k --limit 200 --codes QEI QGO
    """
    import argparse
    import os
    import asyncpg  # type: ignore[import-untyped]

    parser = argparse.ArgumentParser(description="FDA 510(k) Clearance Ingestor")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate config and print plan without writing to DB")
    parser.add_argument("--limit", type=int, default=5_000,
                        help="Max clearances to fetch (default: 5000)")
    parser.add_argument("--codes", nargs="*", default=None,
                        help="Product codes to filter (e.g., QEI QGO)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    logger.info("FDA 510(k) ingestor — limit=%d, codes=%s, dry_run=%s",
                args.limit, args.codes, args.dry_run)

    if args.dry_run:
        logger.info("DRY RUN — would fetch up to %d clearances for codes=%s. Exiting.",
                     args.limit, args.codes or "ALL")
        return

    dsn = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/concept2cure-ri")
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=5)
    try:
        ingestor = FDA510kIngestor(pool, api_key=os.environ.get("OPENFDA_API_KEY"))
        stats = await ingestor.run(
            product_codes=args.codes,
            max_clearances=args.limit,
            triggered_by="cli",
        )
        print(f"Done: {stats}")  # noqa: T201
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_main())
