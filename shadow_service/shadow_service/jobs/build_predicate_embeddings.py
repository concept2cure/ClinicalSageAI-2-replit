"""Predicate Embedding Builder — Phase 6.6.A.

Generates OpenAI text-embedding-3-large vectors for clearances lacking embeddings
and upserts into predicate.fda_510k_embeddings.

Usage:
    python -m shadow_service.jobs.build_predicate_embeddings

Triggered after ingest completes.  Idempotent (skips already-embedded clearances).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from shadow_service import sql_fda_universe as sql

logger = logging.getLogger(__name__)

OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings"
EMBED_MODEL = "text-embedding-3-large"
EMBED_DIMENSIONS = 1536
BATCH_SIZE = 50  # Max texts per OpenAI request


class PredicateEmbeddingBuilder:
    """Generates and stores embeddings for FDA 510(k) clearances."""

    def __init__(
        self,
        pool: Any,
        openai_api_key: Optional[str] = None,
    ) -> None:
        self.pool = pool
        self.openai_api_key = openai_api_key or os.environ.get("OPENAI_API_KEY", "")
        self.stats = {
            "processed": 0,
            "embedded": 0,
            "skipped": 0,
            "errors": [],
        }

    async def run(self, limit: int = 1000) -> dict[str, Any]:
        """Generate embeddings for clearances that don't have them yet."""
        start = datetime.now(timezone.utc)
        logger.info("Embedding builder started (limit=%d)", limit)

        # 1. Find clearances needing embeddings
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(sql.SELECT_CLEARANCES_NEEDING_EMBEDDINGS, limit)

        if not rows:
            logger.info("All clearances already have embeddings")
            return self.stats

        # 2. Process in batches
        batch: list[dict[str, str]] = []
        for row in rows:
            k_number = row["k_number"]  # type: ignore[index]
            text = self._build_embed_text(row)
            if not text:
                self.stats["skipped"] += 1
                continue
            batch.append({"k_number": k_number, "text": text})

            if len(batch) >= BATCH_SIZE:
                await self._embed_batch(batch)
                batch = []

        if batch:
            await self._embed_batch(batch)

        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.info(
            "Embedding builder done in %.1fs — %d embedded, %d skipped",
            elapsed,
            self.stats["embedded"],
            self.stats["skipped"],
        )
        return self.stats

    @staticmethod
    def _build_embed_text(row: Any) -> str:
        """Concatenate meaningful fields for embedding."""
        parts = []
        device_name = row.get("device_name") or row.get("device_name", "")  # type: ignore[union-attr]
        txt_content = row.get("txt_content") or row.get("txt_content", "")  # type: ignore[union-attr]
        if device_name:
            parts.append(f"Device: {device_name}")
        if txt_content:
            # Truncate to ~8000 tokens (~32000 chars)
            parts.append(txt_content[:32000])
        return " ".join(parts).strip()

    async def _embed_batch(self, batch: list[dict[str, str]]) -> None:
        """Send batch to OpenAI and upsert results."""
        texts = [item["text"] for item in batch]
        self.stats["processed"] += len(batch)

        try:
            embeddings = await self._call_openai_embeddings(texts)
        except Exception as exc:  # noqa: BLE001
            msg = f"OpenAI batch error: {exc}"
            logger.warning(msg)
            self.stats["errors"].append(msg)
            return

        async with self.pool.acquire() as conn:
            for item, embedding in zip(batch, embeddings):
                try:
                    chash = hashlib.sha256(item["text"].encode()).hexdigest()
                    await conn.execute(
                        sql.UPSERT_EMBEDDING,
                        item["k_number"],   # $1
                        embedding,          # $2  (list[float])
                        chash,              # $3
                        EMBED_MODEL,        # $4
                    )
                    self.stats["embedded"] += 1
                except Exception as exc:  # noqa: BLE001
                    msg = f"Embed upsert {item['k_number']}: {exc}"
                    logger.warning(msg)
                    self.stats["errors"].append(msg)

    async def _call_openai_embeddings(
        self, texts: list[str],
    ) -> list[list[float]]:
        """Call OpenAI embeddings API.  Returns list of vectors."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                OPENAI_EMBED_URL,
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": EMBED_MODEL,
                    "input": texts,
                    "dimensions": EMBED_DIMENSIONS,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

async def _main() -> None:
    import asyncpg  # type: ignore[import-untyped]

    logging.basicConfig(level=logging.INFO)
    dsn = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/concept2cure-ri")
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=5)
    try:
        builder = PredicateEmbeddingBuilder(pool)
        stats = await builder.run()
        print(f"Done: {stats}")  # noqa: T201
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_main())
