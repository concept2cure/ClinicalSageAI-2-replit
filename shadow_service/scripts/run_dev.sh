#!/bin/bash
# Run Shadow Service in development mode

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load environment variables from parent project if available
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
fi

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ] && [ -n "$DATABASE_NEON_NEW_SECRET" ]; then
    export DATABASE_URL="$DATABASE_NEON_NEW_SECRET"
fi

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable required"
    exit 1
fi

echo "Starting Shadow Interrogation Service..."
echo "API docs: http://localhost:8001/docs"

# Run with uvicorn
uvicorn shadow_service.main:app --reload --host 0.0.0.0 --port 8001
