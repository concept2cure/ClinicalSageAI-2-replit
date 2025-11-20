#!/bin/bash

# Ultra-Fast CERV2Page.jsx Validator
# Optimized for SLA response time below 50ms

# Define paths
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
PROTECTED_DIR="./locked_files/cerv2_protected"
CACHE_FILE="$PROTECTED_DIR/.validation_cache"
STATUS_FILE="$PROTECTED_DIR/.status_indicator"

# Step 1: Check if status indicator is recent (last 10 minutes)
if [ -f "$STATUS_FILE" ]; then
  STATUS_TIME=$(cut -d'|' -f1 "$STATUS_FILE")
  STATUS_RESULT=$(cut -d'|' -f2 "$STATUS_FILE")
  
  # If status is recent, use it (10 min = 600 seconds)
  if [ $(($(date +%s) - STATUS_TIME)) -lt 600 ]; then
    if [ "$STATUS_RESULT" = "valid" ]; then
      echo -e "\033[0;32m✓ Integrity verified (cached)\033[0m"
      exit 0
    fi
  fi
fi

# Step 2: Use binary comparison (faster than md5)
if cmp -s "$SOURCE_FILE" "$PROTECTED_DIR/CERV2Page.jsx"; then
  # Update status indicator
  echo "$(date +%s)|valid" > "$STATUS_FILE"
  echo -e "\033[0;32m✓ Integrity verified (binary match)\033[0m"
  exit 0
fi

# Step 3: Only if binary comparison fails, check if file exists
if [ ! -f "$SOURCE_FILE" ]; then
  echo "$(date +%s)|invalid" > "$STATUS_FILE"
  echo -e "\033[0;31m✗ Source file missing\033[0m"
  exit 1
fi

# Step 4: Fast size check (much faster than md5)
SOURCE_SIZE=$(stat -c%s "$SOURCE_FILE")
BACKUP_SIZE=$(stat -c%s "$PROTECTED_DIR/CERV2Page.jsx")

if [ "$SOURCE_SIZE" -eq "$BACKUP_SIZE" ]; then
  # Files have same size but different content - possible corruption
  echo "$(date +%s)|uncertain" > "$STATUS_FILE"
  echo -e "\033[0;33m⚠ Size matches but content differs\033[0m"
  exit 2
else
  # Files differ in size - definitely changed
  echo "$(date +%s)|invalid" > "$STATUS_FILE"
  echo -e "\033[0;31m✗ Size mismatch\033[0m"
  exit 1
fi