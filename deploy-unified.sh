#!/bin/bash
# Unified Deployment Script - Handles both frontend structures
# Fixes the frontend/client directory mismatch

set -e

echo "🚀 Starting unified TrialSage deployment..."

# Step 1: Clean all build directories
echo "🧹 Cleaning build directories..."
rm -rf dist/
mkdir -p dist/public
echo "✅ Build directories ready"

# Step 2: Run cleanup
echo "🧽 Running cleanup script..."
node cleanup-toastify.js
echo "✅ Cleanup completed"

# Step 3: Use the main client/ directory (contains the real app)
echo "🎨 Building frontend from client/ directory..."
if [ -f "client/index.html" ]; then
    # Copy main HTML file
    cp client/index.html dist/public/index.html
    
    # Copy source files
    mkdir -p dist/public/src
    cp -r client/src/* dist/public/src/
    
    # Copy any public assets
    if [ -d "client/public" ]; then
        cp -r client/public/* dist/public/ 2>/dev/null || true
    fi
    
    echo "✅ Frontend built from client/ directory"
else
    echo "❌ client/index.html not found"
    exit 1
fi

# Step 4: Also ensure frontend/ compatibility
echo "🔄 Creating frontend/ compatibility..."
if [ ! -f "frontend/index.html" ]; then
    # Copy client index.html to frontend for deployment system compatibility
    cp client/index.html frontend/index.html
    echo "✅ Frontend compatibility created"
fi

# Step 5: Build backend server
echo "🔧 Building backend server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
echo "✅ Backend server built successfully"

# Step 6: Verify all build outputs
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

if [ -f "frontend/index.html" ]; then
    echo "✅ Deployment compatibility: frontend/index.html exists"
else
    echo "❌ Deployment compatibility missing"
    exit 1
fi

echo "🎉 Unified deployment completed successfully!"
echo "📋 Output:"
echo "  📁 Backend: dist/index.js"
echo "  📁 Frontend: dist/public/ (built from client/)"
echo "  ✅ Deployment compatibility: frontend/index.html"
echo ""
echo "🚀 Ready for deployment with both directory structures!"
