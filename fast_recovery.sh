#!/bin/bash

# Fast recovery script optimized for quick response time
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
BACKUP_FILE="./locked_files/cerv2_protected/CERV2Page.jsx"

# Simple validation check to avoid unnecessary recovery
if cmp -s "$SOURCE_FILE" "$BACKUP_FILE"; then
  echo -e "\033[0;32m✓ No recovery needed - files match\033[0m"
  exit 0
fi

# Verify source file exists
if [ ! -f "$SOURCE_FILE" ]; then
  echo -e "\033[0;31m! Source file missing, performing full restoration\033[0m"
else
  # Make a quick backup of the current file just in case
  cp "$SOURCE_FILE" "$SOURCE_FILE.pre_recovery.$(date +%s)"
  echo -e "\033[0;32m✓ Created quick backup of current file\033[0m"
fi

# Quick recovery without extensive checks
cp "$BACKUP_FILE" "$SOURCE_FILE"
echo -e "\033[0;32m✓ Fast recovery completed\033[0m"

# Update the validation cache for quick status checks
if [ -f "./locked_files/cerv2_protected/.validation_cache" ]; then
  echo "$(date +%s)|valid" > "./locked_files/cerv2_protected/.validation_cache"
  echo -e "\033[0;32m✓ Updated validation cache\033[0m"
fi