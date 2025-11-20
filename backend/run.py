#!/usr/bin/env python3
"""
Launcher script for the TrialSage Study Architect API server.
"""

import os
import sys
import subprocess
import argparse

def run_server(host="0.0.0.0", port=8000, reload=True):
    """
    Run the FastAPI server using uvicorn.
    
    Args:
        host: Host to bind to
        port: Port to bind to
        reload: Whether to enable auto-reload
    """
    # Ensure we're in the correct directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    
    # Build the command
    cmd = [
        sys.executable, "-m", "uvicorn", "main:app", 
        "--host", host, 
        "--port", str(port)
    ]
    
    if reload:
        cmd.append("--reload")
    
    # Run the server
    print(f"Starting TrialSage Study Architect API on {host}:{port}")
    subprocess.run(cmd)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the TrialSage Study Architect API server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--no-reload", action="store_true", help="Disable auto-reload")
    
    args = parser.parse_args()
    
    run_server(host=args.host, port=args.port, reload=not args.no_reload)