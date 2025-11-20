#!/bin/bash

# Ultra-Fast CERV2Page.jsx Recovery
# Optimized for SLA response time below 50ms

# Define paths
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
PROTECTED_DIR="./locked_files/cerv2_protected"
BACKUP_FILE="$PROTECTED_DIR/CERV2Page.jsx"
STATUS_FILE="$PROTECTED_DIR/.status_indicator"
LOCK_FILE="$PROTECTED_DIR/.recovery_lock"

# Step 1: Check if we already have a recovery lock to prevent concurrent operations
if [ -f "$LOCK_FILE" ]; then
  LOCK_TIME=$(cat "$LOCK_FILE")
  CURRENT_TIME=$(date +%s)
  
  # If lock is older than 30 seconds, assume stale and proceed
  if [ $((CURRENT_TIME - LOCK_TIME)) -lt 30 ]; then
    echo -e "\033[0;33m⚠ Recovery already in progress\033[0m"
    exit 0
  fi
fi

# Set a recovery lock
echo "$(date +%s)" > "$LOCK_FILE"

# Step 2: Check if file exists
if [ ! -f "$SOURCE_FILE" ]; then
  # File missing - restore immediately
  cp "$BACKUP_FILE" "$SOURCE_FILE"
  echo "$(date +%s)|valid" > "$STATUS_FILE"
  rm "$LOCK_FILE"
  echo -e "\033[0;32m✓ Missing file restored\033[0m"
  exit 0
fi

# Step 3: Use binary comparison
if cmp -s "$SOURCE_FILE" "$BACKUP_FILE"; then
  # Files already match - no action needed
  echo "$(date +%s)|valid" > "$STATUS_FILE"
  rm "$LOCK_FILE"
  echo -e "\033[0;32m✓ No recovery needed\033[0m"
  exit 0
fi

# Step 4: Quick backup and restore
cp "$SOURCE_FILE" "$SOURCE_FILE.backup.$(date +%s)" 2>/dev/null
cp "$BACKUP_FILE" "$SOURCE_FILE"
echo "$(date +%s)|valid" > "$STATUS_FILE"
rm "$LOCK_FILE"
echo -e "\033[0;32m✓ Ultra-fast recovery completed\033[0m"
exit 0