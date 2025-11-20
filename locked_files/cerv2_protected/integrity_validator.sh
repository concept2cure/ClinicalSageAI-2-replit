#!/bin/bash

# CERV2Page.jsx Integrity Validator
# This script validates the integrity of the CERV2Page.jsx file
# and helps recover from corruption if detected

# Define color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# File paths
SOURCE_FILE="client/src/pages/CERV2Page.jsx"
PROTECTED_DIR="./locked_files/cerv2_protected"
BACKUP_FILE="$PROTECTED_DIR/CERV2Page.jsx"
CHECKSUM_FILE="$PROTECTED_DIR/CERV2Page.jsx.md5"

# Create timestamp
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

echo "======================================================="
echo "CERV2Page.jsx Integrity Validator"
echo "Running check at: $TIMESTAMP"
echo "======================================================="

# Verify if the source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo -e "${RED}ERROR: Source file $SOURCE_FILE does not exist!${NC}"
    echo -e "${YELLOW}Attempting to restore from protected backup...${NC}"
    
    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$SOURCE_FILE"
        echo -e "${GREEN}Restoration successful!${NC}"
    else
        echo -e "${RED}CRITICAL: No backup file found at $BACKUP_FILE${NC}"
        exit 1
    fi
fi

# Calculate current MD5 checksum
CURRENT_MD5=$(md5sum "$SOURCE_FILE" | awk '{ print $1 }')

# Get stored MD5 checksum
if [ -f "$CHECKSUM_FILE" ]; then
    STORED_MD5=$(cat "$CHECKSUM_FILE" | awk '{ print $1 }')
    
    echo "Comparing checksums..."
    echo "Stored:  $STORED_MD5"
    echo "Current: $CURRENT_MD5"
    
    # Compare checksums
    if [ "$CURRENT_MD5" = "$STORED_MD5" ]; then
        echo -e "${GREEN}✓ Integrity check passed: File is intact${NC}"
    else
        echo -e "${RED}✗ Integrity check failed: File has been modified!${NC}"
        
        # Ask for user confirmation before restoration
        read -p "Do you want to restore the protected version? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Create a backup of the current (possibly corrupted) file
            CORRUPTED_BACKUP="$PROTECTED_DIR/CERV2Page_corrupted_$(date +%Y%m%d_%H%M%S).jsx"
            cp "$SOURCE_FILE" "$CORRUPTED_BACKUP"
            echo "Current file backed up to: $CORRUPTED_BACKUP"
            
            # Restore from protected backup
            cp "$BACKUP_FILE" "$SOURCE_FILE"
            echo -e "${GREEN}Restoration successful!${NC}"
        else
            echo -e "${YELLOW}Restoration skipped. File remains modified.${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Warning: Checksum file not found. Creating new checksum reference.${NC}"
    md5sum "$SOURCE_FILE" > "$CHECKSUM_FILE"
    echo "New checksum reference created."
fi

echo "======================================================="
echo "Integrity check completed"
echo "======================================================="