#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# C2C Codespace Post-Start Hook
# Runs each time the container starts
# ═══════════════════════════════════════════════════════════════════════════════
set -e

echo "🔄 C2C Codespace starting..."

# ─────────────────────────────────────────────────────────────────────────────
# 1. Start local PostgreSQL (if installed) and ensure database exists
# ─────────────────────────────────────────────────────────────────────────────
if command -v pg_lsclusters &>/dev/null; then
  PG_VER=$(pg_lsclusters -h 2>/dev/null | awk '{print $1; exit}')
  PG_CLUSTER=$(pg_lsclusters -h 2>/dev/null | awk '{print $2; exit}')

  if [ -n "$PG_VER" ] && [ -n "$PG_CLUSTER" ]; then
    echo "🗄️  Configuring PostgreSQL ${PG_VER}/${PG_CLUSTER}..."

    # Ensure trust auth for local dev (idempotent)
    PG_HBA="/etc/postgresql/${PG_VER}/${PG_CLUSTER}/pg_hba.conf"
    if [ -f "$PG_HBA" ]; then
      sudo -n sed -i 's/\bpeer$/trust/' "$PG_HBA" 2>/dev/null || true
      sudo -n sed -i 's/\bmd5$/trust/'  "$PG_HBA" 2>/dev/null || true
      sudo -n sed -i 's/\bscram-sha-256$/trust/' "$PG_HBA" 2>/dev/null || true
    fi

    # Start cluster if not running
    if ! pg_isready -h localhost -p 5432 -t 2 &>/dev/null; then
      echo "  Starting PostgreSQL..."
      sudo -n pg_ctlcluster "$PG_VER" "$PG_CLUSTER" start 2>/dev/null || true
      sleep 2
    else
      # Reload to pick up any pg_hba changes
      sudo -n pg_ctlcluster "$PG_VER" "$PG_CLUSTER" reload 2>/dev/null || true
    fi

    # Create database if missing
    if pg_isready -h localhost -p 5432 -t 5 &>/dev/null; then
      if ! psql -h localhost -U postgres -lqt 2>/dev/null | cut -d\| -f1 | grep -qw clinicalsage; then
        psql -h localhost -U postgres -c "CREATE DATABASE clinicalsage" 2>/dev/null || true
      fi
      # Enable vector extension if available
      psql -h localhost -U postgres -d clinicalsage -c "CREATE EXTENSION IF NOT EXISTS vector" 2>/dev/null || true

      # Set local DATABASE_URL fallback
      export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/clinicalsage?sslmode=disable}"
      echo "✅ Local PostgreSQL ready (clinicalsage database)"
    else
      echo "⚠️  PostgreSQL failed to start"
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 1b. Verify remote database connectivity (if DATABASE_URL points externally)
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -qv localhost; then
  echo "🗄️  Testing remote DB connection..."
  if pg_isready -d "$DATABASE_URL" -t 5 2>/dev/null; then
    echo "✅ Remote DB connection healthy"
  else
    echo "⚠️  Remote DB unreachable — falling back to local PostgreSQL"
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/clinicalsage?sslmode=disable"
  fi
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
