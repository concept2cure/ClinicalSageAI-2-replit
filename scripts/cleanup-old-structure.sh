
#!/bin/bash

echo "🧹 Starting cleanup of old structure..."

# List of directories to remove (keeping essential ones)
CLEANUP_DIRS=(
    "backup*"
    "temp_*"
    "legacy"
    "archive"
    "demonstration"
    "may14_complete_restore"
    "locked_files"
    "snapshots"
    "dev_ops/backup*"
    "trialsage_core_5_20_25"
    "worker"
    "servera"
    "charts"
    "infra"
    "investor-demo-results"
    "landing-assets"
    "processed_documents"
    "project_audit"
    "replit_agent"
    "attached_assets"
)

# List of file patterns to remove
CLEANUP_FILES=(
    "*.bak"
    "*.backup"
    "*.old"
    "*.temp"
    "*.locked"
    "*_backup*"
    "*_old*"
    "*VERSION_LOCK*"
    "*PROTECTION*"
    "*VERIFICATION*"
    "*.html.bak"
    "*.jsx.bak"
)

echo "📁 Removing redundant directories..."
for dir in "${CLEANUP_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  Removing: $dir"
        rm -rf "$dir"
    fi
done

echo "📄 Removing backup and temporary files..."
for pattern in "${CLEANUP_FILES[@]}"; do
    find . -name "$pattern" -type f -delete 2>/dev/null
done

# Remove duplicate package.json files (keep root one)
find . -name "package.json" -not -path "./package.json" -not -path "./trialsage-clean/*" -delete

# Remove duplicate requirements.txt files (keep root one)
find . -name "requirements.txt" -not -path "./requirements.txt" -not -path "./trialsage-clean/*" -delete

echo "🗂️ Consolidating scattered HTML files..."
mkdir -p public/archive
mv *.html public/archive/ 2>/dev/null || true

echo "✅ Cleanup complete!"
echo "📊 Directory structure simplified significantly"
