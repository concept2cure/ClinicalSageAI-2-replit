#!/bin/bash
# TrialSage Automated Backup Script
# This script creates daily backups of code and configuration
# to ensure disaster recovery capability

# Set up backup directory
BACKUP_DIR=".backups"
mkdir -p $BACKUP_DIR

# Generate timestamp for the backup file
TIMESTAMP=$(date +%F)
BACKUP_FILE="${BACKUP_DIR}/${TIMESTAMP}_code_backup.tar.gz"

# Log the backup operation
echo "Starting backup operation at $(date)"
echo "Backing up code to ${BACKUP_FILE}"

# Create the backup archive
tar czf "$BACKUP_FILE" \
    client/ \
    server/ \
    shared/ \
    public/ \
    .replit \
    .eslintrc.js \
    .prettierrc \
    package.json \
    tsconfig.json \
    .env.example \
    .gitignore \
    README.md \
    --exclude="node_modules" \
    --exclude=".git" \
    --exclude="*.log" \
    --exclude="dist" \
    --exclude="build"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully at $(date)"
    echo "Backup file size: $(du -h "$BACKUP_FILE" | cut -f1)"
    
    # Keep only the 7 most recent backups
    echo "Cleaning up old backups..."
    ls -t "$BACKUP_DIR"/*_code_backup.tar.gz | tail -n +8 | xargs rm -f
    echo "Backup cleanup completed"
else
    echo "Backup failed with error code $?"
    exit 1
fi

# Create database dump if PostgreSQL is available
if command -v pg_dump &> /dev/null; then
    DB_BACKUP_FILE="${BACKUP_DIR}/${TIMESTAMP}_database_backup.sql"
    echo "Creating database backup to ${DB_BACKUP_FILE}"
    
    # Extract database connection details from environment variables
    if [ -n "$DATABASE_URL" ]; then
        # Parse DATABASE_URL to extract credentials
        # Format: postgres://username:password@hostname:port/database
        DB_USER=$(echo $DATABASE_URL | sed -e 's/^postgres:\/\///' -e 's/:.*$//')
        DB_PASS=$(echo $DATABASE_URL | sed -e 's/^postgres:\/\/[^:]*://' -e 's/@.*$//')
        DB_HOST=$(echo $DATABASE_URL | sed -e 's/^postgres:\/\/[^@]*@//' -e 's/:.*$//')
        DB_PORT=$(echo $DATABASE_URL | sed -e 's/^postgres:\/\/[^:]*:[^:]*:[^:]*://' -e 's/\/.*$//')
        DB_NAME=$(echo $DATABASE_URL | sed -e 's/^postgres:\/\/[^\/]*\///')
        
        PGPASSWORD=$DB_PASS pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME > "$DB_BACKUP_FILE"
        
        if [ $? -eq 0 ]; then
            echo "Database backup completed successfully"
            echo "Database backup file size: $(du -h "$DB_BACKUP_FILE" | cut -f1)"
            gzip "$DB_BACKUP_FILE"
        else
            echo "Database backup failed with error code $?"
        fi
    else
        echo "DATABASE_URL environment variable not found, skipping database backup"
    fi
else
    echo "pg_dump not found, skipping database backup"
fi

echo "Backup process completed at $(date)"
echo "------------------------------------"

# Exit with success
exit 0