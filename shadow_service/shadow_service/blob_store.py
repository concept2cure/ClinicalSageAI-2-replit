"""Phase 6.2 — Blob Store: Abstract interface + local filesystem implementation.

Provides a pluggable storage layer for template files and rendered artifacts.
Default implementation writes to the local filesystem (suitable for dev/staging).
Swap to S3BlobStore or GCSBlobStore for production.

Architecture:
  - BlobStore (ABC): put_bytes, get_bytes, get_stream, delete, exists
  - LocalBlobStore: filesystem-backed, writes under a configurable root dir
  - get_blob_store(): factory that returns the configured store singleton
"""

import hashlib
import io
import logging
import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)


# =============================================================================
# Abstract interface
# =============================================================================

class BlobStore(ABC):
    """Abstract blob storage interface."""

    @abstractmethod
    async def put_bytes(self, key: str, data: bytes) -> dict:
        """Store bytes under the given key.

        Returns: {"sha256": str, "size_bytes": int, "key": str}
        """
        ...

    @abstractmethod
    async def get_bytes(self, key: str) -> bytes:
        """Retrieve raw bytes for the given key.

        Raises FileNotFoundError if key does not exist.
        """
        ...

    @abstractmethod
    async def get_stream(self, key: str) -> BinaryIO:
        """Return a file-like stream for the given key.

        Raises FileNotFoundError if key does not exist.
        """
        ...

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """Delete the blob. Returns True if deleted, False if not found."""
        ...

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Check if a key exists."""
        ...


# =============================================================================
# Local filesystem implementation
# =============================================================================

class LocalBlobStore(BlobStore):
    """Filesystem-backed blob store.

    Stores files at: {root}/{key}
    Default root: storage/artifacts (relative to workspace root).
    """

    def __init__(self, root: str | Path | None = None):
        if root is None:
            # Default: workspace_root/storage/artifacts
            root = os.environ.get(
                "BLOB_STORE_ROOT",
                str(Path(__file__).parent.parent.parent / "storage" / "artifacts"),
            )
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)
        self._root_resolved = self._root.resolve()
        logger.info("LocalBlobStore initialized at: %s", self._root)

    def _resolve(self, key: str) -> Path:
        """Resolve a key to an absolute path (prevent path traversal)."""
        resolved = (self._root_resolved / key).resolve()
        if not resolved.is_relative_to(self._root_resolved):
            raise ValueError(f"Invalid blob key: path traversal detected in '{key}'")
        return resolved

    async def put_bytes(self, key: str, data: bytes) -> dict:
        """Write bytes to disk, compute SHA-256."""
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)

        sha256 = hashlib.sha256(data).hexdigest()
        path.write_bytes(data)

        logger.debug("Stored %d bytes at %s (sha256=%s)", len(data), key, sha256[:12])
        return {
            "sha256": sha256,
            "size_bytes": len(data),
            "key": key,
        }

    async def get_bytes(self, key: str) -> bytes:
        """Read raw bytes from disk."""
        path = self._resolve(key)
        if not path.exists():
            raise FileNotFoundError(f"Blob not found: {key}")
        return path.read_bytes()

    async def get_stream(self, key: str) -> BinaryIO:
        """Return a BytesIO stream (copied into memory for safety)."""
        data = await self.get_bytes(key)
        return io.BytesIO(data)

    async def delete(self, key: str) -> bool:
        """Delete a file from disk."""
        path = self._resolve(key)
        if path.exists():
            path.unlink()
            return True
        return False

    async def exists(self, key: str) -> bool:
        """Check if file exists on disk."""
        path = self._resolve(key)
        return path.exists()


# =============================================================================
# Factory / singleton
# =============================================================================

_store: BlobStore | None = None


def get_blob_store() -> BlobStore:
    """Get or create the blob store singleton.

    Reads BLOB_STORE_TYPE env to select implementation (default: local).
    """
    global _store
    if _store is None:
        store_type = os.environ.get("BLOB_STORE_TYPE", "local").lower()
        if store_type == "local":
            _store = LocalBlobStore()
        else:
            raise ValueError(f"Unknown blob store type: {store_type}")
    return _store


def reset_blob_store() -> None:
    """Reset the singleton (for testing)."""
    global _store
    _store = None
