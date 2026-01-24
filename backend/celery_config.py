"""
Celery Configuration for LumenTrialGuide.AI

This module sets up Celery with Redis as both the message broker
and result backend, enabling robust task management for long-running
operations like enhanced PDF generation and data processing.
"""

import os
from celery import Celery

# Redis connection settings from environment variables
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = os.environ.get('REDIS_PORT', '6379')
REDIS_DB = os.environ.get('REDIS_DB', '0')
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', None)

# Build Redis URI based on whether password is provided
if REDIS_PASSWORD:
    REDIS_URI = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"
else:
    REDIS_URI = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"

# Configure Celery
celery_app = Celery(
    'lumen_trial_guide',
    broker=REDIS_URI,
    backend=REDIS_URI,
    include=['tasks']  # Tasks module where task functions are defined
)

# Celery configuration settings
celery_app.conf.update(
    # Task settings
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    
    # Task execution settings
    task_acks_late=True,  # Tasks are acknowledged after execution (better for reliability)
    worker_prefetch_multiplier=1,  # Prefetch only one task at a time
    
    # Result backend settings
    result_expires=86400,  # Results expire after 24 hours
    
    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3  # Maximum 3 retries
)

# Start Celery app when this module is run directly
if __name__ == '__main__':
    celery_app.start()