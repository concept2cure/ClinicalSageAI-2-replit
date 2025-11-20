"""
Celery Tasks Module for LumenTrialGuide.AI

This module defines background tasks for automated monitoring and alerting,
including Traefik health checks and certificate expiration warnings.
"""
import os
import json
import datetime
import requests
from celery import Celery

# Setup Celery with Redis
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
celery_app = Celery('ind_automation', broker=redis_url, backend=redis_url)

# Configure Celery settings
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)

# Traefik API configuration
TRAEFIK_URL = os.getenv('TRAEFIK_API', 'http://traefik:8080/api/health')

@celery_app.on_after_finalize.connect
def setup_periodic_tasks(sender, **kwargs):
    """Set up periodic tasks to run automatically"""
    # Traefik health check every 5 minutes
    sender.add_periodic_task(300, traefik_health.signature(), name='traefik health')
    
    # Cert expiry check once per day
    sender.add_periodic_task(
        86400,  # 24 hours
        cert_expiry_check.signature(),
        name='certificate expiry check'
    )

@celery_app.task
def traefik_health():
    """Check Traefik health and alert if not healthy"""
    from ind_automation import alerter
    
    try:
        response = requests.get(TRAEFIK_URL, timeout=4)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'UP':
                return {"status": "healthy", "message": "Traefik is healthy"}
            else:
                # Alert on non-UP status
                alert_data = {
                    "msg": f"Traefik reports DOWN status: {data.get('status')}",
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                    "type": "alert",
                    "status": "error"
                }
                alerter.publish(alert_data)
                return alert_data
        else:
            # Alert on non-200 response
            alert_data = {
                "msg": f"Traefik health check failed with HTTP {response.status_code}",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "type": "alert",
                "status": "error"
            }
            alerter.publish(alert_data)
            return alert_data
    except Exception as e:
        # Alert on connection error
        alert_data = {
            "msg": f"Traefik health error: {str(e)}",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "type": "alert",
            "status": "error"
        }
        alerter.publish(alert_data)
        return alert_data

@celery_app.task
def cert_expiry_check():
    """Check certificate expiry for domain(s)"""
    from ind_automation import alerter
    
    domains = os.getenv('MONITORED_DOMAINS', '').split(',')
    if not domains or domains[0] == '':
        domains = [os.getenv('PRIMARY_DOMAIN', None)]
    
    # Default Traefik API endpoint for certs
    traefik_url = os.getenv('TRAEFIK_API', 'http://traefik:8080')
    acme_url = f"{traefik_url}/api/acme/account/certificates"
    
    results = {}
    for domain in domains:
        if not domain:
            continue
            
        try:
            response = requests.get(acme_url, timeout=5)
            if response.status_code == 200:
                certs = response.json()
                
                for cert in certs:
                    cert_domains = cert.get('domains', [])
                    
                    if domain in cert_domains:
                        expiry = cert.get('expiresAt')
                        if expiry:
                            expiry_date = datetime.datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                            now = datetime.datetime.now(datetime.timezone.utc)
                            days_left = (expiry_date - now).days
                            
                            cert_status = {
                                "domain": domain,
                                "expires_in_days": days_left,
                                "expiry_date": expiry,
                                "status": "warning" if days_left <= 7 else "healthy"
                            }
                            
                            # Alert if certificate expires in 7 days or less
                            if days_left <= 7:
                                alert_data = {
                                    "msg": f"Certificate for {domain} expires in {days_left} days",
                                    "timestamp": datetime.datetime.utcnow().isoformat(),
                                    "type": "cert_expiry",
                                    "status": "warning"
                                }
                                alerter.publish(alert_data)
                            
                            results[domain] = cert_status
                            break
                    
                # No certificate found for domain
                if domain not in results:
                    results[domain] = {
                        "domain": domain,
                        "status": "error",
                        "message": "No certificate found"
                    }
                    
                    alert_data = {
                        "msg": f"No certificate found for domain {domain}",
                        "timestamp": datetime.datetime.utcnow().isoformat(),
                        "type": "cert_missing",
                        "status": "error"
                    }
                    alerter.publish(alert_data)
            else:
                results[domain] = {
                    "domain": domain,
                    "status": "error",
                    "message": f"Failed to check certificate: HTTP {response.status_code}"
                }
        except Exception as e:
            results[domain] = {
                "domain": domain,
                "status": "error",
                "message": f"Error: {str(e)}"
            }
    
    return results