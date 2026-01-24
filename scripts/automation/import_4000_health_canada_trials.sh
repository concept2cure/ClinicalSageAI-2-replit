#!/bin/bash

# Import 4000 Health Canada Trials
# This script will run the Health Canada trial import process until we reach the target count
# It also includes error monitoring and recovery capabilities

# Set the number of times we'll retry the process
MAX_RETRIES=10

echo "===== Health Canada Trial Import Process ====="
echo "Starting import process to reach 4000 trials"
echo "Timestamp: $(date)"
echo

# Function to check current count
check_current_count() {
  # Get current count from the tracking file
  if [ -f "canada_500_import_progress.json" ]; then
    COUNT=$(grep -o '"trialsImported":[0-9]*' canada_500_import_progress.json | grep -o '[0-9]*')
    if [ -z "$COUNT" ]; then
      COUNT="unknown"
    fi
  else
    COUNT="0"
  fi
  
  echo "Current trial count: $COUNT"
}

# Check initial count
check_current_count

# Run the import process with retries
retry_count=0
while [ $retry_count -lt $MAX_RETRIES ]; do
  echo 
  echo "===== Running import batch $((retry_count + 1)) of $MAX_RETRIES ====="
  echo "Timestamp: $(date)"
  
  # Run the import script
  node run_to_4000_canada_trials.js
  
  # Check if we've reached the target
  check_current_count
  
  if [ "$COUNT" == "4000" ]; then
    echo "Target reached! Import process complete."
    exit 0
  fi
  
  # Increment retry count
  retry_count=$((retry_count + 1))
  
  if [ $retry_count -lt $MAX_RETRIES ]; then
    echo "Waiting 5 seconds before next batch..."
    sleep 5
  fi
done

echo 
echo "===== Import process finished ====="
echo "The maximum number of retries ($MAX_RETRIES) has been reached."
echo "Please check the progress and run the script again if needed."
echo "Timestamp: $(date)"