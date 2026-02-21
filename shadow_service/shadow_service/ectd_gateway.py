"""Phase 6.6.H — eCTD Gateway Packaging.

Deterministic ZIP assembler for eCTD submissions. Wraps the Sequence Builder
output + Leaf Registry + contract snapshot into a single gateway ZIP.

Hard rules:
  - Stable ordering: entries sorted lexicographically by path
  - No absolute paths: every entry validated as relative
  - No missing checksums: every file has SHA-256 in the manifest
  - Verify-after-build: ZIP is re-read and all checksums re-verified
  - Everything driven from manifest + contract snapshot

This is the final packaging step. The output ZIP is what gets submitted
to an eCTD gateway (or stored as the regulatory package).
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import zipfile
from typing import Any

logger = logging.getLogger(__name__)

# Safety limits (same as proof_pack_zip.py)
MAX_ZIP_SIZE_BYTES = int(os.environ.get("ECTD_GATEWAY_MAX_ZIP_BYTES", str(200 * 1024 * 1024)))  # 200 MB
MAX_ENTRY_COUNT = 1000
MAX_SINGLE_ENTRY_BYTES = 50 * 1024 * 1024  # 50 MB

# Only allow safe relative paths
_UNSAFE_PATH_RE = re.compile(r"(^/|\\|\.\.)")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _validate_relative_path(path: str) -> None:
    """Raise ValueError if path is absolute or contains traversal."""
    if _UNSAFE_PATH_RE.search(path):
        raise ValueError(f"Unsafe path rejected (absolute or traversal): {path!r}")
    if os.path.isabs(path):
        raise ValueError(f"Absolute path rejected: {path!r}")


class GatewayPackageBuilder:
    """Assembles a deterministic eCTD gateway ZIP.

    Usage:
        builder = GatewayPackageBuilder()
        builder.add_sequence_files(sequence_files)  # from SequenceBuilder
        builder.add_leaf_registry(registry)          # from LeafRegistry
        builder.add_contract_snapshot(snapshot)       # trust chain
        zip_bytes, manifest = builder.build()
        ok, errors = builder.verify(zip_bytes, manifest)
    """

    def __init__(self) -> None:
        self._files: dict[str, bytes] = {}

    def add_file(self, path: str, data: bytes, *, mime_type: str = "application/octet-stream") -> None:
        """Add a file to the package. Path must be relative."""
        _validate_relative_path(path)
        if len(data) > MAX_SINGLE_ENTRY_BYTES:
            raise ValueError(
                f"Entry {path} is {len(data)} bytes (max {MAX_SINGLE_ENTRY_BYTES})"
            )
        self._files[path] = data

    def add_sequence_files(self, sequence_files: dict[str, bytes]) -> None:
        """Add all files from the sequence builder output."""
        for path, data in sequence_files.items():
            self.add_file(path, data)

    def add_leaf_registry(self, registry: dict[str, Any]) -> None:
        """Add the leaf registry manifest."""
        data = _canonical_json(registry).encode("utf-8")
        self.add_file("leaf_registry.json", data, mime_type="application/json")

    def add_contract_snapshot(self, snapshot: dict[str, str]) -> None:
        """Add contract snapshot + its hash."""
        data = _canonical_json(snapshot).encode("utf-8")
        self.add_file("contract_snapshot.json", data, mime_type="application/json")
        sha = _sha256(data)
        hash_data = (sha + "  contract_snapshot.json\n").encode("utf-8")
        self.add_file("contract_snapshot.sha256", hash_data, mime_type="text/plain")

    def build(self) -> tuple[bytes, dict[str, Any]]:
        """Build the gateway ZIP and return (zip_bytes, manifest).

        The manifest contains:
        {
            "version": "1.0.0",
            "total_entries": N,
            "total_size_bytes": M,
            "zip_hash": "sha256 of the ZIP file",
            "entries": [
                {"path": "...", "sha256": "...", "size_bytes": N},
                ...
            ]
        }

        Raises ValueError if entry count or total size exceeds limits.
        """
        if len(self._files) > MAX_ENTRY_COUNT:
            raise ValueError(
                f"Too many entries: {len(self._files)} (max {MAX_ENTRY_COUNT})"
            )

        # Sort entries lexicographically for deterministic ordering
        sorted_paths = sorted(self._files.keys())

        checksums: dict[str, str] = {}
        entries: list[dict[str, Any]] = []
        total_size = 0
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in sorted_paths:
                data = self._files[path]
                total_size += len(data)
                if total_size > MAX_ZIP_SIZE_BYTES:
                    raise ValueError(
                        f"ZIP total exceeds {MAX_ZIP_SIZE_BYTES} bytes limit"
                    )
                zf.writestr(path, data)
                sha = _sha256(data)
                checksums[path] = sha
                entries.append({
                    "path": path,
                    "sha256": sha,
                    "size_bytes": len(data),
                })

            # Write checksums.sha256 (covers all files above)
            checksum_lines = [f"{sha}  {p}" for p, sha in sorted(checksums.items())]
            checksums_bytes = ("\n".join(checksum_lines) + "\n").encode("utf-8")
            zf.writestr("checksums.sha256", checksums_bytes)
            checksums_sha = _sha256(checksums_bytes)
            entries.append({
                "path": "checksums.sha256",
                "sha256": checksums_sha,
                "size_bytes": len(checksums_bytes),
            })

        zip_bytes = buf.getvalue()
        zip_hash = _sha256(zip_bytes)

        manifest: dict[str, Any] = {
            "version": "1.0.0",
            "total_entries": len(entries),
            "total_size_bytes": total_size + len(checksums_bytes),
            "zip_hash": zip_hash,
            "entries": entries,
        }

        logger.info(
            "Gateway package: built %d entries, %d bytes, hash=%s",
            len(entries), len(zip_bytes), zip_hash[:16],
        )
        return zip_bytes, manifest

    @staticmethod
    def verify(zip_bytes: bytes, manifest: dict[str, Any]) -> tuple[bool, list[str]]:
        """Verify a gateway ZIP against its manifest.

        Checks:
        1. ZIP hash matches manifest.zip_hash
        2. Every entry in the manifest exists in the ZIP with matching checksum
        3. No extra files exist in the ZIP beyond manifest + checksums.sha256
        4. No absolute paths in the ZIP
        5. No path traversal attempts

        Returns:
            (all_ok, errors): True + [] if valid, False + error list if not.
        """
        errors: list[str] = []

        # 1. ZIP hash
        actual_zip_hash = _sha256(zip_bytes)
        expected_zip_hash = manifest.get("zip_hash", "")
        if actual_zip_hash != expected_zip_hash:
            errors.append(
                f"ZIP hash mismatch: expected={expected_zip_hash[:16]}… "
                f"actual={actual_zip_hash[:16]}…"
            )

        # 2 + 3 + 4 + 5. Entry verification
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            zip_names = set(zf.namelist())
            manifest_paths = set()

            for entry in manifest.get("entries", []):
                path = entry["path"]
                manifest_paths.add(path)

                # 4. No absolute paths
                try:
                    _validate_relative_path(path)
                except ValueError as exc:
                    errors.append(str(exc))
                    continue

                # 2. Exists in ZIP
                if path not in zip_names:
                    errors.append(f"Missing from ZIP: {path}")
                    continue

                # 2. Checksum match
                actual_data = zf.read(path)
                actual_sha = _sha256(actual_data)
                expected_sha = entry.get("sha256", "")
                if actual_sha != expected_sha:
                    errors.append(
                        f"{path}: checksum mismatch "
                        f"(expected={expected_sha[:16]}… actual={actual_sha[:16]}…)"
                    )

                # Size match
                actual_size = len(actual_data)
                expected_size = entry.get("size_bytes", 0)
                if actual_size != expected_size:
                    errors.append(
                        f"{path}: size mismatch "
                        f"(expected={expected_size} actual={actual_size})"
                    )

            # 3. No extra files
            extra = zip_names - manifest_paths
            # Filter out directories (end with /)
            extra = {e for e in extra if not e.endswith("/")}
            for extra_path in sorted(extra):
                errors.append(f"Extra file in ZIP not in manifest: {extra_path}")

            # 5. Check all ZIP entries for path traversal
            for name in zip_names:
                if name.endswith("/"):
                    continue  # directories are fine
                try:
                    _validate_relative_path(name)
                except ValueError as exc:
                    errors.append(str(exc))

        return len(errors) == 0, errors
