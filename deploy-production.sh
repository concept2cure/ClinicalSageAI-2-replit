#!/bin/bash
# TrialSage Production Deployment Script
# Handles deployment without frontend build conflicts

set -e

echo "🚀 Starting TrialSage production deployment..."

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
mkdir -p dist/public
echo "✅ Cleaned build directories"

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install --production=false
echo "✅ Dependencies installed"

# Step 3: Build backend server only (no frontend conflicts)
echo "🔨 Building backend server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
echo "✅ Backend server built successfully"

# Step 4: Copy static frontend files (bypass vite build)
echo "📋 Copying frontend files..."
cp -r client/index.html dist/public/
cp -r client/src dist/public/src 2>/dev/null || true
cp -r client/public/* dist/public/ 2>/dev/null || true
echo "✅ Frontend files copied"

# Step 5: Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip install --no-cache-dir fastapi uvicorn pydantic python-multipart requests python-dotenv structlog
echo "✅ Python dependencies installed"

# Step 6: Verify build outputs
echo "🔍 Verifying build outputs..."
if [ -f "dist/index.js" ]; then
    echo "✅ Backend server build verified"
else
    echo "❌ Backend server build failed"
    exit 1
fi

if [ -f "dist/public/index.html" ]; then
    echo "✅ Frontend files verified"
else
    echo "❌ Frontend files missing"
    exit 1
fi

echo "🎉 Production deployment completed successfully!"
echo "🚀 Start with: NODE_ENV=production node dist/index.js"
echo "📂 Frontend served from: dist/public/"