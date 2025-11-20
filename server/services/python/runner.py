
#!/usr/bin/env python3
"""
Python Services Runner

This script provides a unified entry point for all Python services in TrialSage.
"""
import sys
import os
import subprocess
from pathlib import Path

def install_dependencies():
    """Install Python dependencies"""
    # Use local requirements.txt instead of the main conflicted one
    local_requirements = Path(__file__).parent / "requirements.txt"
    main_requirements = Path(__file__).parent.parent.parent / "requirements.txt"
    
    if local_requirements.exists():
        print(f"Installing dependencies from local requirements: {local_requirements}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(local_requirements)])
    elif main_requirements.exists():
        print(f"Warning: Using main requirements.txt which may have conflicts: {main_requirements}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(main_requirements)])
    else:
        print(f"No requirements file found. Checked: {local_requirements}, {main_requirements}")

def run_fastapi_server():
    """Run the FastAPI server"""
    from .main import app
    import uvicorn
    
    port = int(os.getenv("PYTHON_PORT", 8000))
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        workers=1,
        timeout_keep_alive=30,
        access_log=False
    )

def train_models():
    """Train all ML models"""
    from .ml.train_success_predictor import train_success_predictor
    from .ml.train_failure_reason import train_failure_model
    from .ml.train_trial_predictor import train_trial_predictor
    
    print("Training ML models...")
    train_success_predictor()
    train_failure_model() 
    train_trial_predictor()
    print("Model training complete.")

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python runner.py [install|server|train]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "install":
        install_dependencies()
    elif command == "server":
        run_fastapi_server()
    elif command == "train":
        train_models()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == "__main__":
    main()
