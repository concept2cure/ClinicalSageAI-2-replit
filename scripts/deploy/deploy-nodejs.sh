#!/bin/bash
# TrialSage Node.js Deployment Script
# Handles deployment as a Node.js project (which it is) without uv conflicts

set -e

echo "🚀 Starting TrialSage Node.js deployment..."

# Step 1: Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install
echo "✅ Node.js dependencies installed"

# Step 2: Install essential Python dependencies for services (using pip, not uv)
echo "📦 Installing essential Python dependencies with pip..."
pip install --no-cache-dir fastapi uvicorn pydantic python-multipart requests python-dotenv
echo "✅ Essential Python dependencies installed"

# Step 3: Build the application
echo "🔨 Building application..."
# Vite build from root works with our config
npm run build
echo "✅ Application built successfully"

# Step 4: Verify deployment readiness
echo "🔍 Verifying deployment..."
if [ -f "dist/index.js" ]; then
    echo "✅ Build output verified"
else
    echo "❌ Build output missing"
    exit 1
fi

echo "🎉 Node.js deployment completed successfully!"
echo "📝 To start: npm run start"