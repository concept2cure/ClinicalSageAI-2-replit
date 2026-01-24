#!/bin/bash
# Start the FastAPI server on port 8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000