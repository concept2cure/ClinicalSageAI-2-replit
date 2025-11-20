"""
Alerter Module for LumenTrialGuide.AI

This module provides the alerting capabilities for system events
including Traefik health status and certificate expiration warnings.

Alerts can be delivered to multiple channels based on user preferences:
- Email
- Microsoft Teams webhook
- System console/logs
"""
import os
import json
import requests
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# User alert preferences cache
# Format: {user_id: {'email': bool, 'teams': bool}}
USER_PREFERENCES = {}

# Global settings
EMAIL_FROM = os.getenv('ALERT_EMAIL_FROM', 'alerts@lumentrial.ai')
EMAIL_SERVER = os.getenv('SMTP_SERVER', 'smtp.sendgrid.net')
EMAIL_PORT = int(os.getenv('SMTP_PORT', '587'))
EMAIL_USER = os.getenv('SMTP_USER', '')  
EMAIL_PASSWORD = os.getenv('SMTP_PASSWORD', '')
TEAMS_WEBHOOK_URL = os.getenv('TEAMS_WEBHOOK_URL', '')

def load_user_preferences():
    """Load user alert preferences from database or config file"""
    try:
        # In a production environment, this would load from database
        # For now, load from a JSON file if it exists
        prefs_file = os.path.join(os.getcwd(), 'data', 'alert_preferences.json')
        if os.path.exists(prefs_file):
            with open(prefs_file, 'r') as f:
                global USER_PREFERENCES
                USER_PREFERENCES = json.load(f)
    except Exception as e:
        print(f"Error loading alert preferences: {e}")
        # Use defaults if loading fails
        USER_PREFERENCES = {
            'admin': {'email': True, 'teams': True},
            'default': {'email': True, 'teams': False}
        }

def save_user_preferences():
    """Save user alert preferences to database or config file"""
    try:
        # Create data directory if it doesn't exist
        data_dir = os.path.join(os.getcwd(), 'data')
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            
        # Save to JSON file
        prefs_file = os.path.join(data_dir, 'alert_preferences.json')
        with open(prefs_file, 'w') as f:
            json.dump(USER_PREFERENCES, f, indent=2)
    except Exception as e:
        print(f"Error saving alert preferences: {e}")

def set_user_preference(user_id, channel, enabled):
    """Set alert channel preference for a user
    
    Args:
        user_id: The user ID
        channel: 'email' or 'teams'
        enabled: True to enable, False to disable
    """
    if user_id not in USER_PREFERENCES:
        USER_PREFERENCES[user_id] = {'email': False, 'teams': False}
        
    USER_PREFERENCES[user_id][channel] = enabled
    save_user_preferences()

def publish(alert_data):
    """Publish an alert to all configured channels based on severity and user preferences
    
    Args:
        alert_data: Dictionary containing alert information:
            - msg: Alert message
            - timestamp: ISO timestamp
            - type: Alert type (e.g., 'traefik', 'cert_expiry')
            - status: 'healthy', 'warning', or 'error'
    """
    # Ensure user preferences are loaded
    if not USER_PREFERENCES:
        load_user_preferences()
    
    # Log alert to console
    log_alert(alert_data)
    
    # Initialize list of users to notify
    users_to_notify = []
    
    # Determine which users to notify based on alert severity
    severity = alert_data.get('status', 'warning')
    
    if severity == 'error':
        # Notify all admin users for errors
        users_to_notify = [uid for uid, prefs in USER_PREFERENCES.items() 
                          if uid.startswith('admin') or uid == 'default']
    elif severity == 'warning':
        # Notify only users who've opted into warnings
        users_to_notify = [uid for uid, prefs in USER_PREFERENCES.items() 
                          if prefs.get('warning_alerts', True)]
    
    # Send alerts based on user channel preferences
    for user_id in users_to_notify:
        preferences = USER_PREFERENCES.get(user_id, {'email': False, 'teams': False})
        
        if preferences.get('email', False):
            send_email_alert(user_id, alert_data)
            
        if preferences.get('teams', False):
            send_teams_alert(alert_data)

