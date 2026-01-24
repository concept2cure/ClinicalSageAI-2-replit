#!/usr/bin/env python3
# Wrapper script to reliably start the FastAPI CSR search service

import os
import subprocess
import sys
import time
import signal
import requests
from urllib.parse import urlparse
import atexit

# Configuration
API_HOST = "0.0.0.0"
API_PORT = 8000
API_URL = f"http://{API_HOST}:{API_PORT}"
HEALTH_CHECK_ENDPOINT = f"{API_URL}/"
MAX_RETRIES = 5
RETRY_DELAY = 3  # seconds
KILL_TIMEOUT = 5  # seconds

# Process group for cleanup
child_processes = []

def cleanup():
    """Cleanup function to terminate any child processes on exit"""
    for process in child_processes:
        try:
            # Try to terminate the process group
            if process.poll() is None:  # Check if process is still running
                print(f"⏹️ Terminating FastAPI server (PID: {process.pid})...")
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                process.wait(timeout=KILL_TIMEOUT)
        except Exception as e:
            print(f"Warning: Error during cleanup: {str(e)}")

def is_server_running():
    """Check if the FastAPI server is already running"""
    try:
        response = requests.get(HEALTH_CHECK_ENDPOINT, timeout=2)
        return response.status_code == 200
    except requests.exceptions.RequestException:
        return False

def start_server():
    """Start the FastAPI server using uvicorn"""
    print(f"🚀 Starting FastAPI CSR search service on {API_HOST}:{API_PORT}...")
    
    # Build command to run the server using module syntax
    cmd = [
        sys.executable, "-m", "uvicorn", 
        "csr_api:app", 
        "--host", API_HOST, 
        "--port", str(API_PORT),
        "--reload"
    ]
    
    try:
        # Start process with its own process group
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            preexec_fn=os.setsid  # Create a new process group
        )
        
        # Add process to our tracking list
        child_processes.append(process)
        
        print(f"✅ FastAPI server started (PID: {process.pid})")
        
        # Wait for server to start
        retries = 0
        while retries < MAX_RETRIES:
            if is_server_running():
                print("✅ FastAPI server is ready!")
                return True
            
            # Check for early crash
            if process.poll() is not None:
                out, err = process.communicate()
                print(f"❌ FastAPI server crashed during startup:\n{err}")
                return False
            
            # Wait and retry
            retries += 1
            if retries < MAX_RETRIES:
                print(f"⌛ Waiting for server to start (attempt {retries}/{MAX_RETRIES})...")
                time.sleep(RETRY_DELAY)
        
        print("❌ Server health check timed out")
        return False
        
    except Exception as e:
        print(f"❌ Failed to start FastAPI server: {str(e)}")
        return False

def main():
    print("🔍 CSR API Server Launcher")
    
    # Register cleanup handler
    atexit.register(cleanup)
    
    # Check if server is already running
    if is_server_running():
        print("✅ FastAPI server is already running!")
        return 0
    
    # Start server
    if start_server():
        print("🌟 CSR API Server is running. Press Ctrl+C to stop.")
        
        # Keep script running to maintain server
        try:
            while True:
                # Monitor the server and print any output
                for process in child_processes:
                    if process.poll() is not None:
                        print("❌ FastAPI server has stopped unexpectedly")
                        return 1
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n⏹️ Stopping CSR API Server...")
            return 0
    
    return 1

if __name__ == "__main__":
    sys.exit(main())