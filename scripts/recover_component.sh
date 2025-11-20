#!/bin/bash

# TrialSage Component Recovery Script
# Restores a component from a snapshot

# Validate input
if [ -z "$1" ]; then
  echo "Component path required"
  echo "Usage: $0 <component_path> [version]"
  echo "Example: $0 client/src/components/cer/GSPRMappingPanel.jsx"
  echo "Example with version: $0 client/src/components/cer/GSPRMappingPanel.jsx 20250508142731"
  exit 1
fi

COMPONENT_PATH="$1"
VERSION="$2"

# Check if component exists in snapshots
COMPONENT_NAME=$(basename "$COMPONENT_PATH")
COMPONENT_DIR=$(dirname "$COMPONENT_PATH")
SNAPSHOT_DIR="snapshots/${COMPONENT_DIR}"

# Make sure the snapshot directory exists
if [ ! -d "$SNAPSHOT_DIR" ]; then
  echo "Error: No snapshots found for this component path"
  exit 1
fi

# List available snapshots if version not specified
if [ -z "$VERSION" ]; then
  echo "Available snapshots for ${COMPONENT_NAME}:"
  ls -1 "${SNAPSHOT_DIR}/${COMPONENT_NAME%.jsx}"_v*.jsx 2>/dev/null | sort -r
  echo ""
  echo "To restore a specific version, run:"
  echo "$0 $COMPONENT_PATH <version_number>"
  exit 0
fi

# Find the snapshot
SNAPSHOT_FILE="${SNAPSHOT_DIR}/${COMPONENT_NAME%.jsx}_v${VERSION}.jsx"

if [ ! -f "$SNAPSHOT_FILE" ]; then
  echo "Error: Snapshot version $VERSION not found"
  echo "Available snapshots:"
  ls -1 "${SNAPSHOT_DIR}/${COMPONENT_NAME%.jsx}"_v*.jsx 2>/dev/null | sort -r
  exit 1
fi

# Backup the current file before restoring
CURRENT_BACKUP="${COMPONENT_PATH}.bak"
cp "$COMPONENT_PATH" "$CURRENT_BACKUP"
echo "Current version backed up to $CURRENT_BACKUP"

# Restore the snapshot
cp "$SNAPSHOT_FILE" "$COMPONENT_PATH"

if [ $? -eq 0 ]; then
  echo "Successfully restored $COMPONENT_NAME from snapshot version $VERSION"
  echo "Original file was backed up to $CURRENT_BACKUP"
else
  echo "Failed to restore snapshot!"
fi