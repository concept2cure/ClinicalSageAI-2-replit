#!/bin/bash
# TrialSage Backend-Only Deployment Script
# Deploys the working backend without frontend build issues

set -e

echo "🚀 Starting TrialSage backend deployment..."

# Step 1: Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install
echo "✅ Node.js dependencies installed"

# Step 2: Install essential Python dependencies  
echo "📦 Installing essential Python dependencies..."
pip install --no-cache-dir fastapi uvicorn pydantic python-multipart requests python-dotenv structlog
echo "✅ Essential Python dependencies installed"

# Step 3: Build only the backend server
echo "🔨 Building backend server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
echo "✅ Backend server built successfully"

# Step 4: Verify deployment readiness
echo "🔍 Verifying deployment..."
if [ -f "dist/index.js" ]; then
    echo "✅ Backend build output verified"
else
    echo "❌ Backend build output missing"
    exit 1
fi

echo "🎉 Backend deployment completed successfully!"
echo "📝 Backend API ready - frontend served from existing client files"
echo "🚀 To start: NODE_ENV=production node dist/index.js"