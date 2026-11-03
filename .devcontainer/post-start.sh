#!/usr/bin/env bash
# Concept2Cure Codespaces: report preparation, NEVER claim the app started.
# A development container may be available while its database or AI are blocked.
set -u

echo "C2C Codespace post-start: checking the explicitly configured database."
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "No DB or AI secret is printed. No database is provisioned or switched."

# Local PostgreSQL is opt-in only. Never rewrite pg_hba.conf to 'trust',
# create a DB, or fall back to localhost when Neon is unavailable.
if [[ "${C2C_DB_MODE:-configured}" == "local" ]]; then
  if [[ "${DATABASE_URL:-}" == *"@localhost"* || "${DATABASE_URL:-}" == *"@127.0.0.1"* ]]; then
    if command -v pg_lsclusters >/dev/null 2>&1 &&
       command -v pg_ctlcluster >/dev/null 2>&1; then
      PG_VER="$(pg_lsclusters -h 2>/dev/null | awk 'NR == 1 {print $1}')"
      PG_CLUSTER="$(pg_lsclusters -h 2>/dev/null | awk 'NR == 1 {print $2}')"
      if [[ -n "$PG_VER" && -n "$PG_CLUSTER" ]]; then
        sudo -n pg_ctlcluster "$PG_VER" "$PG_CLUSTER" start >/dev/null 2>&1 || true
      fi
    fi
  else
    echo "BLOCKED: local DB mode was selected without an explicit loopback DATABASE_URL."
  fi
fi

# A report of DB readiness is not proof of a running Express app. The doctor
# never tries an API billing call or changes model approval.
if node scripts/ops/codespaces-doctor.mjs; then
  echo "DB prerequisites verified. The platform has NOT been launched or browser-qualified."
  echo "Start with npm run dev; then run npm run codespaces:doctor -- --check-app."
else
  echo "BLOCKED: Codespace is open for repair, but Concept2Cure is NOT ready."
  echo "Read the diagnostic codes above and configure Neon/runtime secrets or schema."
  echo "Then run npm run codespaces:doctor again."
fi
# Keep the development editor open for remediation even when the application
# cannot start. This is NOT a success verdict for the application.
exit 0
