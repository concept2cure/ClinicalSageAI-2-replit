#!/bin/bash
# Development Environment Deployment Script
# This script deploys the application to the development environment

set -e  # Exit on error

echo "Starting deployment to DEVELOPMENT environment at $(date)"

# Set environment variables
export NODE_ENV=development
export DATABASE_URL="$DATABASE_URL_DEV"
export JWT_SECRET="$JWT_SECRET_DEV"

# Build the application
echo "Building application..."
npm run build

# Run database migrations if needed
echo "Running database migrations..."
npm run db:push

# Deploy to dev environment
echo "Deploying to development environment..."
git push replit-dev main

echo "Development deployment completed successfully at $(date)"
exit 0