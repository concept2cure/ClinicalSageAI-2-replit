#!/bin/bash
# Concept2Cure.RI / Concept2Cure Platform Startup Script
# Run this after a codespace restart: bash start-platform.sh

set -e

echo "🚀 Starting Concept2Cure.RI Platform..."

# 1. Ensure PostgreSQL is running
echo "📦 Starting PostgreSQL..."
sudo service postgresql start 2>/dev/null || true
sleep 3

# 2. Verify DB is reachable
if pg_isready -h 127.0.0.1 -p 5432 -U postgres -q; then
  echo "✅ PostgreSQL is ready"
else
  echo "❌ PostgreSQL failed to start — check 'sudo service postgresql status'"
  exit 1
fi

# 3. Kill any existing server on port 5000
EXISTING=$(lsof -ti:5000 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  echo "⚠️  Killing existing process on port 5000: $EXISTING"
  kill -9 $EXISTING 2>/dev/null || true
  sleep 2
fi

# 4. Start the Express + Vite server
echo "🌐 Starting Express server on port 5000..."
cd /workspaces/Concept2Cure.RI-2-replit

# Use env-provided secrets if set; otherwise mint ephemeral ones per run.
# Never commit secrets — sessions issued under an ephemeral secret are
# invalidated on the next restart, which is the correct behavior for dev.
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=' | tr '/+' '_-')"
  echo "  ⚠️  JWT_SECRET unset — generated ephemeral secret for this run."
fi
if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=' | tr '/+' '_-')"
  echo "  ⚠️  SESSION_SECRET unset — generated ephemeral secret for this run."
fi
export JWT_SECRET SESSION_SECRET

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/concept2cure-ri?sslmode=disable" \
  SKIP_DB_STARTUP_TEST=true \
  NODE_ENV=development \
  PORT=5000 \
  JWT_SECRET="$JWT_SECRET" \
  SESSION_SECRET="$SESSION_SECRET" \
  nohup node_modules/.bin/tsx server/index.ts > /tmp/app.log 2>&1 &

SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# 5. Wait for server to come up
echo "⏳ Waiting for server to be ready..."
for i in $(seq 1 20); do
  if curl -s http://localhost:5000/api/cortex/health | grep -q healthy; then
    echo "✅ Server is ready!"
    break
  fi
  sleep 2
  if [ $i -eq 20 ]; then
    echo "❌ Server did not start in time. Check /tmp/app.log"
    exit 1
  fi
done

echo ""
echo "======================================"
echo "✅ Platform is UP!"
echo "   URL:      http://localhost:5000"
echo "   Login:    jm.smith@concept2cure.pro"
echo "   Password: demo123"
echo "   Logs:     tail -f /tmp/app.log"
echo "======================================"
