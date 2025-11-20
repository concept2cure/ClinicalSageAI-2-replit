#!/bin/bash

# TrialSage Component Snapshot Script
# Creates a versioned snapshot of a specific component

# Validate input
if [ -z "$1" ]; then
  echo "Usage: $0 <component_path>"
  echo "Example: $0 client/src/components/cer/GSPRMappingPanel.jsx"
  exit 1
fi

COMPONENT_PATH="$1"

# Check if component exists
if [ ! -f "$COMPONENT_PATH" ]; then
  echo "Error: Component not found at $COMPONENT_PATH"
  exit 1
fi

# Set up snapshot directory structure
COMPONENT_NAME=$(basename "$COMPONENT_PATH")
COMPONENT_DIR=$(dirname "$COMPONENT_PATH")
SNAPSHOT_DIR="snapshots/${COMPONENT_DIR}"
VERSION=$(date +"%Y%m%d%H%M%S")

mkdir -p "$SNAPSHOT_DIR"

# Create the snapshot
SNAPSHOT_FILE="${SNAPSHOT_DIR}/${COMPONENT_NAME%.jsx}_v${VERSION}.jsx"
cp "$COMPONENT_PATH" "$SNAPSHOT_FILE"

if [ $? -eq 0 ]; then
  echo "Snapshot created: $SNAPSHOT_FILE"
  echo "Total snapshots for this component: $(ls -1 "${SNAPSHOT_DIR}/${COMPONENT_NAME%.jsx}"_v*.jsx 2>/dev/null | wc -l)"
else
  echo "Failed to create snapshot!"
fi

# Create a simple manifest file if it doesn't exist
MANIFEST_FILE="${SNAPSHOT_DIR}/manifest.txt"
echo "Component: $COMPONENT_NAME" >> "$MANIFEST_FILE"
echo "Version: $VERSION" >> "$MANIFEST_FILE"
echo "Created: $(date)" >> "$MANIFEST_FILE"
echo "---" >> "$MANIFEST_FILE"

echo "Snapshot complete!"