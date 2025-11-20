#!/bin/bash
set -e

echo "🚀 Building Node.js application..."
echo "Installing dependencies..."
npm ci

echo "Building application..."
npm run build

echo "✅ Build completed successfully!"