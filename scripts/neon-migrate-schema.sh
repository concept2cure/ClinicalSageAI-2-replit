#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_PASSWORD:-}" || -z "${NEON_CONNECTION_STRING:-}" ]]; then
  echo "Missing required environment variables."
  echo "Set SUPABASE_URL, SUPABASE_PASSWORD, and NEON_CONNECTION_STRING before running."
  exit 1
fi

SCHEMA_FILE="${SCHEMA_FILE:-/tmp/supabase-schema.sql}"

pg_dump --schema-only --no-owner --no-acl \
  "postgresql://postgres:${SUPABASE_PASSWORD}@${SUPABASE_URL}:5432/postgres" \
  > "$SCHEMA_FILE"

sed -i '/^CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/d' "$SCHEMA_FILE"
sed -i '/^CREATE EXTENSION IF NOT EXISTS "pgjwt";/d' "$SCHEMA_FILE"
sed -i '/^CREATE EXTENSION IF NOT EXISTS "supabase_vault";/d' "$SCHEMA_FILE"
sed -i '/^CREATE POLICY/d' "$SCHEMA_FILE"
sed -i '/^ALTER POLICY/d' "$SCHEMA_FILE"
sed -i '/^CREATE PUBLICATION/d' "$SCHEMA_FILE"

psql "$NEON_CONNECTION_STRING" -f "$SCHEMA_FILE"