def log_alert(alert_data):
    """Log alert to console and log file
    
    Args:
        alert_data: Alert data dictionary
    """
    timestamp = alert_data.get('timestamp', datetime.utcnow().isoformat())
    msg = alert_data.get('msg', 'Unknown alert')
    alert_type = alert_data.get('type', 'unknown')
    status = alert_data.get('status', 'warning')
    
    # Format for console
    color_code = "\033[93m" if status == 'warning' else "\033[91m" if status == 'error' else "\033[92m"
    reset_code = "\033[0m"
    print(f"{color_code}[ALERT:{status.upper()}]{reset_code} {timestamp} - {alert_type}: {msg}")
    
    # Also log to file
    try:
        log_dir = os.path.join(os.getcwd(), 'logs')
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        log_file = os.path.join(log_dir, 'alerts.log')
        with open(log_file, 'a') as f:
            f.write(f"{timestamp} - {status.upper()} - {alert_type}: {msg}\n")
    except Exception as e:
        print(f"Error writing to alert log: {e}")

def send_email_alert(user_id, alert_data):
    """Send alert via email
    
    Args:
        user_id: User ID to send to
        alert_data: Alert data dictionary
    """
    if not EMAIL_USER or not EMAIL_PASSWORD:
        print("Email alerts disabled: missing SMTP credentials")
        return
        
    try:
        # In production, we'd look up the user's email from a database
        # For now, use a simple mapping or convention
        email_to = f"{user_id}@lumentrial.ai"
        
        msg = MIMEMultipart()
        msg['From'] = EMAIL_FROM
        msg['To'] = email_to
        
        status = alert_data.get('status', 'warning').upper()
        alert_type = alert_data.get('type', 'system').upper()
        
        msg['Subject'] = f"LumenTrial {status} Alert: {alert_type}"
        
        # Create email body
        body = f"""
        <html>
        <body>
            <h2>LumenTrial.AI {status} Alert</h2>
            <p><strong>Type:</strong> {alert_type}</p>
            <p><strong>Time:</strong> {alert_data.get('timestamp')}</p>
            <p><strong>Message:</strong> {alert_data.get('msg')}</p>
            <hr>
            <p>This is an automated alert from the LumenTrial.AI platform.</p>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        # Connect to server and send
        server = smtplib.SMTP(EMAIL_SERVER, EMAIL_PORT)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        
        print(f"Email alert sent to {email_to}")
        
    except Exception as e:
        print(f"Error sending email alert: {e}")

def send_teams_alert(alert_data):
    """Send alert to Microsoft Teams via webhook
    
    Args:
        alert_data: Alert data dictionary
    """
    if not TEAMS_WEBHOOK_URL:
        print("Teams alerts disabled: missing webhook URL")
        return
        
    try:
        status = alert_data.get('status', 'warning')
        color = "ff0000" if status == 'error' else "ffcc00" if status == 'warning' else "00cc00"
        
        # Format Teams message card
        teams_message = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "contentUrl": None,
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.2",
                        "body": [
                            {
                                "type": "TextBlock",
                                "size": "large",
                                "weight": "bolder",
                                "text": f"LumenTrial.AI {status.upper()} Alert",
                                "color": status
                            },
                            {
                                "type": "TextBlock",
                                "text": alert_data.get('msg'),
                                "wrap": True
                            },
                            {
                                "type": "FactSet",
                                "facts": [
                                    {
                                        "title": "Type",
                                        "value": alert_data.get('type', 'system')
                                    },
                                    {
                                        "title": "Time",
                                        "value": alert_data.get('timestamp')
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        }
        
        # Send to Teams webhook
        response = requests.post(
            TEAMS_WEBHOOK_URL,
            headers={"Content-Type": "application/json"},
            data=json.dumps(teams_message)
        )
        
        if response.status_code == 200:
            print("Teams alert sent successfully")
        else:
            print(f"Error sending Teams alert: HTTP {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Error sending Teams alert: {e}")

# Load preferences on module import
load_user_preferences()