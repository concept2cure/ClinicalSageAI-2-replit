#!/bin/bash
# Staging Environment Deployment Script
# This script deploys the application to the staging environment

set -e  # Exit on error

echo "Starting deployment to STAGING environment at $(date)"

# Set environment variables
export NODE_ENV=staging
export DATABASE_URL="$DATABASE_URL_STAGING"
export JWT_SECRET="$JWT_SECRET_STAGING"

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