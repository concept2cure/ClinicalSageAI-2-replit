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

# Set environment variables
export NODE_ENV=production
export DATABASE_URL="$DATABASE_URL_PROD"
export JWT_SECRET="$JWT_SECRET_PROD"

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