"""
Enterprise SAML SSO integration for IND Automation
Using pysaml2 - a pure Python SAML implementation
"""

from saml2 import BINDING_HTTP_REDIRECT, BINDING_HTTP_POST
from saml2.client import Saml2Client
from saml2.config import SPConfig
from saml2.metadata import create_metadata_string
from typing import Dict, Any, Optional, Tuple
import json
import base64
import logging
import os
from urllib.parse import urlparse, parse_qs

# Local imports
from ind_automation import saml_creds

logger = logging.getLogger(__name__)

class SAMLProvider:
    """SAML Service Provider implementation using pysaml2"""
    
    def __init__(self, tenant_id: str):
        """
        Initialize SAML provider for a specific tenant
        
        Args:
            tenant_id: The tenant ID to retrieve SAML settings for
        """
        self.tenant_id = tenant_id
        self.settings = None
        self.client = None
        self._load_settings()
        
    def _load_settings(self) -> None:
        """Load SAML settings from encrypted storage"""
        self.settings = saml_creds.load(self.tenant_id)
        if not self.settings:
            logger.error(f"No SAML settings found for tenant {self.tenant_id}")
            return
        
        # Initialize pysaml2 client with settings
        config = self._build_config()
        if config:
            self.client = Saml2Client(config)
    
    def _build_config(self) -> Optional[Dict[str, Any]]:
        """
        Build pysaml2 configuration from stored settings
        
        Returns:
            Dict with pysaml2 configuration or None if settings are invalid
        """
        if not self.settings:
            return None
            
        try:
            # Parse SP (Service Provider) settings
            parsed_sp_url = urlparse(self.settings['sp_acs_url'])
            sp_host = f"{parsed_sp_url.scheme}://{parsed_sp_url.netloc}"
            
            # Build config dictionary for pysaml2
            config = {
                "entityid": self.settings['sp_entity_id'],
                "service": {
                    "sp": {
                        "endpoints": {
                            "assertion_consumer_service": [
                                (self.settings['sp_acs_url'], BINDING_HTTP_POST),
                            ],
                        },
                        "allow_unsolicited": True,
                        "authn_requests_signed": False,
                        "want_assertions_signed": True,
                        "want_response_signed": True,
                    },
                },
                "metadata": {
                    "remote": [
                        {
                            "url": self.settings.get('idp_metadata_url', ''),
                            "cert": None
                        }
                    ]
                },
                "debug": True,
                "key_file": "",  # Add key file path if using signed requests
                "cert_file": "",  # Add cert file path if using signed requests
                "encryption_keypairs": [],
                "contact_person": [
                    {
                        "given_name": "Support",
                        "email_address": "support@lumentrial.ai",
                        "type": "technical"
                    },
                ],
                "organization": {
                    "name": [("LumenTrial.AI", "en")],
                    "display_name": [("LumenTrial.AI", "en")],
                    "url": [("https://lumentrial.ai", "en")],
                },
                "idp": {
                    self.settings['idp_entity_id']: {
                        "single_sign_on_service": {
                            BINDING_HTTP_REDIRECT: self.settings['idp_sso_url']
                        },
                        "single_logout_service": {
                            BINDING_HTTP_REDIRECT: self.settings.get('idp_slo_url', '')
                        },
                        "x509cert": self.settings['idp_x509_cert']
                    }
                }
            }
            
            return SPConfig().load(config)
        except Exception as e:
            logger.error(f"Failed to build SAML config: {str(e)}")
            return None
    
    def create_auth_request(self) -> Optional[Tuple[str, str]]:
        """
        Create a SAML authentication request
        
        Returns:
            Tuple containing (redirect_url, relay_state) or None if error
        """
        if not self.client:
            return None
            
        try:
            # Generate a request ID as relay state to track the session
            relay_state = base64.urlsafe_b64encode(os.urandom(32)).decode('ascii')
            
            # Create the SAML request
            sid, info = self.client.prepare_for_authenticate(relay_state=relay_state)
            
            # Extract the redirect URL
            redirect_url = info['headers'][0][1]
            return redirect_url, relay_state
        except Exception as e:
            logger.error(f"Failed to create auth request: {str(e)}")
            return None
    
    def process_response(self, saml_response: str, relay_state: str = None) -> Optional[Dict[str, Any]]:
        """
        Process a SAML response from the IdP
        
        Args:
            saml_response: The encoded SAML response from the IdP
            relay_state: The relay state passed to the IdP
            
        Returns:
            Dict containing the authenticated user information or None if validation fails
        """
        if not self.client:
            return None
            
        try:
            # Parse and validate the SAML response
            authn_response = self.client.parse_authn_request_response(
                saml_response, 
                BINDING_HTTP_POST
            )
            
            if authn_response is None:
                logger.error("No authenticated response received")
                return None
                
            # Extract user identity and attributes
            identity = authn_response.get_identity()
            
            # Create a user information dictionary
            user_info = {
                "name_id": authn_response.get_subject(),
                "attributes": identity,
                "session_index": authn_response.session_index(),
                "session_not_on_or_after": authn_response.session_info().get("not_on_or_after", ""),
                "issuer": authn_response.issuer(),
                "authenticated": True
            }
            
            return user_info
        except Exception as e:
            logger.error(f"Failed to process SAML response: {str(e)}")
            return None
    
    def get_metadata(self) -> Optional[str]:
        """
        Generate SAML metadata XML for this Service Provider
        
        Returns:
            String containing XML metadata or None if error
        """
        if not self.client:
            return None
            
        try:
            # Generate metadata XML
            metadata = create_metadata_string(
                self._build_config(),
                contact_persons=self._build_config().get("contact_person", []),
                organization=self._build_config().get("organization", {})
            )
            return metadata
        except Exception as e:
            logger.error(f"Failed to generate metadata: {str(e)}")
            return None


# Helper functions
def get_provider(tenant_id: str) -> SAMLProvider:
    """
    Get or create a SAML provider for a tenant
    
    Args:
        tenant_id: The tenant ID
        
    Returns:
        Initialized SAMLProvider instance
    """
    return SAMLProvider(tenant_id)