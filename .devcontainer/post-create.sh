#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# C2C Codespace Post-Create Setup
# Runs once when the container is first created
# ═══════════════════════════════════════════════════════════════════════════════
set -e

echo "🚀 C2C Codespace Post-Create Setup..."

# ─────────────────────────────────────────────────────────────────────────────
# 0. Install PostgreSQL server + pgvector (permanent for this container)
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v pg_lsclusters &>/dev/null; then
  echo "🗄️  Installing PostgreSQL 15 server..."
  sudo -n apt-get update -y && sudo -n apt-get install -y postgresql-15 postgresql-server-dev-15 2>/dev/null || true
fi

# Install pgvector from source if not already present
if [ ! -f /usr/share/postgresql/15/extension/vector.control ] 2>/dev/null; then
  echo "🧩 Installing pgvector extension..."
  sudo -n apt-get install -y postgresql-server-dev-15 2>/dev/null || true
  (cd /tmp && rm -rf pgvector && git clone --branch v0.7.0 --depth 1 https://github.com/pgvector/pgvector.git && cd pgvector && make -j"$(nproc)" && sudo -n make install && rm -rf /tmp/pgvector) || echo "⚠️  pgvector build failed (non-fatal)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 1. Install Node dependencies
# ─────────────────────────────────────────────────────────────────────────────
echo "📦 Installing Node.js dependencies..."
npm install --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
# 2. Install Python agent dependencies
# ─────────────────────────────────────────────────────────────────────────────
echo "🐍 Installing Python agent dependencies..."
if command -v pip &> /dev/null; then
  pip install --quiet pyyaml requests psycopg2-binary openai boto3 pytest 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Install Neon CLI (if not present)
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v neonctl &> /dev/null; then
  echo "📡 Installing Neon CLI..."
  npm install -g neonctl 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Make agent CLI executable
# ─────────────────────────────────────────────────────────────────────────────
if [ -f ".github/agents/commands/c2c-agent" ]; then
  chmod +x .github/agents/commands/c2c-agent
  echo "✅ c2c-agent CLI made executable"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Verify critical environment variables
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══ Environment Verification ═══"
[ -n "$DATABASE_URL" ] && echo "✅ DATABASE_URL set" || echo "⚠️  DATABASE_URL not set"
[ -n "$OPENAI_API_KEY" ] && echo "✅ OPENAI_API_KEY set" || echo "⚠️  OPENAI_API_KEY not set"
[ -n "$NEON_PROJECT_ID" ] && echo "✅ NEON_PROJECT_ID: $NEON_PROJECT_ID" || echo "⚠️  NEON_PROJECT_ID not set"

echo ""
echo "✅ C2C Codespace post-create setup complete"
