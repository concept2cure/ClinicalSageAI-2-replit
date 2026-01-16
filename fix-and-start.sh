#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

echo "Environment loaded."

# 1. Kill any existing node processes to free ports
echo "Cleaning up processes..."
pkill -f "node" || true
pkill -f "npm run dev" || true
sleep 2

# 2. Push Schema to Database (Non-interactive)
echo "Pushing database schema..."
# npx drizzle-kit push --force
# Note: --force might not be supported in all versions, but 'push' is usually intended for development
npm run db:push

# 3. Seed Data
echo "Seeding facts..."
npx tsx seed_facts.ts

# 4. Start Server
echo "Starting Application..."
npm run dev
