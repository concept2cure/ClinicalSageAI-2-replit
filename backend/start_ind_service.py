import os
import sys
import subprocess
import time
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('IND-Service')

def start_service():
    """Start the IND Automation Service FastAPI application"""
    logger.info("Starting IND Automation Service...")
    
    # Ensure we're using the correct Python interpreter
    python_executable = sys.executable
    logger.info(f"Using Python: {python_executable}")
    
    try:
        # Check if the main.py file exists
        if not os.path.exists("ind_automation/main.py"):
            logger.error("IND Automation main.py not found!")
            sys.exit(1)
        
        # Command to start the FastAPI application
        # Using uvicorn to run the FastAPI app on port 8000
        cmd = [
            python_executable, "-m", "uvicorn", 
            "ind_automation.main:app", 
            "--host", "0.0.0.0", 
            "--port", "8000",
            "--reload"
        ]
        
        logger.info(f"Running command: {' '.join(cmd)}")
        
        # Start the process
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        
        logger.info("IND Automation Service started successfully")
        
        # Monitor the process logs
        while True:
            if process.stdout is not None:
                output = process.stdout.readline()
                if output:
                    logger.info(f"IND: {output.strip()}")
            
            if process.stderr is not None:
                error = process.stderr.readline()
                if error:
                    logger.error(f"IND ERROR: {error.strip()}")
            
            # Check if process is still running
            if process.poll() is not None:
                logger.error("IND Automation Service has stopped unexpectedly")
                remaining_output, remaining_error = process.communicate()
                if remaining_output:
                    logger.info(f"Final output: {remaining_output}")
                if remaining_error:
                    logger.error(f"Final error: {remaining_error}")
                break
            
            time.sleep(0.1)
    
    except Exception as e:
        logger.exception(f"Failed to start IND Automation Service: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    start_service()