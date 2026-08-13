#!/bin/bash
# Staging Environment Deployment Script
# This script deploys the application to the staging environment

set -e  # Exit on error

echo "Starting deployment to STAGING environment at $(date)"

# Set environment variables
#
# NODE_ENV=staging is NOT the same fail-closed contract as production (the RLS,
# MFA-key and audit-seal boot assertions are production-only), but staging DOES
# require a dedicated REFRESH_TOKEN_SECRET: server/config/environment.ts refuses
# to boot in staging when it is missing, shorter than 32 chars, or equal to
# JWT_SECRET. That was omitted here, so the deploy pushed a build that could not
# start. Checked before the build so the failure names the variable.
export NODE_ENV=staging
export DATABASE_URL="$DATABASE_URL_STAGING"
export JWT_SECRET="$JWT_SECRET_STAGING"
export REFRESH_TOKEN_SECRET="${REFRESH_TOKEN_SECRET_STAGING:-$REFRESH_TOKEN_SECRET}"

for REQUIRED_VAR in DATABASE_URL JWT_SECRET REFRESH_TOKEN_SECRET; do
  if [ -z "${!REQUIRED_VAR}" ]; then
    echo "Error: $REQUIRED_VAR is required for a staging deploy (set ${REQUIRED_VAR}_STAGING or $REQUIRED_VAR)." >&2
    exit 1
  fi
done

if [ "$REFRESH_TOKEN_SECRET" = "$JWT_SECRET" ]; then
  echo "Error: REFRESH_TOKEN_SECRET must differ from JWT_SECRET (the server refuses to boot otherwise)." >&2
  exit 1
fi

# Build the application
echo "Building application..."
npm run build

# Run database migrations if needed
echo "Running database migrations..."
npm run db:push

# Deploy to staging environment
echo "Deploying to staging environment..."
git push replit-staging main

echo "Staging deployment completed successfully at $(date)"
exit 0