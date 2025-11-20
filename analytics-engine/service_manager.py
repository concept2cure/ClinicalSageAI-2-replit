
#!/usr/bin/env python3
"""
Service Manager for TrialSage Analytics Engine
Manages the FastAPI service lifecycle
"""

import subprocess
import os
import sys
import time
import signal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AnalyticsServiceManager:
    def __init__(self):
        self.process = None
        self.port = int(os.environ.get("ANALYTICS_PORT", 8001))
        
    def start_service(self):
        """Start the FastAPI analytics service"""
        try:
            logger.info(f"Starting TrialSage Analytics Engine on port {self.port}")
            
            # Start FastAPI service
            cmd = [
                sys.executable, 
                "fastapi_bridge.py"
            ]
            
            self.process = subprocess.Popen(
                cmd,
                cwd=os.path.dirname(__file__),
                env={**os.environ, "ANALYTICS_PORT": str(self.port)}
            )
            
            logger.info(f"Analytics service started with PID {self.process.pid}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start analytics service: {str(e)}")
            return False
    
    def stop_service(self):
        """Stop the analytics service"""
        if self.process:
            logger.info("Stopping analytics service...")
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                logger.warning("Service didn't stop gracefully, forcing shutdown")
                self.process.kill()
                self.process.wait()
            
            logger.info("Analytics service stopped")
    
    def restart_service(self):
        """Restart the analytics service"""
        self.stop_service()
        time.sleep(2)
        return self.start_service()
    
    def is_running(self):
        """Check if service is running"""
        return self.process and self.process.poll() is None

def main():
    manager = AnalyticsServiceManager()
    
    def signal_handler(signum, frame):
        logger.info("Received shutdown signal")
        manager.stop_service()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    if manager.start_service():
        try:
            # Keep the service running
            while manager.is_running():
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            manager.stop_service()
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
