"""
Microsoft Teams Webhook API for IND Automation

This module provides API endpoints for customers to manage their 
Microsoft Teams webhook URLs for receiving alerts and notifications.
"""

import os
import json
import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from pydantic import BaseModel, validator
import requests
import traceback

from ind_automation import rbac, db

router = APIRouter()

# Models
class TeamsWebhook(BaseModel):
    webhook_url: str
    
    @validator('webhook_url')
    def validate_url(cls, v):
        if not v.startswith('https://'):
            raise ValueError('Webhook URL must use HTTPS')
        if not ('webhook.office.com' in v or 'office365.com' in v):
            raise ValueError('URL must be a valid Microsoft Teams webhook URL')
        return v

# Constants
WEBHOOKS_DIR = Path('data/teams_webhooks')

# Make sure the directory exists
WEBHOOKS_DIR.mkdir(parents=True, exist_ok=True)

# Helper functions
def _get_webhook_path(org_id: str) -> Path:
    """Get the path to the webhook file for an organization"""
    return WEBHOOKS_DIR / f"{org_id}.json"

def _load_webhook(org_id: str) -> dict:
    """Load webhook configuration for an organization"""
    if not org_id:
        return {}
        
    path = _get_webhook_path(org_id)
    if not path.exists():
        return {}
    
    try:
        with open(path, 'r') as f:
            data = json.load(f)
            # Validate the data structure
            if not isinstance(data, dict):
                return {}
            return data
    except json.JSONDecodeError:
        # If the file is corrupted, return empty and log error
        print(f"Error: Corrupted webhook file for {org_id}")
        return {}
    except Exception as e:
        print(f"Error loading webhook for {org_id}: {str(e)}")
        return {}

def _save_webhook(org_id: str, webhook_url: str) -> None:
    """Save webhook configuration for an organization"""
    if not org_id:
        raise ValueError("Organization ID cannot be empty")
    
    # Ensure the directory exists
    WEBHOOKS_DIR.mkdir(parents=True, exist_ok=True)
    
    path = _get_webhook_path(org_id)
    
    try:
        with open(path, 'w') as f:
            json.dump({"webhook_url": webhook_url}, f, indent=2)
    except Exception as e:
        print(f"Error saving webhook for {org_id}: {str(e)}")
        raise

def _delete_webhook(org_id: str) -> bool:
    """Delete webhook configuration for an organization"""
    if not org_id:
        return False
        
    path = _get_webhook_path(org_id)
    if path.exists():
        try:
            path.unlink()
            return True
        except Exception as e:
            print(f"Error deleting webhook for {org_id}: {str(e)}")
            raise
    return False

def send_teams_message(org_id: str, title: str, message: str) -> bool:
    """
    Send a message to Microsoft Teams via webhook
    
    Args:
        org_id: Organization ID
        title: Message title
        message: Message content
        
    Returns:
        bool: True if successful, False otherwise
    """
    if not org_id or not title or not message:
        print(f"Missing required parameters for Teams message: org_id={org_id}, title={bool(title)}, message={bool(message)}")
        return False
        
    webhook_config = _load_webhook(org_id)
    webhook_url = webhook_config.get('webhook_url')
    
    if not webhook_url:
        print(f"No webhook URL configured for organization {org_id}")
        return False
        
    try:
        # Create a rich card message
        payload = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "summary": title,
            "themeColor": "0076D7",
            "title": title,
            "text": message.replace('\n', '<br>'),
            "sections": [
                {
                    "activityTitle": "TrialSage IND Automation",
                    "activitySubtitle": f"Organization: {org_id}",
                    "activityImage": "https://i.imgur.com/wKxLufi.png",
                    "facts": [
                        {
                            "name": "Time (UTC)",
                            "value": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                        }
                    ]
                }
            ]
        }
        
        response = requests.post(webhook_url, json=payload, timeout=10)
        success = 200 <= response.status_code < 300
        
        if not success:
            print(f"Teams webhook error for {org_id}: HTTP {response.status_code}")
            try:
                print(f"Response: {response.text}")
            except:
                pass
                
        return success
    except Exception as e:
        print(f"Error sending Teams message to {org_id}: {str(e)}")
        return False

