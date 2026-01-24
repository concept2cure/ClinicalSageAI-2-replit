#!/bin/bash

# Start Continuous Trial Import Service
# This script starts the continuous import process in the background
# and detaches it from the terminal so it can run while you work on other features

echo "Starting continuous trial import service..."

# Check if the service is already running
if pgrep -f "node continuous_trial_import.js" > /dev/null; then
  echo "Continuous import service is already running."
  exit 1
fi

# Make the script executable
chmod +x continuous_trial_import.js

# Start the service in the background with nohup
nohup node continuous_trial_import.js > continuous_import_output.log 2>&1 &

# Capture the process ID
PID=$!
echo $PID > continuous_import.pid

echo "Continuous import service started with PID: $PID"
echo "You can continue working on other features while trials are imported."
echo "Log file: continuous_import_output.log"
echo "To monitor progress: cat continuous_import_log.txt"
echo "To stop the service: bash stop_continuous_import.sh"