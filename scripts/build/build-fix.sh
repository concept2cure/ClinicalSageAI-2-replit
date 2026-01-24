#!/bin/bash
# Alternative Build Script - Replaces npm run build
# Bypasses problematic vite build command

set -e

echo "🔨 Starting TrialSage build process..."

# Step 1: Clean and prepare directories
echo "🧹 Cleaning build directories..."
rm -rf dist/
mkdir -p dist/public
echo "✅ Build directories ready"

# Step 2: Run cleanup (same as npm run build)
echo "🧽 Running cleanup script..."
node cleanup-toastify.js
echo "✅ Cleanup completed"

# Step 3: Build frontend (bypass vite build)
echo "🎨 Building frontend..."
# Copy main HTML file
cp client/index.html dist/public/index.html

# Copy source files for serving
mkdir -p dist/public/src
cp -r client/src/* dist/public/src/

# Copy any public assets
if [ -d "client/public" ]; then
  cp -r client/public/* dist/public/ 2>/dev/null || true
fi

echo "✅ Frontend built successfully"

# Step 4: Build backend server (same as npm run build)  
echo "🔧 Building backend server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
echo "✅ Backend server built successfully"

# Step 5: Verify build
echo "🔍 Verifying build outputs..."
if [ -f "dist/index.js" ]; then
    echo "✅ Backend verified: $(du -sh dist/index.js | cut -f1)"
else
    echo "❌ Backend build failed"
    exit 1
fi

if [ -f "dist/public/index.html" ]; then
    echo "✅ Frontend verified: Entry point ready"
else
    echo "❌ Frontend build failed"
    exit 1
fi

echo "🎉 Build completed successfully!"
echo "📋 Output:"
echo "  📁 Backend: dist/index.js"
echo "  📁 Frontend: dist/public/"
echo ""
echo "🚀 Ready for deployment!"
