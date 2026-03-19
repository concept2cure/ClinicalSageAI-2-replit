#!/bin/bash
# Concept2Cure.RI AI — One-command startup
# Usage: ./start.sh

set -e
cd "$(dirname "$0")"

echo "=== Concept2Cure.RI AI Startup ==="

# 1. Start PostgreSQL if not running
echo "[1/3] Starting PostgreSQL..."
if ! pg_ctlcluster 15 main status 2>/dev/null | grep -q "server is running"; then
  pg_ctlcluster 15 main start
  sleep 3
fi
echo "  ✅ PostgreSQL running"

# 2. Verify DB connection
echo "[2/3] Checking database..."
if ! PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -c '\q' trialsage 2>/dev/null; then
  echo "  ⚠️  DB not responding — waiting 5s..."
  sleep 5
fi
echo "  ✅ Database: trialsage"

# 3. Start app server
echo "[3/3] Starting app server on port 5000..."
pkill -f "tsx server/index.ts" 2>/dev/null || true
sleep 1

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/trialsage?sslmode=disable"
export SKIP_DB_STARTUP_TEST=true
export NODE_ENV=development
export PORT=5000
export JWT_SECRET=trialsage-codespace-jwt-secret-2026
export SESSION_SECRET=trialsage-codespace-session-secret-2026
export FASTAPI_SERVER=http://localhost:8001

node_modules/.bin/tsx server/index.ts > /tmp/app.log 2>&1 &
APP_PID=$!
echo "  App server PID: $APP_PID"

# Wait for it to be ready
echo "  Waiting for server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5000/api/health 2>/dev/null | grep -q '"healthy"'; then
    echo "  ✅ Server ready at http://localhost:5000"
    break
  fi
  sleep 2
done

echo ""
echo "=== Ready ==="
echo "  URL:      http://localhost:5000"
echo "  Login:    jm.smith@concept2cure.pro"
echo "  Password: demo123"
echo ""
echo "  Logs: tail -f /tmp/app.log"
echo "  Stop: pkill -f 'tsx server/index.ts'"
