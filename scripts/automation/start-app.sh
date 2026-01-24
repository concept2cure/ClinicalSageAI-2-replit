#!/bin/bash

# ========================================================================
# MAIN STARTUP SCRIPT FOR eCTD CO-AUTHOR PLATFORM
# This script ensures all dependencies are installed and then starts the app
# ========================================================================

echo ""
echo "============================================"
echo "🚀 eCTD Co-Author Platform Startup"
echo "============================================"
echo ""

# Step 1: Run dependency check
echo "📦 Checking and installing dependencies..."
echo ""

# Make sure the dependency script is executable
chmod +x startup-dependencies.sh

# Run the dependency installation script
./startup-dependencies.sh

# Check if dependency script succeeded
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Dependency installation failed!"
    echo "Please check the errors above and try again."
    exit 1
fi

# Step 2: Start the application
echo ""
echo "============================================"
echo "🚀 Starting the application..."
echo "============================================"
echo ""

# Run the dev server
npm run dev