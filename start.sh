#!/bin/bash

echo "Starting Python FastAPI backend..."
# Start the CSR API FastAPI server in the background
uvicorn csr_api:app --host 0.0.0.0 --port 8000 &

echo "Starting Node.js/TypeScript server..."
# Start the main Node.js server
npm run dev

# Wait for all background processes to complete
wait