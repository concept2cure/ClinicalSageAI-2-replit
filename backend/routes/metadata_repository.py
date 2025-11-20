"""
backend/routes/metadata_repository.py

Enhanced FastAPI router for Clinical Metadata Repository (CMDR):
- CRUD operations on metadata assets: forms, terminologies, datasets, mappings, files
- Semantic and attribute-based search over repository assets
- Version history and audit trail for each asset
- Impact analysis for metadata changes
- Export of EDC blueprints and asset previews
- Enforces multitenant isolation via JWT dependency
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Path, File, UploadFile, Response
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from backend.dependencies import get_current_user
from backend.services.metadata_repository import (
    create_asset, update_asset, delete_asset, list_assets,
    get_asset_versions, get_asset_audit, semantic_search_assets,
    impact_analysis, export_edc_blueprint, preview_asset_file
)

router = APIRouter()

# Common asset response model
class AssetBase(BaseModel):
    id: str
    name: str
    module: str       # e.g., CSR, IND, CMC
    type: str         # forms, terminologies, datasets, mappings, files
    version: str
    status: str       # draft, in_progress, in_review, released
    created_at: datetime
    updated_at: datetime

class AssetCreate(BaseModel):
    name: str
    module: str
    type: str
    version: str
    status: Optional[str] = "draft"

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = None
    status: Optional[str] = None

class SemanticSearchResult(BaseModel):
    id: str
    name: str
    snippet: str
    module: str
    type: str

class ImpactResponse(BaseModel):
    asset_id: str
    impacted_assets: List[str]
    summary: str

# List assets by type
@router.get("/metadata/{asset_type}", response_model=List[AssetBase])
async def list_metadata(
    asset_type: str = Path(..., description="Asset type: forms, terminologies, datasets, mappings, files"),
    current_user=Depends(get_current_user)
):
    """List all metadata assets of a specific type."""
    tenant_id = current_user.tenant_id
    return await list_assets(tenant_id, asset_type)

# Create new asset
@router.post("/metadata/{asset_type}", response_model=AssetBase)
async def create_metadata(
    asset_type: str,
    payload: AssetCreate,
    current_user=Depends(get_current_user)
):
    """Create a new metadata asset."""
    tenant_id = current_user.tenant_id
    return await create_asset(tenant_id, asset_type, payload.dict())

# Update existing asset
@router.put("/metadata/{asset_type}/{asset_id}", response_model=AssetBase)
async def update_metadata(
    asset_type: str,
    asset_id: str,
    payload: AssetUpdate,
    current_user=Depends(get_current_user)
):
    """Update an existing metadata asset."""
    tenant_id = current_user.tenant_id
    return await update_asset(tenant_id, asset_type, asset_id, payload.dict(exclude_unset=True))

# Delete asset
@router.delete("/metadata/{asset_type}/{asset_id}")
async def delete_metadata(
    asset_type: str,
    asset_id: str,
    current_user=Depends(get_current_user)
):
    """Delete a metadata asset."""
    tenant_id = current_user.tenant_id
    await delete_asset(tenant_id, asset_type, asset_id)
    return {"detail": "Asset deleted successfully"}

# Version history
@router.get("/metadata/{asset_type}/{asset_id}/versions", response_model=List[AssetBase])
async def asset_versions(
    asset_type: str,
    asset_id: str,
    current_user=Depends(get_current_user)
):
    """Retrieve version history for an asset."""
    tenant_id = current_user.tenant_id
    return await get_asset_versions(tenant_id, asset_type, asset_id)

# Audit trail
@router.get("/metadata/{asset_type}/{asset_id}/audit")
async def asset_audit(
    asset_type: str,
    asset_id: str,
    current_user=Depends(get_current_user)
):
    """Retrieve audit trail for an asset."""
    tenant_id = current_user.tenant_id
    return await get_asset_audit(tenant_id, asset_type, asset_id)

# Semantic search across metadata
@router.get("/metadata/search", response_model=List[SemanticSearchResult])
async def metadata_search(
    q: str = Query(..., description="Search query"),
    module: Optional[str] = Query(None),
    type_filter: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user)
):
    """Semantic search across metadata assets."""
    tenant_id = current_user.tenant_id
    return await semantic_search_assets(tenant_id, q, module, type_filter, limit)

# Impact analysis
@router.get("/metadata/impact", response_model=ImpactResponse)
async def metadata_impact(
    asset_id: str = Query(..., description="Asset ID for analysis"),
    current_user=Depends(get_current_user)
):
    """Perform impact analysis for a metadata change."""
    tenant_id = current_user.tenant_id
    return await impact_analysis(tenant_id, asset_id)

# Export EDC blueprint
@router.post("/metadata/export-edc")
async def metadata_export_edc(
    form_id: str = Query(..., description="Form asset ID"),
    current_user=Depends(get_current_user)
):
    """Export CRF blueprint for EDC build."""
    tenant_id = current_user.tenant_id
    package_url = await export_edc_blueprint(tenant_id, form_id)
    return {"packageUrl": package_url}

# Preview metadata file inline
@router.get("/metadata/files/{asset_id}/preview")
async def metadata_preview_file(
    asset_id: str,
    current_user=Depends(get_current_user)
):
    """Preview metadata file inline."""
    tenant_id = current_user.tenant_id
    file_stream, mime_type = await preview_asset_file(tenant_id, asset_id)
    return StreamingResponse(file_stream, media_type=mime_type)