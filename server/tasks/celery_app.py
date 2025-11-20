"""
Celery Application Configuration 

This module configures the Celery application with Redis as broker/backend
and sets up the beat schedule for periodic tasks.
"""
import os
from celery import Celery
from celery.schedules import crontab

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
    'trialsage',
    broker=REDIS_URI,
    backend=REDIS_URI,
    include=['server.tasks.esg_tasks']
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
    task_acks_late=True,  # Tasks are acknowledged after execution
    worker_prefetch_multiplier=1,  # Prefetch only one task at a time
    
    # Result backend settings
    result_expires=86400,  # Results expire after 24 hours
    
    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,  # Maximum 3 retries
    
    # Beat schedule for periodic tasks
    beat_schedule={
        'poll-esg-acks': {
            'task': 'server.tasks.esg_tasks.poll_esg_acks',
            'schedule': 1800.0,  # Every 30 minutes (in seconds)
            'options': {'expires': 1700}  # Expires just before next run
        },
    }
)

# Start Celery app when this module is run directly
if __name__ == '__main__':
    celery_app.start()