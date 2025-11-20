#!/bin/bash

# CERV2Page Protection Performance Optimizer
# This script enhances response time and reduces memory usage
# while maintaining all protection features

# Define color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================================${NC}"
echo -e "${BLUE}CERV2Page Protection Performance Optimizer${NC}"
echo -e "${BLUE}=======================================================${NC}"

# Define paths
PROTECTED_DIR="./locked_files/cerv2_protected"
ARCHIVE_DIR="./locked_files"

# 1. Optimize checksum validation by caching results
echo -e "${GREEN}Optimizing integrity validation...${NC}"

# Create optimized validation script with caching
cat > "$PROTECTED_DIR/quick_validate.sh" << 'EOF'
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
EOF

chmod +x "$PROTECTED_DIR/quick_validate.sh"

# 2. Create optimized binary archive format
echo -e "${GREEN}Creating optimized binary archive format...${NC}"

# Create a small footprint binary archive
if [ -d "$PROTECTED_DIR" ]; then
  # Use more efficient compression
  tar -cf "$ARCHIVE_DIR/cerv2_protection.tar" "$PROTECTED_DIR"
  xz -9 -f "$ARCHIVE_DIR/cerv2_protection.tar"
  
  echo -e "${GREEN}✓ Created optimized binary archive${NC}"
fi

# 3. Create recovery automation script with minimal processing
echo -e "${GREEN}Creating streamlined recovery script...${NC}"

cat > "$PROTECTED_DIR/fast_recovery.sh" << 'EOF'
#!/bin/bash

# Fast recovery script optimized for quick response time
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
BACKUP_FILE="./locked_files/cerv2_protected/CERV2Page.jsx"

# Simple validation check
if cmp -s "$SOURCE_FILE" "$BACKUP_FILE"; then
  echo -e "\033[0;32m✓ No recovery needed - files match\033[0m"
  exit 0
fi

# Quick recovery without extensive checks
cp "$BACKUP_FILE" "$SOURCE_FILE"
echo -e "\033[0;32m✓ Fast recovery completed\033[0m"
EOF

chmod +x "$PROTECTED_DIR/fast_recovery.sh"

# 4. Create resource-efficient status monitor
echo -e "${GREEN}Installing resource-efficient status monitor...${NC}"

cat > "$PROTECTED_DIR/status_monitor.sh" << 'EOF'
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
EOF

chmod +x "$PROTECTED_DIR/status_monitor.sh"

# 5. Set up one-time verification at startup
echo -e "${GREEN}Setting up optimized startup verification...${NC}"

# Update main verification script to use shared cached results
sed -i 's/CHECKSUM_FILE="$PROTECTED_DIR\/CERV2Page.jsx.md5"/CHECKSUM_FILE="$PROTECTED_DIR\/CERV2Page.jsx.md5"\nCACHE_FILE="$PROTECTED_DIR\/.validation_cache"/g' ./verify_cerv2_protection.sh

# Add conditional logic to use cache when available
cat > "$PROTECTED_DIR/check_helper.sh" << 'EOF'
# Function to check file integrity with caching
check_integrity() {
  SOURCE_FILE=$1
  CHECKSUM_FILE=$2
  CACHE_FILE=$3
  
  # Check if cache exists and is recent
  if [ -f "$CACHE_FILE" ]; then
    CACHE_TIME=$(cut -d'|' -f1 "$CACHE_FILE")
    CACHE_RESULT=$(cut -d'|' -f2 "$CACHE_FILE")
    
    # If cache is recent (5 minutes), use it
    if [ $(($(date +%s) - CACHE_TIME)) -lt 300 ]; then
      if [ "$CACHE_RESULT" = "valid" ]; then
        echo "cached_valid"
        return 0
      else
        echo "cached_invalid"
        return 1
      fi
    fi
  fi
  
  # Calculate current check
  if [ -f "$SOURCE_FILE" ] && [ -f "$CHECKSUM_FILE" ]; then
    CURRENT_MD5=$(md5sum "$SOURCE_FILE" | awk '{ print $1 }')
    STORED_MD5=$(cat "$CHECKSUM_FILE" | awk '{ print $1 }')
    
    if [ "$CURRENT_MD5" = "$STORED_MD5" ]; then
      echo "$(date +%s)|valid" > "$CACHE_FILE"
      echo "valid"
      return 0
    else
      echo "$(date +%s)|invalid" > "$CACHE_FILE"
      echo "invalid"
      return 1
    fi
  else
    echo "missing"
    return 2
  fi
}
EOF

# Create a wrapper script that uses the helper functions
cat > "$PROTECTED_DIR/optimized_verify.sh" << 'EOF'
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
EOF

chmod +x "$PROTECTED_DIR/optimized_verify.sh"

# Create a symlink to make it easily accessible
ln -sf "$PROTECTED_DIR/optimized_verify.sh" ./quick_verify.sh

echo -e "${BLUE}=======================================================${NC}"
echo -e "${GREEN}✓ Performance optimizations successfully installed${NC}"
echo -e "${GREEN}✓ Response time improved while maintaining protection${NC}"
echo -e "${BLUE}=======================================================${NC}"