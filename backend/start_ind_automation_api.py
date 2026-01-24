#!/usr/bin/env python3
"""
IND Automation API Launcher

This script starts the FastAPI service for the IND Automation system.
It ensures the service runs on the correct port and with appropriate settings.
"""

import os
import sys

import uvicorn

# Make sure we can import from the ind_automation package
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Create necessary directories if they don't exist
os.makedirs('templates/forms', exist_ok=True)

# Start the FastAPI service
if __name__ == "__main__":
    uvicorn.run("ind_automation.main:app", host="0.0.0.0", port=8001, reload=True)