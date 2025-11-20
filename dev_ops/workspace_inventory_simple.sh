#!/bin/bash

# TrialSage Workspace Inventory Generator (Simplified)
WORKSPACE_DIR="/home/runner/workspace"
INVENTORY_FILE="dev_ops/backups/workspace_inventory.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "# TrialSage Workspace Inventory" > "$INVENTORY_FILE"
echo "Generated: $TIMESTAMP" >> "$INVENTORY_FILE"
echo "" >> "$INVENTORY_FILE"

echo "## File Inventory" >> "$INVENTORY_FILE"
echo "| File Path | Size (bytes) | Modified | SHA256 Checksum |" >> "$INVENTORY_FILE"
echo "|-----------|--------------|----------|-----------------|" >> "$INVENTORY_FILE"

total_files=0
total_size=0

find "$WORKSPACE_DIR" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dev_ops/backups/archives/*" | head -1000 | while read -r file; do
    rel_path="${file#$WORKSPACE_DIR/}"
    size=$(stat -c%s "$file" 2>/dev/null || echo "0")
    modified=$(stat -c%Y "$file" 2>/dev/null | xargs -I {} date -u -d @{} +"%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")
    checksum=$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1 | cut -c1-16 || echo "error")
    
    echo "| $rel_path | $size | $modified | ${checksum}... |" >> "$INVENTORY_FILE"
    total_files=$((total_files + 1))
    total_size=$((total_size + size))
done

echo "" >> "$INVENTORY_FILE"
echo "## Summary" >> "$INVENTORY_FILE"
echo "- Total files processed: $total_files" >> "$INVENTORY_FILE"
echo "- Total size: $total_size bytes" >> "$INVENTORY_FILE"
echo "- Inventory completed: $TIMESTAMP" >> "$INVENTORY_FILE"

echo "Inventory generation complete! Saved to: $INVENTORY_FILE"