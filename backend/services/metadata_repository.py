"""
backend/services/metadata_repository.py

Service layer for Clinical Metadata Repository (CMDR).
This module provides functions for managing and accessing metadata assets.
"""

import logging
from typing import List, Dict, Any, Tuple, BinaryIO, Optional
from datetime import datetime
import json
import os
from io import BytesIO
import uuid

# Setup logging
logger = logging.getLogger(__name__)

# Mock database for development - would be replaced with actual database access
# Each tenant has their own isolated metadata collections
_metadata_store = {}

def _get_tenant_store(tenant_id: str) -> Dict:
    """Get the metadata store for a specific tenant."""
    if tenant_id not in _metadata_store:
        _metadata_store[tenant_id] = {
            "forms": [],
            "terminologies": [],
            "datasets": [],
            "mappings": [],
            "files": [],
            "audit_logs": [],
            "versions": {}
        }
    return _metadata_store[tenant_id]

async def list_assets(tenant_id: str, asset_type: str) -> List[Dict]:
    """
    List all metadata assets of a specific type for a tenant.
    
    Args:
        tenant_id: The tenant ID
        asset_type: Type of asset (forms, terminologies, datasets, mappings, files)
        
    Returns:
        List of metadata assets
    """
    logger.info(f"Listing assets of type {asset_type} for tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    # Validate asset type
    if asset_type not in store:
        return []
        
    return store[asset_type]

async def create_asset(tenant_id: str, asset_type: str, payload: Dict) -> Dict:
    """
    Create a new metadata asset.
    
    Args:
        tenant_id: The tenant ID
        asset_type: Type of asset to create
        payload: Asset data
        
    Returns:
        The created asset
    """
    logger.info(f"Creating new {asset_type} asset for tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    # Validate asset type
    if asset_type not in store:
        raise ValueError(f"Invalid asset type: {asset_type}")
    
    # Generate unique ID
    asset_id = str(uuid.uuid4())
    
    # Create the asset
    now = datetime.now()
    asset = {
        "id": asset_id,
        "name": payload.get("name", ""),
        "module": payload.get("module", ""),
        "type": asset_type,
        "version": payload.get("version", "1.0"),
        "status": payload.get("status", "draft"),
        "created_at": now,
        "updated_at": now
    }
    
    # Store the asset
    store[asset_type].append(asset)
    
    # Add to version history
    if "versions" not in store:
        store["versions"] = {}
    if asset_id not in store["versions"]:
        store["versions"][asset_id] = []
    
    store["versions"][asset_id].append(asset.copy())
    
    # Add audit log
    _add_audit_log(tenant_id, asset_id, "create", f"Created {asset_type}")
    
    return asset

async def update_asset(tenant_id: str, asset_type: str, asset_id: str, payload: Dict) -> Dict:
    """
    Update an existing metadata asset.
    
    Args:
        tenant_id: The tenant ID
        asset_type: Type of asset to update
        asset_id: ID of the asset to update
        payload: Updated asset data
        
    Returns:
        The updated asset
    """
    logger.info(f"Updating {asset_type} asset {asset_id} for tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    # Find the asset
    asset_index = None
    for i, asset in enumerate(store[asset_type]):
        if asset["id"] == asset_id:
            asset_index = i
            break
    
    if asset_index is None:
        raise ValueError(f"Asset {asset_id} not found")
    
    # Update the asset
    asset = store[asset_type][asset_index]
    if "name" in payload:
        asset["name"] = payload["name"]
    if "version" in payload:
        asset["version"] = payload["version"]
    if "status" in payload:
        asset["status"] = payload["status"]
    
    asset["updated_at"] = datetime.now()
    
    # Update the store
    store[asset_type][asset_index] = asset
    
    # Add to version history
    if "versions" not in store:
        store["versions"] = {}
    if asset_id not in store["versions"]:
        store["versions"][asset_id] = []
    
    store["versions"][asset_id].append(asset.copy())
    
    # Add audit log
    _add_audit_log(tenant_id, asset_id, "update", f"Updated {asset_type}")
    
    return asset

async def delete_asset(tenant_id: str, asset_type: str, asset_id: str) -> None:
    """
    Delete a metadata asset.
    
    Args:
        tenant_id: The tenant ID
        asset_type: Type of asset to delete
        asset_id: ID of the asset to delete
    """
    logger.info(f"Deleting {asset_type} asset {asset_id} for tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    # Find and remove the asset
    for i, asset in enumerate(store[asset_type]):
        if asset["id"] == asset_id:
            store[asset_type].pop(i)
            break
    
    # Add audit log
    _add_audit_log(tenant_id, asset_id, "delete", f"Deleted {asset_type}")

async def get_asset_versions(tenant_id: str, asset_type: str, asset_id: str) -> List[Dict]:
    """
    Get version history for an asset.
    
    Args:
        tenant_id: The tenant ID
        asset_type: Type of asset
        asset_id: ID of the asset
        
    Returns:
        List of asset versions
    """
    logger.info(f"Getting versions for {asset_type} asset {asset_id} for tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    if "versions" not in store or asset_id not in store["versions"]:
        return []
    
    return store["versions"][asset_id]

async def get_asset_audit(tenant_id: str, asset_type: str, asset_id: str) -> List[Dict]:
    """
    Get audit trail for an asset.
    
    Args:
        tenant_id: The tenant ID
        asset_type: Type of asset
        asset_id: ID of the asset
        
    Returns:
        List of audit log entries
    """
    logger.info(f"Getting audit trail for {asset_type} asset {asset_id} for tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    if "audit_logs" not in store:
        return []
    
    # Filter audit logs for this asset
    return [log for log in store["audit_logs"] if log["asset_id"] == asset_id]

async def semantic_search_assets(
    tenant_id: str, 
    query: str, 
    module: Optional[str] = None, 
    type_filter: Optional[str] = None, 
    limit: int = 20
) -> List[Dict]:
    """
    Perform semantic search across metadata assets.
    
    Args:
        tenant_id: The tenant ID
        query: Search query
        module: Optional module filter
        type_filter: Optional asset type filter
        limit: Maximum number of results to return
        
    Returns:
        List of search results
    """
    logger.info(f"Semantic search for '{query}' in tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    # In a real implementation, this would use vector search via embeddings
    # For now, we'll do simple text matching
    results = []
    
    # Search across all asset types (or just the filtered type)
    asset_types = [type_filter] if type_filter else ["forms", "terminologies", "datasets", "mappings", "files"]
    
    for asset_type in asset_types:
        if asset_type not in store:
            continue
            
        for asset in store[asset_type]:
            # Apply module filter if specified
            if module and asset["module"] != module:
                continue
                
            # Simple text matching in name
            if query.lower() in asset["name"].lower():
                results.append({
                    "id": asset["id"],
                    "name": asset["name"],
                    "snippet": asset["name"],  # In a real implementation, this would be a contextual snippet
                    "module": asset["module"],
                    "type": asset["type"]
                })
                
                # Limit results
                if len(results) >= limit:
                    break
    
    return results[:limit]

async def impact_analysis(tenant_id: str, asset_id: str) -> Dict:
    """
    Perform impact analysis for a metadata asset change.
    
    Args:
        tenant_id: The tenant ID
        asset_id: ID of the asset to analyze
        
    Returns:
        Impact analysis results
    """
    logger.info(f"Performing impact analysis for asset {asset_id} in tenant {tenant_id}")
    store = _get_tenant_store(tenant_id)
    
    # In a real implementation, this would analyze dependencies between assets
    # For now, we'll return a mock result
    
    # Find the asset
    asset = None
    asset_type = None
    
    for type_name in ["forms", "terminologies", "datasets", "mappings", "files"]:
        for a in store[type_name]:
            if a["id"] == asset_id:
                asset = a
                asset_type = type_name
                break
        if asset:
            break
    
    if not asset:
        raise ValueError(f"Asset {asset_id} not found")
    
    # Generate mock impact results
    impacted_assets = []
    
    # In a real implementation, this would be based on actual relationships
    # For now, we'll generate some random related assets
    for type_name in ["forms", "terminologies", "datasets", "mappings", "files"]:
        for a in store[type_name][:2]:  # Just take first 2 of each type for demo
            if a["id"] != asset_id:
                impacted_assets.append(a["id"])
    
    return {
        "asset_id": asset_id,
        "impacted_assets": impacted_assets,
        "summary": f"Changes to this {asset_type} may impact {len(impacted_assets)} other assets"
    }

async def export_edc_blueprint(tenant_id: str, form_id: str) -> str:
    """
    Export a form as an EDC blueprint.
    
    Args:
        tenant_id: The tenant ID
        form_id: ID of the form to export
        
    Returns:
        URL to the exported package
    """
    logger.info(f"Exporting EDC blueprint for form {form_id} in tenant {tenant_id}")
    
    # In a real implementation, this would generate an EDC export format
    # For now, we'll just return a mock URL
    
    # Add audit log
    _add_audit_log(tenant_id, form_id, "export", "Exported as EDC blueprint")
    
    return f"https://storage.trialsage.ai/exports/{tenant_id}/{form_id}_edc_export.zip"

async def preview_asset_file(tenant_id: str, asset_id: str) -> Tuple[BinaryIO, str]:
    """
    Preview a metadata file.
    
    Args:
        tenant_id: The tenant ID
        asset_id: ID of the file to preview
        
    Returns:
        Tuple of (file stream, mime type)
    """
    logger.info(f"Previewing file {asset_id} in tenant {tenant_id}")
    
    # In a real implementation, this would retrieve the file from storage
    # For now, we'll return a mock text file
    
    # Add audit log
    _add_audit_log(tenant_id, asset_id, "preview", "Previewed file")
    
    # Create a simple text file
    content = f"This is a preview of file {asset_id} for tenant {tenant_id}"
    file_stream = BytesIO(content.encode("utf-8"))
    mime_type = "text/plain"
    
    return file_stream, mime_type

def _add_audit_log(tenant_id: str, asset_id: str, action: str, description: str) -> None:
    """Add an entry to the audit log."""
    store = _get_tenant_store(tenant_id)
    
    if "audit_logs" not in store:
        store["audit_logs"] = []
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "asset_id": asset_id,
        "action": action,
        "description": description,
        "timestamp": datetime.now(),
        "user_id": "system"  # In a real implementation, this would be the actual user ID
    }
    
    store["audit_logs"].append(log_entry)