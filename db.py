from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


@dataclass
class AppContext:
    user: str | None = None
    reason: str | None = None
    request_id: str | None = None


class Database:
    def __init__(self, dsn: str):
        self.pool = ConnectionPool(
            conninfo=dsn,
            max_size=10,
            timeout=30,
            kwargs={
                "autocommit": False,
                "row_factory": dict_row,
            },
        )

    def close(self) -> None:
        self.pool.close()

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[Any]]:
        with self.pool.connection() as conn:
            yield conn

    @contextmanager
    def transaction(self, ctx: AppContext | None = None) -> Iterator[psycopg.Connection[Any]]:
        with self.connection() as conn:
            with conn.transaction():
                if ctx:
                    self._set_local_context(conn, ctx)
                yield conn

    def _set_local_context(self, conn: psycopg.Connection[Any], ctx: AppContext) -> None:
        # Use set_config to parameterize safely.
        with conn.cursor() as cur:
            if ctx.user is not None:
                cur.execute("SELECT set_config('app.user', %s, true);", (ctx.user,))
            if ctx.reason is not None:
                cur.execute("SELECT set_config('app.reason', %s, true);", (ctx.reason,))
            if ctx.request_id is not None:
                cur.execute("SELECT set_config('app.request_id', %s, true);", (ctx.request_id,))
