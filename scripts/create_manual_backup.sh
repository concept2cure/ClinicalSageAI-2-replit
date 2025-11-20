
#!/bin/bash
# Manual backup script for critical components
BACKUP_DIR="manual_backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup critical files
cp -r client/src/components/cer "$BACKUP_DIR/"
cp -r client/src/pages/CERV2Page.jsx "$BACKUP_DIR/"
cp -r client/src/components/coauthor "$BACKUP_DIR/"
cp -r server/routes "$BACKUP_DIR/"
cp -r shared "$BACKUP_DIR/"

echo "Backup created in $BACKUP_DIR"
