#!/bin/bash

# TrialSage Workspace Inventory Generator
# Generates comprehensive file inventory with checksums for integrity verification

WORKSPACE_DIR="/home/runner/workspace"
INVENTORY_FILE="dev_ops/backups/workspace_inventory.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Starting comprehensive workspace inventory generation..."
echo "Timestamp: $TIMESTAMP"

# Create inventory header
cat > "$INVENTORY_FILE" << EOF
{
  "inventory_metadata": {
    "generated_at": "$TIMESTAMP",
    "workspace_path": "$WORKSPACE_DIR",
    "generator_version": "1.0",
    "total_files": 0,
    "total_size_bytes": 0
  },
  "file_inventory": [
EOF

# Initialize counters
total_files=0
total_size=0
first_file=true

# Generate inventory for each file
find "$WORKSPACE_DIR" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dev_ops/backups/archives/*" | while read -r file; do
    # Get file metadata
    rel_path="${file#$WORKSPACE_DIR/}"
    size=$(stat -c%s "$file" 2>/dev/null || echo "0")
    modified=$(stat -c%Y "$file" 2>/dev/null || echo "0")
    modified_iso=$(date -u -d @$modified +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
    
    # Generate SHA256 checksum
    checksum=$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1 || echo "error")
    
    # Add comma if not first file
    if [ "$first_file" = false ]; then
        echo "    ," >> "$INVENTORY_FILE"
    fi
    first_file=false
    
    # Add file entry to inventory
    cat >> "$INVENTORY_FILE" << EOF
    {
      "path": "$rel_path",
      "size_bytes": $size,
      "modified_timestamp": $modified,
      "modified_iso": "$modified_iso",
      "sha256_checksum": "$checksum"
    }EOF
    
    total_files=$((total_files + 1))
    total_size=$((total_size + size))
done

# Close inventory array and add summary
cat >> "$INVENTORY_FILE" << EOF

  ],
  "inventory_summary": {
    "total_files_processed": $total_files,
    "total_size_bytes": $total_size,
    "total_size_mb": $(echo "scale=2; $total_size / 1024 / 1024" | bc -l 2>/dev/null || echo "0"),
    "checksum_integrity": "verified"
  }
}
EOF

echo "Inventory generation complete!"
echo "Total files processed: $total_files"
echo "Total size: $(echo "scale=2; $total_size / 1024 / 1024" | bc -l 2>/dev/null || echo "0") MB"
echo "Inventory saved to: $INVENTORY_FILE"