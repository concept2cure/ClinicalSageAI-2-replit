#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${NEON_CONNECTION_STRING:-}" ]]; then
  echo "Missing NEON_CONNECTION_STRING environment variable."
  exit 1
fi

psql "$NEON_CONNECTION_STRING" -c "SELECT 1"
