#!/bin/bash
# Production Environment Deployment Script
# This script deploys the application to the production environment
# with extra safety checks and verification steps

set -e  # Exit on error

echo "Starting deployment to PRODUCTION environment at $(date)"

# Verify we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: Production deployment must be run from main branch"
  exit 1
fi

# Verify all tests pass
echo "Verifying tests..."
npm test

# Verify security audit
echo "Running security audit..."
npm audit --production

# ── The production boot contract ──────────────────────────────────────────────
# NODE_ENV=production puts the app under its fail-closed startup assertions: it
# EXITS at boot when any of these is missing, rather than serving degraded. This
# script used to export only DATABASE_URL and JWT_SECRET, so it produced a build
# and pushed a deploy that could not start — the failure surfaced on the target
# host, long after the script reported success.
#
# Each variable is checked here BEFORE the build, so a config gap fails in the
# operator's terminal with the missing name, not in a remote crash-loop. Sources:
#   RLS_ENFORCE              server/db/rlsEnforcement.ts — production accepts
#                            ONLY the literal `on`; aliases are rejected.
#   DATABASE_URL             server/startup/env.ts — owner role; migrations.
#   APP_DATABASE_URL         server/db/getDatabaseUrl.ts — the non-superuser
#                            app_service role. Under RLS_ENFORCE=on the boot
#                            posture probe (server/index.ts →
#                            assertRlsCatalogPosture) refuses a superuser or
#                            BYPASSRLS runtime role, so the owner URL is not a
#                            viable runtime connection.
#   JWT_SECRET               server/config/environment.ts (>=32 chars).
#   SESSION_SECRET           start.sh generates a throwaway when unset, which
#                            invalidates every session on restart.
#   REFRESH_TOKEN_SECRET     >=32 chars and must DIFFER from JWT_SECRET.
#   MFA_ENCRYPTION_KEY       server/config/environment.ts (>=32 chars).
#   AUDIT_HMAC_KEY           server/services/audit/auditSealPosture.ts.
#   AUDIT_HMAC_SECRET        server/lib/tamper-proof-audit.ts.
#   CONNECTOR_ENCRYPTION_KEY server/services/connectors/connector-registry.ts.
#
# Values come from the operator's environment / secret manager — never from this
# file. Each accepts a *_PROD-suffixed variable first (matching the existing
# DATABASE_URL_PROD / JWT_SECRET_PROD convention), then the unsuffixed name.
export NODE_ENV=production
export RLS_ENFORCE="${RLS_ENFORCE:-on}"

resolve_prod_env() {
  # $1 = target var name. Prefers <NAME>_PROD, falls back to <NAME>.
  local name="$1"
  local prod_name="${name}_PROD"
  local value="${!prod_name:-${!name:-}}"
  if [ -z "$value" ]; then
    echo "Error: $name is required for a production deploy (set $prod_name or $name)." >&2
    echo "       The server refuses to boot without it — see .env.example, 'THE PRODUCTION BOOT CONTRACT'." >&2
    return 1
  fi
  export "$name=$value"
}

MISSING_ENV=0
for REQUIRED_VAR in DATABASE_URL APP_DATABASE_URL JWT_SECRET SESSION_SECRET \
                    REFRESH_TOKEN_SECRET MFA_ENCRYPTION_KEY AUDIT_HMAC_KEY \
                    AUDIT_HMAC_SECRET CONNECTOR_ENCRYPTION_KEY; do
  resolve_prod_env "$REQUIRED_VAR" || MISSING_ENV=1
done

if [ "$RLS_ENFORCE" != "on" ]; then
  echo "Error: RLS_ENFORCE must be exactly 'on' for a production deploy; got '$RLS_ENFORCE'." >&2
  MISSING_ENV=1
fi

if [ "$REFRESH_TOKEN_SECRET" = "$JWT_SECRET" ]; then
  echo "Error: REFRESH_TOKEN_SECRET must differ from JWT_SECRET (the server refuses to boot otherwise)." >&2
  MISSING_ENV=1
fi

if [ "$MISSING_ENV" -ne 0 ]; then
  echo "Refusing to deploy with an incomplete production environment." >&2
  exit 1
fi

# Build the application
echo "Building application for production..."
npm run build

# Pre-migration database backup is intentionally NOT taken here.
# A pre-deploy database backup is the responsibility of the managed RDS
# automated snapshot (point-in-time recovery), taken outside the repo tree.
# This script must NEVER write a plaintext pg_dump into the working tree:
# doing so leaves an unencrypted full-database dump in .backups/ (not
# gitignored, never pruned) that can then be committed/pushed. If a manual
# pre-migration snapshot is wanted, trigger an RDS snapshot in AWS instead.

echo "Running database migrations..."
npm run db:push

# Create deployment tag
DEPLOY_TAG="prod-$(date +%Y%m%d-%H%M%S)"
git tag $DEPLOY_TAG
git push origin $DEPLOY_TAG

# Deploy to production environment
echo "Deploying to production environment..."
git push replit-prod main

echo "Production deployment completed successfully at $(date)"
echo "Deployment tag: $DEPLOY_TAG"
exit 0