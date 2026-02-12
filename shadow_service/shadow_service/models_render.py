"""Phase 7.0A — Render Request / Result Models.

Pydantic models for the document rendering pipeline.
A single API that can render any artifact from a manifest/proof-pack id.

Artifact types (extensible):
  - defense_packet_pdf   (7.0B)
  - defense_packet_docx  (7.0C)
  - ectd_sequence_zip    (7.0D)

Status lifecycle: QUEUED → RUNNING → COMPLETED → FAILED
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# Enums
# ═══════════════════════════════════════════════════════════════════════════════

class RenderStatus(str, Enum):
    """Status lifecycle for a render job."""
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


VALID_RENDER_TRANSITIONS: dict[str, set[str]] = {
    "QUEUED": {"RUNNING", "FAILED"},
    "RUNNING": {"COMPLETED", "FAILED"},
    "COMPLETED": set(),   # terminal
    "FAILED": {"QUEUED"},  # allow retry
}


class ArtifactType(str, Enum):
    """Known artifact types the renderer can produce."""
    DEFENSE_PACKET_PDF = "defense_packet_pdf"
    DEFENSE_PACKET_DOCX = "defense_packet_docx"
    ECTD_SEQUENCE_ZIP = "ectd_sequence_zip"


# Standard output layout (matches proof-pack zip)
ARTIFACT_OUTPUT_PATHS: dict[str, str] = {
    "defense_packet_pdf": "proof-pack/outputs/defense_packet_pdf/DefensePacketReport.pdf",
    "defense_packet_docx": "proof-pack/outputs/defense_packet_docx/DefensePacketReport.docx",
    "ectd_sequence_zip": "proof-pack/outputs/ectd_sequence_zip/ectd_sequence.zip",
}


# ═══════════════════════════════════════════════════════════════════════════════
# Request / Response Models
# ═══════════════════════════════════════════════════════════════════════════════

class RenderRequest(BaseModel):
    """Request to render a document artifact from a proof pack."""
    proof_pack_id: str = Field(
        ...,
        description="UUID of the persisted proof pack",
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        max_length=36,
    )
    artifact_type: ArtifactType = Field(..., description="Which artifact to render")
    user_id: str = Field(default="system", description="Who requested the render", max_length=200)
    request_id: str = Field(default="", description="Traceability ID", max_length=200)
    options: dict[str, str] = Field(
        default_factory=dict,
        description="Renderer-specific options (string values only, max 20 keys)",
    )

    @classmethod
    def validate_options_size(cls, v: dict) -> dict:
        """Prevent DoS via oversized options payload."""
        if len(v) > 20:
            raise ValueError("options dict exceeds maximum of 20 keys")
        for key, val in v.items():
            if len(str(key)) > 100 or len(str(val)) > 1000:
                raise ValueError("options key/value exceeds size limit")
        return v


class RenderResult(BaseModel):
    """Result of a render job (returned from API)."""
    render_job_id: str = Field(..., description="UUID of the render job")
    proof_pack_id: str
    artifact_type: ArtifactType
    status: RenderStatus
    inputs_hash: str = Field(..., description="SHA-256 of canonical inputs — same inputs → same hash")
    artifact_hash: Optional[str] = Field(None, description="SHA-256 of rendered output (when COMPLETED)")
    artifact_size_bytes: Optional[int] = Field(None, description="Size of rendered output")
    artifact_path: Optional[str] = Field(None, description="Standard output path")
    error: Optional[str] = Field(None, description="Error message (when FAILED)")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    created_by: str = "system"


class RenderJobRecord(BaseModel):
    """DB-level record for render_jobs table (thin, matches DDL)."""
    id: str
    proof_pack_id: str
    artifact_type: str
    status: str
    inputs_hash: str
    artifact_hash: Optional[str] = None
    artifact_size_bytes: Optional[int] = None
    artifact_path: Optional[str] = None
    artifact_bytes: Optional[bytes] = None  # In-memory only, not serialized
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    created_by: str = "system"
    request_id: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def compute_inputs_hash(
    proof_pack_id: str,
    artifact_type: str,
    manifest_json: Any,
    contract_snapshot: dict[str, str] | None = None,
) -> str:
    """Deterministic hash of the inputs to a render job.

    Same proof pack + same artifact type + same manifest + same contract
    → same inputs_hash. Used for idempotency.
    """
    canonical = json.dumps(
        {
            "proof_pack_id": proof_pack_id,
            "artifact_type": artifact_type,
            "manifest_hash": (manifest_json or {}).get("manifest_hash", "")
                if isinstance(manifest_json, dict) else str(manifest_json),
            "contract": contract_snapshot or {},
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
