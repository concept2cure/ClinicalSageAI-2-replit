#!/usr/bin/env bash
# Helper to run Celery worker for development
# Usage: python services/worker.py

import os
import sys
from subprocess import run

if __name__ == '__main__':
    os.execvp('celery', ['celery', '-A', 'services.celery_app', 'worker', '--loglevel=info'])
