#!/usr/bin/env python3
"""
Python FastAPI Services Startup Script
Handles installation of dependencies and startup of Python services
"""
import subprocess
import sys
import os
import time

def install_dependencies():
    """Install Python dependencies if needed"""
    try:
        import uvicorn
        import fastapi
        print("✅ Core Python dependencies already installed")
        return True
    except ImportError:
        print("📦 Installing Python dependencies...")
        
        # Try pip install
        try:
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", 
                "fastapi==0.108.0",
                "uvicorn[standard]==0.25.0",
                "pydantic[email]==2.5.2",
                "python-multipart==0.0.6",
                "python-dotenv==1.0.0",
                "requests==2.31.0",
                "structlog==23.1.0"
            ])
            print("✅ Python dependencies installed successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"⚠️ Failed to install dependencies: {e}")
            return False

def start_service():
    """Start the Python FastAPI service"""
    if install_dependencies():
        try:
            import uvicorn
            print("🐍 Starting Python FastAPI service...")
            # Start uvicorn server
            uvicorn.run(
                "main:app",
                host="0.0.0.0",
                port=8000,
                reload=False,
                log_level="info"
            )
        except Exception as e:
            print(f"❌ Failed to start Python service: {e}")
    else:
        print("❌ Cannot start Python service - dependencies not available")

if __name__ == "__main__":
    start_service()