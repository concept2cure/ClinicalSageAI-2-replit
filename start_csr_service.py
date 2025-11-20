#!/usr/bin/env python3
# Comprehensive startup script for CSR search service
# This script:
# 1. Fixes CSR data integrity issues
# 2. Starts the FastAPI server
# 3. Ensures the server stays running

import os
import sys
import subprocess
import signal
import time
import atexit

# Process tracking
child_processes = []

def cleanup():
    """Cleanup function to terminate child processes on exit"""
    for process in child_processes:
        try:
            if process.poll() is None:  # Check if process is still running
                print(f"⏹️ Stopping process (PID: {process.pid})...")
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        except Exception as e:
            print(f"Warning: Error during cleanup: {str(e)}")

def run_fix_csr_data():
    """Run the CSR data fixer script"""
    print("🔍 Step 1: Fixing CSR data integrity issues...")
    
    # Run the fix_csr_data.py script
    result = subprocess.run(
        [sys.executable, "fix_csr_data.py"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Failed to fix CSR data: {result.stderr}")
        return False
    
    # Print summary line from output
    for line in result.stdout.splitlines():
        if "Summary:" in line or "Complete!" in line:
            print(f"✅ {line.strip()}")
    
    return True

def start_api_server():
    """Start the FastAPI server using our wrapper script"""
    print("🚀 Step 2: Starting FastAPI CSR search service...")
    
    try:
        # Start process in its own process group
        process = subprocess.Popen(
            [sys.executable, "run_csr_api.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            preexec_fn=os.setsid  # Create a new process group
        )
        
        # Add to tracking list
        child_processes.append(process)
        
        # Wait a moment for startup
        time.sleep(3)
        
        # Check if process is still running
        if process.poll() is None:
            print(f"✅ FastAPI CSR search service started successfully (PID: {process.pid})")
            return True
        else:
            out, err = process.communicate()
            print(f"❌ FastAPI server failed to start:\n{err}")
            return False
            
    except Exception as e:
        print(f"❌ Failed to start FastAPI server: {str(e)}")
        return False

def main():
    print("🔧 TrialSage CSR Search Service Startup")
    
    # Register cleanup handler
    atexit.register(cleanup)
    
    # Step 1: Fix CSR data
    if not run_fix_csr_data():
        print("❌ Failed to fix CSR data. Aborting startup.")
        return 1
    
    # Step 2: Start API server
    if not start_api_server():
        print("❌ Failed to start the FastAPI server. Aborting startup.")
        return 1
    
    print("\n🌟 CSR search service is now running!")
    print("📋 You can access the API at http://localhost:8000")
    print("🔍 The service is available at /api/csrs in your application")
    print("⚠️ Do not close this terminal window or the service will stop")
    print("💡 Press Ctrl+C to stop the service")
    
    # Keep script running to maintain server
    try:
        while True:
            # Check child processes
            for process in child_processes:
                if process.poll() is not None:
                    print("⚠️ A child process has stopped unexpectedly")
            time.sleep(5)
    except KeyboardInterrupt:
        print("\n⏹️ Stopping CSR search service...")
        return 0
    
    return 0

if __name__ == "__main__":
    sys.exit(main())