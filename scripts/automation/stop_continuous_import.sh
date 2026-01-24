#!/bin/bash

# Stop Continuous Trial Import Service
# This script stops the continuous import process that is running in the background

echo "Stopping continuous trial import service..."

# Check if PID file exists
if [ ! -f continuous_import.pid ]; then
  # If PID file doesn't exist, try to find the process by name
  PID=$(pgrep -f "node continuous_trial_import.js")
  
  if [ -z "$PID" ]; then
    echo "No continuous import service running."
    exit 0
  fi
else
  # Read PID from file
  PID=$(cat continuous_import.pid)
fi

# Check if process is still running
if ps -p $PID > /dev/null; then
  echo "Sending termination signal to process $PID..."
  kill $PID
  
  # Wait for process to terminate
  for i in {1..5}; do
    if ! ps -p $PID > /dev/null; then
      echo "Process terminated successfully."
      break
    fi
    echo "Waiting for process to terminate... ($i/5)"
    sleep 1
  done
  
  # Force kill if still running
  if ps -p $PID > /dev/null; then
    echo "Process not responding. Forcing termination..."
    kill -9 $PID
    sleep 1
  fi
  
  # Final check
  if ! ps -p $PID > /dev/null; then
    echo "Process terminated."
  else
    echo "Failed to terminate process. Please check manually."
  fi
else
  echo "Process $PID is not running."
fi

# Clean up PID file
if [ -f continuous_import.pid ]; then
  rm continuous_import.pid
fi

echo "Continuous import service stopped."
echo "Import progress has been saved and can be resumed later."