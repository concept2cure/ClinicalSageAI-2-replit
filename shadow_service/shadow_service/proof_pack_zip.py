"""Phase 6.6.G — Proof Pack ZIP Assembly (v1.1 eCTD-Drop-In).

Standard ZIP Layout v1.1:
  proof-pack/
    manifest.json           — frozen manifest with all hashes
    checksums.sha256        — SHA-256 for every file
    audit_events.jsonl      — Part 11 events

    contracts/
      risk_codes.lock.json  — the exact risk code contract (frozen at persist)
      risk_vocab.yml        — risk vocabulary (frozen at persist)
      schema.json           — canonical schema used (frozen at persist)
      contract_hashes.json  — runtime contract hash snapshot

    outputs/
      se_matrix_payload.json    — canonical sorted SE matrix
      defense_packet_seed.json  — defense packet data
      toxicity_profile.json     — safety signals profile
      lineage_graph.json        — lineage graph data
      replay_result.json        — last replay result

    ectd-stubs/
      m1/                       — Module 1 placeholder
      m4/                       — Module 4 placeholder
      m5/                       — Module 5 placeholder

All contract files are frozen at persist time and passed as parameters.
The ZIP builder NEVER reads from the live filesystem to ensure zero-drift.
All JSON is canonicalized (sort_keys=True, stable separators).
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ZIP internal prefix — all files sit under proof-pack/
PREFIX = "proof-pack"

# Safety limits
MAX_ZIP_SIZE_BYTES = int(os.environ.get("PROOF_PACK_MAX_ZIP_BYTES", str(100 * 1024 * 1024)))  # 100 MB
MAX_ARTIFACT_COUNT = 500
MAX_SINGLE_ARTIFACT_BYTES = 50 * 1024 * 1024  # 50 MB

# Filename sanitization pattern (only allow safe chars)
_SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9_\-][a-zA-Z0-9_.\-]{0,254}$")

# Paths — only used for fallback reads when frozen data is not available
_BASE = Path(__file__).resolve().parent
LOCK_FILE_PATH = _BASE / "predicate_intel" / "risk_codes.lock.json"
RISK_VOCAB_PATH = _BASE / "predicate_intel" / "risk_vocab.yml"
SCHEMA_BUNDLE_PATH = _BASE.parent.parent / "schemas" / "ectd_stubs.bundle.schema.json"


def _canonical_json(obj: Any) -> str:
    """Produce canonical sorted JSON for deterministic hashing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sanitize_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal.

    Strips directory components, rejects empty/unsafe names.
    Raises ValueError for malicious filenames.
    """
    # Strip any directory traversal
    basename = os.path.basename(filename.replace("\\", "/"))
    # Remove leading dots (hidden files / traversal)
    basename = basename.lstrip(".")
    if not basename:
        raise ValueError(f"Invalid artifact filename: {filename!r}")
    if not _SAFE_FILENAME_RE.match(basename):
        raise ValueError(
            f"Unsafe artifact filename: {filename!r} — "
            "only alphanumeric, dash, underscore, dot allowed"
        )
    return basename


class ProofPackZipBuilder:
    """Assembles a proof-pack ZIP (v1.1) from stored (frozen) data.

    IMPORTANT: Contract files (lock_file_bytes, vocab_bytes, schema_bytes)
    should be frozen at persist time and passed here. The builder will only
    fall back to reading the live filesystem if frozen data is not provided,
    and will log a warning when doing so.

    Usage:
        builder = ProofPackZipBuilder(
            manifest_json={...},
            payload_json={...},
            audit_events=[...],
            contract_snapshot={...},
            artifacts={...},
            defense_packet_seed={...},
            toxicity_profile={...},
            lineage_graph={...},
            replay_result={...},
            lock_file_bytes=b'...',    # frozen at persist time
            vocab_bytes=b'...',        # frozen at persist time
            schema_bytes=b'...',       # frozen at persist time
        )
        zip_bytes, checksums, artifact_index, zip_manifest_hash = builder.build()
    """

    def __init__(
        self,
        *,
        manifest_json: dict[str, Any],
        payload_json: dict[str, Any],
        audit_events: list[dict[str, Any]],
        contract_snapshot: dict[str, str] | None = None,
        artifacts: dict[str, bytes] | None = None,
        defense_packet_seed: dict[str, Any] | None = None,
        toxicity_profile: dict[str, Any] | None = None,
        lineage_graph: dict[str, Any] | None = None,
        replay_result: dict[str, Any] | None = None,
        # Frozen contract files (GA: should always be provided)
        lock_file_bytes: bytes | None = None,
        vocab_bytes: bytes | None = None,
        schema_bytes: bytes | None = None,
    ):
        self.manifest_json = manifest_json
        self.payload_json = payload_json
        self.audit_events = audit_events
        self.contract_snapshot = contract_snapshot or {}
        self.artifacts = artifacts or {}
        self.defense_packet_seed = defense_packet_seed
        self.toxicity_profile = toxicity_profile
        self.lineage_graph = lineage_graph
        self.replay_result = replay_result
        self.lock_file_bytes = lock_file_bytes
        self.vocab_bytes = vocab_bytes
        self.schema_bytes = schema_bytes

    def _resolve_contract_file(
        self,
        frozen: bytes | None,
        fallback_path: Path,
        label: str,
    ) -> bytes | None:
        """Use frozen bytes if available, else fall back to filesystem with warning."""
        if frozen is not None:
            return frozen
        if fallback_path.exists():
            logger.warning(
                "ZIP builder reading %s from live filesystem — "
                "pass frozen bytes at persist time for zero-drift guarantee",
                label,
            )
            return fallback_path.read_bytes()
        return None

    def build(self) -> tuple[bytes, dict[str, str], list[dict[str, Any]], str]:
        """Build the ZIP and return (zip_bytes, checksums_dict, artifact_index, zip_manifest_hash).

        Raises ValueError if artifact count or total size exceeds safety limits.

        Returns:
            zip_bytes:          Raw bytes of the ZIP file
            checksums_dict:     { filename: sha256_hex } for every file in the ZIP
            artifact_index:     [ {filename, sha256, size_bytes, mime_type} ]
            zip_manifest_hash:  SHA-256 of manifest.json content (content-addressed ID)
        """
        if len(self.artifacts) > MAX_ARTIFACT_COUNT:
            raise ValueError(
                f"Too many artifacts: {len(self.artifacts)} (max {MAX_ARTIFACT_COUNT})"
            )

        checksums: dict[str, str] = {}
        artifact_index: list[dict[str, Any]] = []
        total_size = 0
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            def _track_add(path: str, data: bytes, mime: str) -> None:
                nonlocal total_size
                if len(data) > MAX_SINGLE_ARTIFACT_BYTES:
                    raise ValueError(
                        f"Artifact {path} is {len(data)} bytes "
                        f"(max {MAX_SINGLE_ARTIFACT_BYTES})"
                    )
                total_size += len(data)
                if total_size > MAX_ZIP_SIZE_BYTES:
                    raise ValueError(
                        f"ZIP total exceeds {MAX_ZIP_SIZE_BYTES} bytes limit"
                    )
                self._add_file(zf, path, data, checksums, artifact_index, mime)

            # ── manifest.json ──
            manifest_bytes = _canonical_json(self.manifest_json).encode("utf-8")
            zip_manifest_hash = _sha256(manifest_bytes)
            _track_add(f"{PREFIX}/manifest.json", manifest_bytes, "application/json")

            # ── contracts/ (from frozen data, fallback to live filesystem) ──
            lock_data = self._resolve_contract_file(
                self.lock_file_bytes, LOCK_FILE_PATH, "risk_codes.lock.json"
            )
            if lock_data:
                _track_add(f"{PREFIX}/contracts/risk_codes.lock.json", lock_data, "application/json")

            vocab_data = self._resolve_contract_file(
                self.vocab_bytes, RISK_VOCAB_PATH, "risk_vocab.yml"
            )
            if vocab_data:
                _track_add(f"{PREFIX}/contracts/risk_vocab.yml", vocab_data, "text/yaml")

            schema_data = self._resolve_contract_file(
                self.schema_bytes, SCHEMA_BUNDLE_PATH, "schema.json"
            )
            if schema_data:
                _track_add(f"{PREFIX}/contracts/schema.json", schema_data, "application/json")

            # contract_hashes.json — runtime hash snapshot
            if self.contract_snapshot:
                contract_bytes = _canonical_json(self.contract_snapshot).encode("utf-8")
                _track_add(f"{PREFIX}/contracts/contract_hashes.json", contract_bytes, "application/json")

            # ── outputs/ ──
            payload_bytes = _canonical_json(self.payload_json).encode("utf-8")
            _track_add(f"{PREFIX}/outputs/se_matrix_payload.json", payload_bytes, "application/json")

            if self.defense_packet_seed:
                seed_bytes = _canonical_json(self.defense_packet_seed).encode("utf-8")
                _track_add(f"{PREFIX}/outputs/defense_packet_seed.json", seed_bytes, "application/json")

            if self.toxicity_profile:
                tox_bytes = _canonical_json(self.toxicity_profile).encode("utf-8")
                _track_add(f"{PREFIX}/outputs/toxicity_profile.json", tox_bytes, "application/json")

            if self.lineage_graph:
                lin_bytes = _canonical_json(self.lineage_graph).encode("utf-8")
                _track_add(f"{PREFIX}/outputs/lineage_graph.json", lin_bytes, "application/json")

            if self.replay_result:
                replay_bytes = _canonical_json(self.replay_result).encode("utf-8")
                _track_add(f"{PREFIX}/outputs/replay_result.json", replay_bytes, "application/json")

            # Additional artifacts (DOCX, PDF, etc.) — sanitized filenames
            for filename, data in sorted(self.artifacts.items()):
                safe_name = _sanitize_filename(filename)
                path = f"{PREFIX}/outputs/{safe_name}"
                mime = self._guess_mime(safe_name)
                _track_add(path, data, mime)

            # ── audit_events.jsonl ──
            lines = [json.dumps(evt, sort_keys=True, default=str) for evt in self.audit_events]
            events_bytes = ("\n".join(lines) + "\n").encode("utf-8") if lines else b""
            _track_add(f"{PREFIX}/audit_events.jsonl", events_bytes, "application/x-ndjson")

            # ── eCTD stubs (placeholder directories) ──
            for stub_dir in ("ectd-stubs/m1/", "ectd-stubs/m4/", "ectd-stubs/m5/"):
                full_dir = f"{PREFIX}/{stub_dir}"
                # Python 3.11+ supports zf.mkdir(); 3.10 needs writestr with trailing /
                if sys.version_info >= (3, 11):
                    zf.mkdir(full_dir)
                else:
                    zf.writestr(full_dir, "")

            # ── checksums.sha256 (written last, covers all above) ──
            checksum_lines = [f"{sha}  {fname}" for fname, sha in sorted(checksums.items())]
            checksums_bytes = ("\n".join(checksum_lines) + "\n").encode("utf-8")
            zf.writestr(f"{PREFIX}/checksums.sha256", checksums_bytes)
            checksums_hash = _sha256(checksums_bytes)
            checksums[f"{PREFIX}/checksums.sha256"] = checksums_hash
            artifact_index.append({
                "filename": f"{PREFIX}/checksums.sha256",
                "sha256": checksums_hash,
                "size_bytes": len(checksums_bytes),
                "mime_type": "text/plain",
            })

        zip_bytes = buf.getvalue()
        return zip_bytes, checksums, artifact_index, zip_manifest_hash

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
            "yml": "text/yaml",
            "yaml": "text/yaml",
            "txt": "text/plain",
            "csv": "text/csv",
        }.get(ext, "application/octet-stream")


def verify_checksums(zip_bytes: bytes) -> tuple[bool, list[dict[str, str]]]:
    """Verify all checksums in a proof-pack ZIP.

    Checks:
      1. Every file listed in checksums.sha256 has a matching hash
      2. Every file in the ZIP (except checksums.sha256 and directories)
         has an entry in checksums.sha256 — detects injected files

    Returns (all_ok, failures) where failures is a list of
    {"path": ..., "expected_sha256": ..., "actual_sha256": ...}
    """
    failures: list[dict[str, str]] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        # Find checksums file (may be at root or under proof-pack/)
        checksums_path = None
        for candidate in (f"{PREFIX}/checksums.sha256", "checksums.sha256"):
            if candidate in zf.namelist():
                checksums_path = candidate
                break

        if not checksums_path:
            return False, [{"path": "checksums.sha256", "expected_sha256": "MISSING", "actual_sha256": "N/A"}]

        checksums_content = zf.read(checksums_path).decode("utf-8")

        # Parse expected checksums
        expected: dict[str, str] = {}
        for line in checksums_content.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split("  ", 1)
            if len(parts) == 2:
                expected[parts[1]] = parts[0]

        # 1. Verify listed files match their expected hashes
        for filename, expected_hash in expected.items():
            try:
                actual_data = zf.read(filename)
                actual_hash = _sha256(actual_data)
                if actual_hash != expected_hash:
                    failures.append({
                        "path": filename,
                        "expected_sha256": expected_hash,
                        "actual_sha256": actual_hash,
                    })
            except KeyError:
                failures.append({
                    "path": filename,
                    "expected_sha256": expected_hash,
                    "actual_sha256": "FILE_MISSING",
                })

        # 2. Detect injected files not in checksums (directories excluded)
        all_zip_files = {
            name for name in zf.namelist()
            if not name.endswith("/")  # skip directories
        }
        tracked_files = set(expected.keys()) | {checksums_path}
        extra_files = all_zip_files - tracked_files
        for extra in sorted(extra_files):
            failures.append({
                "path": extra,
                "expected_sha256": "NOT_IN_CHECKSUMS",
                "actual_sha256": _sha256(zf.read(extra)),
            })

    return len(failures) == 0, failures
