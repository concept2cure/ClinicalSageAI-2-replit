#!/bin/bash

# Lightweight status monitor for protection system
PROTECTED_DIR="./locked_files/cerv2_protected"

# Use flag files instead of computing values repeatedly
INTEGRITY_FLAG="$PROTECTED_DIR/.integrity_status"
LAST_CHECK="$PROTECTED_DIR/.last_check"

# Update status only once every hour
CURRENT_TIME=$(date +%s)
if [ -f "$LAST_CHECK" ]; then
  CHECK_TIME=$(cat "$LAST_CHECK")
  if [ $((CURRENT_TIME - CHECK_TIME)) -lt 3600 ]; then
    if [ -f "$INTEGRITY_FLAG" ] && [ "$(cat "$INTEGRITY_FLAG")" = "ok" ]; then
      echo -e "\033[0;32m✓ Protection system OK (cached status)\033[0m"
      exit 0
    fi
  fi
fi

# Perform lightweight check
if [ -f "client/src/pages/CERV2Page.jsx" ] && \
   [ -f "$PROTECTED_DIR/CERV2Page.jsx" ] && \
   [ -f "$PROTECTED_DIR/CERV2Page.jsx.md5" ]; then
  echo "ok" > "$INTEGRITY_FLAG"
  echo "$CURRENT_TIME" > "$LAST_CHECK"
  echo -e "\033[0;32m✓ Protection system OK\033[0m"
else
  echo "error" > "$INTEGRITY_FLAG"
  echo "$CURRENT_TIME" > "$LAST_CHECK"
  echo -e "\033[0;31m✗ Protection system error\033[0m"
fi
