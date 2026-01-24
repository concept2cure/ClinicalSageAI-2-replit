#!/bin/bash
# TrialSage Deployment Script
# This script resolves the deployment conflicts by properly handling both Python and Node.js dependencies

set -e  # Exit on any error

echo "🚀 Starting TrialSage deployment..."

# Step 1: Install Python dependencies (resolving conflicts)
echo "📦 Installing Python dependencies..."
if [ -f "server/services/python/requirements.txt" ]; then
    pip install --no-cache-dir -r server/services/python/requirements.txt
    echo "✅ Python dependencies installed successfully"
else
    echo "❌ Python requirements.txt not found"
    exit 1
fi

# Step 2: Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm ci --production=false
echo "✅ Node.js dependencies installed successfully"

# Step 3: Build the application
echo "🔨 Building application..."
npm run build
echo "✅ Application built successfully"

# Step 4: Verify deployment readiness
echo "🔍 Verifying deployment readiness..."
if [ -d "dist" ]; then
    echo "✅ Build directory exists"
else
    echo "❌ Build directory missing"
    exit 1
fi

if [ -f "dist/index.js" ]; then
    echo "✅ Main application file exists"
else
    echo "❌ Main application file missing"
    exit 1
fi

echo "🎉 Deployment preparation completed successfully!"
echo "📝 To start the application: npm run start"