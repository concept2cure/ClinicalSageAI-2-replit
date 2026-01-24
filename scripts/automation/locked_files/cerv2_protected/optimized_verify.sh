#!/bin/bash

# Optimized verification script that uses caching
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
PROTECTED_DIR="./locked_files/cerv2_protected"
BACKUP_FILE="$PROTECTED_DIR/CERV2Page.jsx"
CHECKSUM_FILE="$PROTECTED_DIR/CERV2Page.jsx.md5"
CACHE_FILE="$PROTECTED_DIR/.validation_cache"
HELPER_SCRIPT="$PROTECTED_DIR/check_helper.sh"

# Source the helper script if available
if [ -f "$HELPER_SCRIPT" ]; then
  source "$HELPER_SCRIPT"
  
  # Run the optimized integrity check
  RESULT=$(check_integrity "$SOURCE_FILE" "$CHECKSUM_FILE" "$CACHE_FILE")
  
  case "$RESULT" in
    "cached_valid"|"valid")
      echo -e "\033[0;32m✓ Integrity check passed\033[0m"
      exit 0
      ;;
    "cached_invalid"|"invalid")
      echo -e "\033[0;31m✗ Integrity check failed\033[0m"
      echo -e "Would you like to restore from backup? [y/n]"
      read -r response
      if [[ "$response" =~ ^[Yy]$ ]]; then
        cp "$BACKUP_FILE" "$SOURCE_FILE"
        echo -e "\033[0;32m✓ Restored from backup\033[0m"
      fi
      exit 1
      ;;
    *)
      echo -e "\033[0;31m✗ Could not verify integrity\033[0m"
      exit 2
      ;;
  esac
else
  echo -e "\033[0;31m✗ Helper script not found\033[0m"
  exit 3
fi
