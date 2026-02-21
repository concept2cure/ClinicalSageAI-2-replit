#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# C2C Codespace Post-Start Hook
# Runs each time the container starts
# ═══════════════════════════════════════════════════════════════════════════════
set -e

echo "🔄 C2C Codespace starting..."

# ─────────────────────────────────────────────────────────────────────────────
# 1. Verify database connectivity
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  echo "🗄️  Testing Neon DB connection..."
  if pg_isready -d "$DATABASE_URL" -t 5 2>/dev/null; then
    echo "✅ Neon DB connection healthy"
  else
    echo "⚠️  Neon DB unreachable — check DATABASE_URL or network"
  fi
else
  echo "⚠️  DATABASE_URL not set — skipping DB check"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Add agent CLI to PATH
# ─────────────────────────────────────────────────────────────────────────────
AGENT_BIN="$(pwd)/.github/agents/commands"
if [ -d "$AGENT_BIN" ] && [[ ":$PATH:" != *":$AGENT_BIN:"* ]]; then
  export PATH="$AGENT_BIN:$PATH"
  echo "✅ c2c-agent CLI available on PATH"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Show agent status
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  🧬 Concept2Cure Codespace Ready"
echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo "  Agent:  c2c-regulatory-agent v1.0.0"
echo "  Mode:   ${C2C_AGENT_MODE:-inactive}"
echo "═══════════════════════════════════════════"
echo ""
echo "  Run 'c2c-agent help' for available commands"
echo ""
