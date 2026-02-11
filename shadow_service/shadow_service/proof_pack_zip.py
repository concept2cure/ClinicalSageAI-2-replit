"""Phase 6.6.G — Proof Pack ZIP Assembly (v1.1 eCTD-Drop-In).

Standard ZIP Layout v1.1:
  proof-pack/
    manifest.json           — frozen manifest with all hashes
    checksums.sha256        — SHA-256 for every file
    audit_events.jsonl      — Part 11 events

    contracts/
      risk_codes.lock.json  — the exact risk code contract
      risk_vocab.yml        — risk vocabulary (if exists)
      schema.json           — canonical schema used
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

proof_pack_id is derived from normalized checksums + zip_manifest_hash.
All JSON is canonicalized (sort_keys=True, stable separators).
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
# Lock file + schema paths
# ─────────────────────────────────────────────────────────────────────────────

LOCK_FILE_PATH = (
    Path(__file__).resolve().parent / "predicate_intel" / "risk_codes.lock.json"
)
RISK_VOCAB_PATH = (
    Path(__file__).resolve().parent / "predicate_intel" / "risk_vocab.yml"
)
SCHEMA_BUNDLE_PATH = (
    Path(__file__).resolve().parent.parent.parent / "schemas" / "ectd_stubs.bundle.schema.json"
)

# ZIP internal prefix — all files sit under proof-pack/
PREFIX = "proof-pack"


def _canonical_json(obj: Any) -> str:
    """Produce canonical sorted JSON for deterministic hashing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ProofPackZipBuilder:
    """Assembles a proof-pack ZIP (v1.1) from stored (frozen) data.

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

    def build(self) -> tuple[bytes, dict[str, str], list[dict[str, Any]], str]:
        """Build the ZIP and return (zip_bytes, checksums_dict, artifact_index, zip_manifest_hash).

        Returns:
            zip_bytes:          Raw bytes of the ZIP file
            checksums_dict:     { filename: sha256_hex } for every file in the ZIP
            artifact_index:     [ {filename, sha256, size_bytes, mime_type} ]
            zip_manifest_hash:  SHA-256 of manifest.json content (content-addressed ID)
        """
        checksums: dict[str, str] = {}
        artifact_index: list[dict[str, Any]] = []
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # ── manifest.json ──
            manifest_bytes = _canonical_json(self.manifest_json).encode("utf-8")
            zip_manifest_hash = _sha256(manifest_bytes)
            self._add_file(zf, f"{PREFIX}/manifest.json", manifest_bytes, checksums, artifact_index, "application/json")

            # ── contracts/ ──
            # risk_codes.lock.json
            if LOCK_FILE_PATH.exists():
                lock_bytes = LOCK_FILE_PATH.read_bytes()
                self._add_file(zf, f"{PREFIX}/contracts/risk_codes.lock.json", lock_bytes, checksums, artifact_index, "application/json")

            # risk_vocab.yml (if exists)
            if RISK_VOCAB_PATH.exists():
                vocab_bytes = RISK_VOCAB_PATH.read_bytes()
                self._add_file(zf, f"{PREFIX}/contracts/risk_vocab.yml", vocab_bytes, checksums, artifact_index, "text/yaml")

            # schema.json (eCTD bundle schema)
            if SCHEMA_BUNDLE_PATH.exists():
                schema_bytes = SCHEMA_BUNDLE_PATH.read_bytes()
                self._add_file(zf, f"{PREFIX}/contracts/schema.json", schema_bytes, checksums, artifact_index, "application/json")

            # contract_hashes.json — runtime hash snapshot
            if self.contract_snapshot:
                contract_bytes = _canonical_json(self.contract_snapshot).encode("utf-8")
                self._add_file(zf, f"{PREFIX}/contracts/contract_hashes.json", contract_bytes, checksums, artifact_index, "application/json")

            # ── outputs/ ──
            # se_matrix_payload.json
            payload_bytes = _canonical_json(self.payload_json).encode("utf-8")
            self._add_file(zf, f"{PREFIX}/outputs/se_matrix_payload.json", payload_bytes, checksums, artifact_index, "application/json")

            # defense_packet_seed.json
            if self.defense_packet_seed:
                seed_bytes = _canonical_json(self.defense_packet_seed).encode("utf-8")
                self._add_file(zf, f"{PREFIX}/outputs/defense_packet_seed.json", seed_bytes, checksums, artifact_index, "application/json")

            # toxicity_profile.json
            if self.toxicity_profile:
                tox_bytes = _canonical_json(self.toxicity_profile).encode("utf-8")
                self._add_file(zf, f"{PREFIX}/outputs/toxicity_profile.json", tox_bytes, checksums, artifact_index, "application/json")

            # lineage_graph.json
            if self.lineage_graph:
                lin_bytes = _canonical_json(self.lineage_graph).encode("utf-8")
                self._add_file(zf, f"{PREFIX}/outputs/lineage_graph.json", lin_bytes, checksums, artifact_index, "application/json")

            # replay_result.json
            if self.replay_result:
                replay_bytes = _canonical_json(self.replay_result).encode("utf-8")
                self._add_file(zf, f"{PREFIX}/outputs/replay_result.json", replay_bytes, checksums, artifact_index, "application/json")

            # Additional artifacts (DOCX, PDF, etc.)
            for filename, data in sorted(self.artifacts.items()):
                path = f"{PREFIX}/outputs/{filename}"
                mime = self._guess_mime(filename)
                self._add_file(zf, path, data, checksums, artifact_index, mime)

            # ── audit_events.jsonl ──
            lines = [json.dumps(evt, sort_keys=True, default=str) for evt in self.audit_events]
            events_bytes = ("\n".join(lines) + "\n").encode("utf-8") if lines else b""
            self._add_file(zf, f"{PREFIX}/audit_events.jsonl", events_bytes, checksums, artifact_index, "application/x-ndjson")

            # ── eCTD stubs (placeholder directories) ──
            for stub_dir in ("ectd-stubs/m1/", "ectd-stubs/m4/", "ectd-stubs/m5/"):
                zf.mkdir(f"{PREFIX}/{stub_dir}")

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

        # Verify each file
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

    return len(failures) == 0, failures
