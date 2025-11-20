# esg_tasks.py – Celery task wrapper for ESG ACK polling
from server.tasks.celery_app import celery_app
from server.utils.esg_ack_poller import fetch_acks
import logging

logger = logging.getLogger("celery.esg")

@celery_app.task
def poll_esg_acks():
    """
    Celery task to poll FDA ESG for acknowledgment files.
    Runs on a schedule defined in celery_app.py (every 30 minutes).
    Downloads ACK1, ACK2, and ACK3 files and updates sequence status.
    """
    logger.info("Running ESG ACK poller...")
    fetch_acks()
    logger.info("ACK polling complete.")