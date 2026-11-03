#!/usr/bin/env bash
# Codespace creation: install dependencies reproducibly and disclose blockers.
# No secrets, database mutations, automatic credential replacement, or
# 'app ready' claim. The Codespace editor can be open while C2C is blocked.
set -Eeuo pipefail

echo "C2C Codespace dependency setup (Node.js 22)"
node -e "if (Number(process.versions.node.split('.')[0]) !== 22) { console.error('Node.js 22 is required'); process.exit(1) }"
test -f package-lock.json || { echo "BLOCKED: package-lock.json is missing"; exit 1; }

# Match CI: fail rather than allowing a partially installed npm tree to look
# complete. Do not delete/change the lockfile to hide an install error.
npm ci
test -d node_modules || { echo "BLOCKED: node_modules missing after npm ci"; exit 1; }

# Local PostgreSQL is an EXPLICIT development option. For Neon users the
# database lives remotely; compiling pgvector locally does not fix Neon.
if [[ "${C2C_DB_MODE:-configured}" == "local" ]]; then
  if ! command -v pg_isready >/dev/null 2>&1; then
    echo "BLOCKED: local PostgreSQL not installed. Use the documented local database setup."
    exit 1
  fi
fi

# Native self-tests do not use a credential or a database. A failed control
# is a setup failure, not an optional warning.
node --test scripts/ops/codespaces-doctor.test.mjs

echo "Dependencies installed and Codespaces diagnostics self-tested."
echo "Neon connections, schema, OpenAI billing and the running app are NOT assumed ready."
echo "Post-start will report database readiness without switching any DB."
