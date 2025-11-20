#!/bin/bash

# Comprehensive Toast Cleanup Script
# This script provides a complete solution for removing problematic toast dependencies
# It runs automatically before the application starts

echo "🧹 Running toast dependency cleanup..."

# 1. Remove physical dependency from node_modules
if [ -d "node_modules/react-toastify" ]; then
  echo "Found react-toastify in node_modules, removing..."
  rm -rf node_modules/react-toastify
else
  echo "✅ react-toastify not found in node_modules (good!)"
fi

# 2. Clear Vite cache to prevent optimization errors
if [ -d "node_modules/.vite" ]; then
  echo "Clearing Vite cache..."
  rm -rf node_modules/.vite
fi

# 3. Apply optional patches to package.json to mark the dependency as removed
if grep -q "react-toastify" package.json; then
  echo "Found toast references in package.json, fixing..."
  # Use sed to comment out the dependency 
  sed -i 's/"react-toastify": ".*"/"\/* react-toastify disabled for stability *\/"/' package.json
fi

echo "✅ Toast dependency cleanup complete!"