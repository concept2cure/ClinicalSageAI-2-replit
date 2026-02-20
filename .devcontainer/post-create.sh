#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# C2C Codespace Post-Create Setup
# Runs once when the container is first created
# ═══════════════════════════════════════════════════════════════════════════════
set -e

echo "🚀 C2C Codespace Post-Create Setup..."

# ─────────────────────────────────────────────────────────────────────────────
# 1. Install Node dependencies
# ─────────────────────────────────────────────────────────────────────────────
echo "📦 Installing Node.js dependencies..."
npm install

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
