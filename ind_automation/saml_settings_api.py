from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from urllib.parse import urlparse
import logging

from ind_automation import saml_creds, rbac, saml_integration

logger = logging.getLogger(__name__)
router = APIRouter()

class SAMLSettings(BaseModel):
    idp_entity_id: str
    idp_sso_url: str
    idp_x509_cert: str
    sp_entity_id: str
    sp_acs_url: str
    idp_metadata_url: Optional[str] = None 
    idp_slo_url: Optional[str] = None
    tenant_id: Optional[str] = None
    
@router.get("/api/ind-automation/saml/settings/{tenant_id}")
async def get_saml_settings(tenant_id: str, _=Depends(rbac.requires("saml.read"))):
    """Get SAML settings for a tenant"""
    settings = saml_creds.load(tenant_id)
    if not settings:
        raise HTTPException(404, "SAML settings not found for this tenant")
    return settings

@router.post("/api/ind-automation/saml/settings/{tenant_id}")
async def save_saml_settings(tenant_id: str, settings: SAMLSettings, _=Depends(rbac.requires("saml.write"))):
    """Save SAML settings for a tenant"""
    # Save the settings
    saml_creds.save(tenant_id, settings.dict(exclude_none=True))
    
    # Verify settings by creating a provider
    try:
        provider = saml_integration.get_provider(tenant_id)
        if not provider.settings:
            raise HTTPException(400, "Could not load saved settings")
    except Exception as e:
        logger.error(f"Error validating SAML settings: {str(e)}")
        raise HTTPException(400, f"Invalid SAML settings: {str(e)}")
    
    return {"status": "success", "message": "SAML settings saved"}

@router.delete("/api/ind-automation/saml/settings/{tenant_id}")
async def delete_saml_settings(tenant_id: str, _=Depends(rbac.requires("saml.delete"))):
    """Delete SAML settings for a tenant"""
    saml_creds.delete(tenant_id)
    return {"status": "success", "message": "SAML settings deleted"}

@router.get("/api/ind-automation/saml/metadata/{tenant_id}")
async def get_saml_metadata(tenant_id: str):
    """Get SAML metadata XML for a tenant"""
    try:
        provider = saml_integration.get_provider(tenant_id)
        if not provider or not provider.settings:
            raise HTTPException(404, "SAML configuration not found")
            
        metadata = provider.get_metadata()
        if not metadata:
            raise HTTPException(500, "Failed to generate metadata")
            
        return Response(content=metadata, media_type="application/xml")
    except Exception as e:
        logger.error(f"Error generating metadata: {str(e)}")
        raise HTTPException(500, f"Error generating metadata: {str(e)}")

@router.get("/api/ind-automation/saml/login/{tenant_id}")
async def login(tenant_id: str, request: Request):
    """Initiate SAML login flow for a tenant"""
    try:
        provider = saml_integration.get_provider(tenant_id)
        if not provider or not provider.settings:
            raise HTTPException(404, "SAML configuration not found")
            
        # Create authentication request
        auth_data = provider.create_auth_request()
        if not auth_data:
            raise HTTPException(500, "Failed to create authentication request")
            
        redirect_url, relay_state = auth_data
        
        # Store the relay state with the session
        # In a real implementation, you would store this in a session or database
        
        # Redirect to IdP
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        logger.error(f"Error initiating SAML login: {str(e)}")
        raise HTTPException(500, f"Error initiating SAML login: {str(e)}")

@router.post("/api/ind-automation/saml/acs/{tenant_id}")
async def assertion_consumer_service(tenant_id: str, request: Request):
    """Process SAML response from IdP"""
    try:
        # Get form data
        form_data = await request.form()
        saml_response = form_data.get("SAMLResponse")
        relay_state = form_data.get("RelayState")
        
        if not saml_response:
            raise HTTPException(400, "No SAML response received")
            
        # Process the response
        provider = saml_integration.get_provider(tenant_id)
        if not provider or not provider.settings:
            raise HTTPException(404, "SAML configuration not found")
            
        user_info = provider.process_response(saml_response, relay_state)
        if not user_info:
            raise HTTPException(401, "Failed to authenticate user")
            
        # In a real implementation, you would:
        # 1. Create or update the user in your database
        # 2. Create a session for the user
        # 3. Redirect to the application with a session cookie
        
        # For now, return the user info
        return {"status": "success", "user": user_info}
    except Exception as e:
        logger.error(f"Error processing SAML response: {str(e)}")
        raise HTTPException(500, f"Error processing SAML response: {str(e)}")

@router.get("/api/ind-automation/saml/test/{tenant_id}")
async def test_saml_config(tenant_id: str, _=Depends(rbac.requires("saml.read"))):
    """Test if SAML is properly configured for a tenant"""
    try:
        provider = saml_integration.get_provider(tenant_id)
        if not provider or not provider.settings:
            return {"status": "error", "message": "SAML configuration not found"}
            
        # Basic validation test
        config = provider._build_config()
        if not config:
            return {"status": "error", "message": "Invalid SAML configuration"}
            
        # Check for required fields
        missing_fields = []
        required_fields = ["idp_entity_id", "idp_sso_url", "idp_x509_cert", 
                         "sp_entity_id", "sp_acs_url"]
                         
        for field in required_fields:
            if not provider.settings.get(field):
                missing_fields.append(field)
                
        if missing_fields:
            return {
                "status": "error", 
                "message": f"Missing required fields: {', '.join(missing_fields)}"
            }
            
        return {
            "status": "success", 
            "message": "SAML configuration is valid",
            "metadata_url": f"/api/ind-automation/saml/metadata/{tenant_id}"
        }
    except Exception as e:
        logger.error(f"Error testing SAML configuration: {str(e)}")
        return {"status": "error", "message": f"Error testing SAML: {str(e)}"}