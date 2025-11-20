#!/bin/bash
# Pre-deployment Setup - Makes existing npm run build work
# Creates proper file structure for Vite to find entry points

set -e

echo "🔧 Preparing deployment structure..."

# Step 1: Ensure frontend/index.html exists and is properly configured
echo "📋 Setting up frontend entry point..."
if [ ! -f "frontend/index.html" ]; then
    cp client/index.html frontend/index.html
    echo "✅ Created frontend/index.html from client/"
fi

# Step 2: Create a working index.html in project root for Vite
echo "📋 Setting up root entry point..."
cp client/index.html index.html
echo "✅ Created root index.html"

# Step 3: Ensure all source files are accessible
echo "📋 Ensuring source accessibility..."
# Create symlinks so Vite can find the source files
if [ ! -d "src" ]; then
    ln -sf client/src src
    echo "✅ Created src symlink to client/src"
fi

# Step 4: Copy any missing files to where Vite expects them
echo "📋 Setting up Vite compatibility..."
# Copy client files to root if needed
if [ -f "client/package.json" ]; then
    # Don't overwrite main package.json, but ensure frontend has what it needs
    echo "✅ Frontend package.json preserved"
fi

# Step 5: Verify deployment readiness
echo "🔍 Verifying deployment structure..."
files_needed=("index.html" "frontend/index.html" "src")
all_good=true

for file in "${files_needed[@]}"; do
    if [ -e "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        all_good=false
    fi
done

if [ "$all_good" = true ]; then
    echo "🎉 Deployment structure ready!"
    echo "📋 Files prepared:"
    echo "  📁 index.html (root) - for Vite build"
    echo "  📁 frontend/index.html - for deployment system"
    echo "  📁 src/ - linked to client/src"
    echo ""
    echo "🚀 Now run: npm run build"
else
    echo "❌ Deployment structure incomplete"
    exit 1
fi
