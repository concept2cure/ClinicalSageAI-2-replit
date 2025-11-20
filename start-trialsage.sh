#!/bin/bash

# Start-TrialSage: Combined startup script for both FastAPI and Proxy servers
echo "🚀 Starting TrialSage..."

# Function to handle process cleanup on script exit
cleanup() {
  echo "🛑 Shutting down services..."
  
  # Kill the FastAPI process if it exists
  if [ ! -z "$FASTAPI_PID" ]; then
    echo "Stopping FastAPI (PID: $FASTAPI_PID)..."
    kill -TERM $FASTAPI_PID 2>/dev/null
  fi
  
  # Kill the proxy process if it exists
  if [ ! -z "$PROXY_PID" ]; then
    echo "Stopping Proxy (PID: $PROXY_PID)..."
    kill -TERM $PROXY_PID 2>/dev/null
  fi
  
  echo "Shutdown complete."
  exit 0
}

# Set up trap for script termination
trap cleanup EXIT INT TERM

# Start FastAPI server in the background
echo "📊 Starting FastAPI backend on port 8000..."
python main.py &
FASTAPI_PID=$!

# Give FastAPI a moment to start
sleep 2

# Check if FastAPI started successfully
if ! ps -p $FASTAPI_PID > /dev/null; then
  echo "❌ FastAPI failed to start. Check logs for errors."
  exit 1
fi

echo "✅ FastAPI server started with PID: $FASTAPI_PID"

# Start the ESM Proxy in the background
echo "🔄 Starting Proxy server on port 5000..."
node server/proxy-setup-esm.mjs &
PROXY_PID=$!

# Give Proxy a moment to start
sleep 2

# Check if Proxy started successfully
if ! ps -p $PROXY_PID > /dev/null; then
  echo "❌ Proxy server failed to start. Check logs for errors."
  kill -TERM $FASTAPI_PID
  exit 1
fi

echo "✅ Proxy server started with PID: $PROXY_PID"
echo "🌐 TrialSage is now available at http://localhost:5000"

# Output line to distinguish logs
echo "----------------------------------------"
echo "🔍 Showing combined log output (Ctrl+C to exit)"
echo "----------------------------------------"

# Wait for both processes to finish
wait $FASTAPI_PID $PROXY_PID