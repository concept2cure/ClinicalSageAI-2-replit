
#!/bin/bash

echo "🧹 Starting TrialSage Emergency Cleanup..."

# Remove redundant backup directories
echo "Removing redundant backup directories..."
rm -rf backup_may10/ complete_restore/ full_restore/ may9_restore/ newest_restore/
rm -rf temp_backup/ temp_extract/ temp_extract_all/ temp_restore/ tmp_backup/
rm -rf backup/ cer_backup/ phase2_milestone_backup_2025_07_10/

# Remove temporary files
echo "Removing temporary files..."
rm -rf tmp/ temp/ temp_documents/ temp_ui/

# Remove duplicate client structures
echo "Cleaning up duplicate structures..."
rm -rf may9_portal_restore/ fresh_restore/

# Remove unused Python environments
echo "Consolidating Python environments..."
mv trialsage/* server/ 2>/dev/null || true
rm -rf trialsage/

# Clean up logs
echo "Cleaning up old logs..."
find . -name "*.log" -type f -delete
find . -name "*.log.*" -type f -delete

echo "✅ Emergency cleanup completed!"
echo "📊 Estimated space saved: ~2GB"
echo "⚠️  Please restart the application after cleanup"
