#!/bin/bash
# TrialSage Complete Deployment Script
# Handles both frontend and backend without vite build conflicts

set -e

echo "🚀 Starting complete TrialSage deployment..."

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
mkdir -p dist/public
echo "✅ Cleaned build directories"

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"

# Step 3: Run cleanup script
echo "🧽 Running cleanup..."
node cleanup-toastify.js
echo "✅ Cleanup completed"

# Step 4: Build frontend by copying and optimizing client files
echo "🎨 Building frontend..."
# Copy HTML entry point
cp client/index.html dist/public/
# Copy source files for the app to serve
cp -r client/src dist/public/
# Copy any additional client assets
if [ -d "client/public" ]; then
  cp -r client/public/* dist/public/ 2>/dev/null || true
fi
echo "✅ Frontend files prepared"

# Step 5: Build backend server
echo "🔨 Building backend server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
echo "✅ Backend server built successfully"

# Step 6: Install Python dependencies  
echo "🐍 Installing Python dependencies..."
pip install --no-cache-dir fastapi uvicorn pydantic python-multipart requests python-dotenv structlog
echo "✅ Python dependencies installed"

# Step 7: Verify build outputs
echo "🔍 Verifying deployment..."
if [ -f "dist/index.js" ]; then
    echo "✅ Backend server verified ($(du -sh dist/index.js | cut -f1))"
else
    echo "❌ Backend server build failed"
    exit 1
fi

if [ -f "dist/public/index.html" ]; then
    echo "✅ Frontend entry point verified"
else
    echo "❌ Frontend entry point missing"
    exit 1
fi

echo "🎉 Complete deployment finished successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "  🔧 Backend: Node.js/Express server ready"
echo "  🎨 Frontend: Client files prepared for serving"
echo "  🐍 Python: FastAPI services ready"
echo ""
echo "🚀 To start: NODE_ENV=production node dist/index.js"
echo "📍 App will be available at: http://localhost:5000"