"""Phase 6.6.E1 — Proof Pack ZIP Assembly.

Pure packaging operation: reads stored data, assembles ZIP, computes checksums.
Never regenerates anything. If stored data is missing or mismatched → 409.

Contents:
  manifest.json            — frozen manifest with all hashes
  se_matrix_payload.json   — canonical sorted SE matrix payload
  risk_codes.lock.json     — the exact contract used
  checksums.sha256         — SHA-256 for every file in the ZIP
  audit_events.jsonl       — Part 11 events for this proof pack
  outputs/                 — generated artifacts (DOCX, PDF)
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# Lock file (the canonical source)
# ─────────────────────────────────────────────────────────────────────────────

LOCK_FILE_PATH = (
    Path(__file__).resolve().parent / "predicate_intel" / "risk_codes.lock.json"
)


def _canonical_json(obj: Any) -> str:
    """Produce canonical sorted JSON for deterministic hashing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ProofPackZipBuilder:
    """Assembles a proof-pack ZIP from stored (frozen) data.

    Usage:
        builder = ProofPackZipBuilder(
            manifest_json={...},
            payload_json={...},
            audit_events=[...],
            artifacts={...},
        )
        zip_bytes, checksums, artifact_index = builder.build()
    """

    def __init__(
        self,
        *,
        manifest_json: dict[str, Any],
        payload_json: dict[str, Any],
        audit_events: list[dict[str, Any]],
        artifacts: dict[str, bytes] | None = None,
    ):
        self.manifest_json = manifest_json
        self.payload_json = payload_json
        self.audit_events = audit_events
        self.artifacts = artifacts or {}

    def build(self) -> tuple[bytes, dict[str, str], list[dict[str, Any]]]:
        """Build the ZIP and return (zip_bytes, checksums_dict, artifact_index).

        Returns:
            zip_bytes:      Raw bytes of the ZIP file
            checksums_dict: { filename: sha256_hex } for every file in the ZIP
            artifact_index: [ {filename, sha256, size_bytes, mime_type} ]
        """
        checksums: dict[str, str] = {}
        artifact_index: list[dict[str, Any]] = []
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. manifest.json
            manifest_bytes = _canonical_json(self.manifest_json).encode("utf-8")
            self._add_file(zf, "manifest.json", manifest_bytes, checksums, artifact_index, "application/json")

            # 2. se_matrix_payload.json
            payload_bytes = _canonical_json(self.payload_json).encode("utf-8")
            self._add_file(zf, "se_matrix_payload.json", payload_bytes, checksums, artifact_index, "application/json")

            # 3. risk_codes.lock.json (the exact contract)
            lock_bytes = LOCK_FILE_PATH.read_bytes()
            self._add_file(zf, "risk_codes.lock.json", lock_bytes, checksums, artifact_index, "application/json")

            # 4. audit_events.jsonl
            lines = [json.dumps(evt, sort_keys=True, default=str) for evt in self.audit_events]
            events_bytes = ("\n".join(lines) + "\n").encode("utf-8") if lines else b""
            self._add_file(zf, "audit_events.jsonl", events_bytes, checksums, artifact_index, "application/x-ndjson")

            # 5. outputs/ directory — generated artifacts
            for filename, data in sorted(self.artifacts.items()):
                path = f"outputs/{filename}"
                mime = self._guess_mime(filename)
                self._add_file(zf, path, data, checksums, artifact_index, mime)

            # 6. checksums.sha256 (written last, covers all above)
            checksum_lines = [f"{sha}  {fname}" for fname, sha in sorted(checksums.items())]
            checksums_bytes = ("\n".join(checksum_lines) + "\n").encode("utf-8")
            zf.writestr("checksums.sha256", checksums_bytes)
            # Also add checksums.sha256 itself to the index (self-referential hash)
            checksums_hash = _sha256(checksums_bytes)
            checksums[" checksums.sha256"] = checksums_hash
            artifact_index.append({
                "filename": "checksums.sha256",
                "sha256": checksums_hash,
                "size_bytes": len(checksums_bytes),
                "mime_type": "text/plain",
            })

        zip_bytes = buf.getvalue()
        return zip_bytes, checksums, artifact_index

    def _add_file(
        self,
        zf: zipfile.ZipFile,
        filename: str,
        data: bytes,
        checksums: dict[str, str],
        artifact_index: list[dict[str, Any]],
        mime_type: str,
    ) -> None:
        zf.writestr(filename, data)
        sha = _sha256(data)
        checksums[filename] = sha
        artifact_index.append({
            "filename": filename,
            "sha256": sha,
            "size_bytes": len(data),
            "mime_type": mime_type,
        })

    @staticmethod
    def _guess_mime(filename: str) -> str:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        return {
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pdf": "application/pdf",
            "json": "application/json",
            "jsonl": "application/x-ndjson",
            "txt": "text/plain",
        }.get(ext, "application/octet-stream")


def verify_checksums(zip_bytes: bytes) -> tuple[bool, list[str]]:
    """Verify all checksums in a proof-pack ZIP. Returns (all_ok, mismatches)."""
    mismatches: list[str] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        # Read checksums file
        try:
            checksums_content = zf.read("checksums.sha256").decode("utf-8")
        except KeyError:
            return False, ["checksums.sha256 missing from ZIP"]

        # Parse expected checksums
        expected: dict[str, str] = {}
        for line in checksums_content.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split("  ", 1)
            if len(parts) == 2:
                expected[parts[1]] = parts[0]

        # Verify each file
        for filename, expected_hash in expected.items():
            try:
                actual_data = zf.read(filename)
                actual_hash = _sha256(actual_data)
                if actual_hash != expected_hash:
                    mismatches.append(
                        f"{filename}: expected={expected_hash[:16]}… actual={actual_hash[:16]}…"
                    )
            except KeyError:
                mismatches.append(f"{filename}: file missing from ZIP")

    return len(mismatches) == 0, mismatches
