#!/bin/bash
# Script to run Celery worker for processing background tasks

# Set PYTHONPATH to include the project root
export PYTHONPATH=$PYTHONPATH:.

# Start the Celery worker
celery -A server.tasks.celery_app worker --loglevel=INFO