# API Routes with enhanced error handling
@router.get("/api/ind/{org_id}/teams-webhook", status_code=status.HTTP_200_OK)
async def get_webhook(org_id: str, response: Response, _=Depends(rbac.requires("ind.read"))):
    """Get Teams webhook configuration for an organization"""
    if not org_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"status": "error", "message": "Organization ID is required"}

    try:
        return _load_webhook(org_id)
    except Exception as e:
        traceback.print_exc()
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": "error", "message": f"Error loading webhook: {str(e)}"}

@router.post("/api/ind/{org_id}/teams-webhook", status_code=status.HTTP_201_CREATED)
async def save_webhook(org_id: str, webhook: TeamsWebhook, response: Response, _=Depends(rbac.requires("ind.write"))):
    """Save Teams webhook configuration for an organization"""
    if not org_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"status": "error", "message": "Organization ID is required"}

    try:
        _save_webhook(org_id, webhook.webhook_url)
        
        # Record change in history
        try:
            db.append_history(org_id, {
                "type": "teams_webhook_update",
                "msg": "Teams webhook updated",
                "timestamp": datetime.datetime.utcnow().isoformat()
            })
        except Exception as e:
            print(f"Error recording webhook change in history: {str(e)}")
            
        return {"status": "success", "message": "Webhook configuration saved successfully"}
    except ValueError as e:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"status": "error", "message": str(e)}
    except Exception as e:
        traceback.print_exc()
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": "error", "message": f"Error saving webhook: {str(e)}"}

@router.delete("/api/ind/{org_id}/teams-webhook", status_code=status.HTTP_200_OK)
async def delete_webhook(org_id: str, response: Response, _=Depends(rbac.requires("ind.write"))):
    """Delete Teams webhook configuration for an organization"""
    if not org_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"status": "error", "message": "Organization ID is required"}

    try:
        if _delete_webhook(org_id):
            # Record deletion in history
            try:
                db.append_history(org_id, {
                    "type": "teams_webhook_delete",
                    "msg": "Teams webhook deleted",
                    "timestamp": datetime.datetime.utcnow().isoformat()
                })
            except Exception as e:
                print(f"Error recording webhook deletion in history: {str(e)}")
                
            return {"status": "success", "message": "Webhook configuration deleted successfully"}
        else:
            return {"status": "success", "message": "No webhook configuration found for this organization"}
    except Exception as e:
        traceback.print_exc()
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": "error", "message": f"Error deleting webhook: {str(e)}"}

@router.post("/api/ind/{org_id}/teams-webhook/test", status_code=status.HTTP_200_OK)
async def test_webhook(org_id: str, response: Response, _=Depends(rbac.requires("ind.write"))):
    """Send a test message to Teams to verify webhook configuration"""
    if not org_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"status": "error", "message": "Organization ID is required"}
    
    # Check if webhook is configured
    webhook_config = _load_webhook(org_id)
    if not webhook_config.get('webhook_url'):
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"status": "error", "message": "No webhook URL configured. Please save a webhook URL first."}
    
    try:
        result = send_teams_message(
            org_id,
            "TrialSage Test Notification",
            f"This is a test notification from TrialSage for organization {org_id}. "
            f"If you can see this message, Teams alerts are correctly configured."
        )
        
        if result:
            # Record in history for audit
            try:
                db.append_history(org_id, {
                    "type": "teams_webhook_test",
                    "msg": "Teams webhook test was successful",
                    "timestamp": datetime.datetime.utcnow().isoformat()
                })
            except Exception as e:
                print(f"Error recording webhook test in history: {str(e)}")
                
            return {"status": "success", "message": "Test message sent successfully"}
        else:
            response.status_code = status.HTTP_502_BAD_GATEWAY
            return {
                "status": "error", 
                "message": "Failed to send test message. Please verify the webhook URL is valid and accessible."
            }
    except Exception as e:
        traceback.print_exc()
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": "error", "message": f"Error testing webhook: {str(e)}"}