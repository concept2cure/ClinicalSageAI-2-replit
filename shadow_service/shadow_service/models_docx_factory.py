"""Phase 6 — DOCX Factory: Pydantic request/response models."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# Templates
# =============================================================================

class CreateTemplateRequest(BaseModel):
    """Request to register a new document template."""
    program_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    doc_type: str = Field(default="generic", max_length=100)
    status: str = Field(default="active", max_length=50)


class TemplateResponse(BaseModel):
    """A document template record."""
    id: UUID
    program_id: UUID
    name: str
    doc_type: str
    status: str
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    """List of templates."""
    items: list[TemplateResponse]
    total: int


# =============================================================================
# Template Versions
# =============================================================================

class CreateTemplateVersionRequest(BaseModel):
    """Request to register a new version of a template."""
    storage_key: str = Field(..., min_length=1, description="Blob store key for the template file")
    sha256: str = Field(..., min_length=64, max_length=64, description="SHA-256 hex digest of the template file")


class TemplateVersionResponse(BaseModel):
    """A template version record."""
    id: UUID
    template_id: UUID
    version: int
    storage_key: str
    sha256: str
    created_at: datetime


class TemplateVersionListResponse(BaseModel):
    """List of template versions."""
    items: list[TemplateVersionResponse]
    total: int


# =============================================================================
# Renders
# =============================================================================

class CreateRenderRequest(BaseModel):
    """Request to create a render job."""
    program_id: UUID
    template_version_id: UUID
    inputs_json: dict[str, Any] = Field(default_factory=dict, description="Template variable bindings")


class RenderResponse(BaseModel):
    """A render record with status lifecycle."""
    id: UUID
    program_id: UUID
    template_version_id: UUID
    inputs_json: dict[str, Any]
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: datetime


class RenderListResponse(BaseModel):
    """List of renders."""
    items: list[RenderResponse]
    total: int


# =============================================================================
# Artifacts
# =============================================================================

class ArtifactResponse(BaseModel):
    """A produced artifact record."""
    id: UUID
    render_id: UUID
    file_type: str
    storage_key: str
    sha256: str
    size_bytes: int
    created_at: datetime


class ArtifactListResponse(BaseModel):
    """List of artifacts for a render."""
    items: list[ArtifactResponse]
    total: int


# =============================================================================
# Render Events
# =============================================================================

class RenderEventResponse(BaseModel):
    """An append-only render event."""
    id: UUID
    render_id: UUID
    event_type: str
    payload_json: dict[str, Any]
    created_at: datetime
