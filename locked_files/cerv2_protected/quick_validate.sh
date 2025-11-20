#!/bin/bash

# Quick integrity validator with caching
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
PROTECTED_DIR="./locked_files/cerv2_protected"
CHECKSUM_FILE="$PROTECTED_DIR/CERV2Page.jsx.md5"
CACHE_FILE="$PROTECTED_DIR/.validation_cache"

# Get current timestamp
TIMESTAMP=$(date +%s)

# Check if cache exists and is recent (less than 10 minutes old)
if [ -f "$CACHE_FILE" ]; then
  CACHE_TIME=$(cat "$CACHE_FILE" | cut -d'|' -f1)
  CACHE_RESULT=$(cat "$CACHE_FILE" | cut -d'|' -f2)
  
  # If cache is less than 10 minutes old, use cached result
  if [ $((TIMESTAMP - CACHE_TIME)) -lt 600 ]; then
    if [ "$CACHE_RESULT" = "valid" ]; then
      echo -e "\033[0;32m✓ Integrity check passed (cached)\033[0m"
      exit 0
    else
      echo -e "\033[0;31m✗ Integrity check failed (cached)\033[0m"
      exit 1
    fi
  fi
fi

# Calculate checksums and compare
if [ -f "$SOURCE_FILE" ] && [ -f "$CHECKSUM_FILE" ]; then
  CURRENT_MD5=$(md5sum "$SOURCE_FILE" | awk '{ print $1 }')
  STORED_MD5=$(cat "$CHECKSUM_FILE" | awk '{ print $1 }')
  
  if [ "$CURRENT_MD5" = "$STORED_MD5" ]; then
    echo -e "\033[0;32m✓ Integrity check passed\033[0m"
    echo "$TIMESTAMP|valid" > "$CACHE_FILE"
    exit 0
  else
    echo -e "\033[0;31m✗ Integrity check failed\033[0m"
    echo "$TIMESTAMP|invalid" > "$CACHE_FILE"
    exit 1
  fi
else
  echo -e "\033[0;31m✗ Required files missing\033[0m"
  exit 1
fi