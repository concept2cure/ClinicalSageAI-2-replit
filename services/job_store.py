"""A small job store abstraction that uses Redis when available and falls back to in-memory storage for tests."""
from typing import Any, Dict, Optional
import os

try:
    import redis
    _REDIS_AVAILABLE = True
except Exception:
    _REDIS_AVAILABLE = False


class JobStore:
    def set(self, job_id: str, payload: Dict[str, Any]) -> None:
        raise NotImplementedError

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError


class InMemoryJobStore(JobStore):
    def __init__(self):
        self._store = {}

    def set(self, job_id: str, payload: Dict[str, Any]) -> None:
        self._store[job_id] = payload

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self._store.get(job_id)


class RedisJobStore(JobStore):
    def __init__(self, url: str = None):
        url = url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self._client = redis.Redis.from_url(url)

    def set(self, job_id: str, payload: Dict[str, Any]) -> None:
        self._client.hset(f"ectd:job:{job_id}", mapping={k: str(v) for k, v in payload.items()})

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        data = self._client.hgetall(f"ectd:job:{job_id}")
        if not data:
            return None
        return {k.decode(): v.decode() for k, v in data.items()}


# Auto-select store
def get_store() -> JobStore:
    if _REDIS_AVAILABLE:
        try:
            s = RedisJobStore()
            # quick ping
            s._client.ping()
            return s
        except Exception:
            pass
    return InMemoryJobStore()
