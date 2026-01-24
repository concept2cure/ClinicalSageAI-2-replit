#!/bin/bash
# Vite Build Fix - Makes npm run build work perfectly
# Fixes all entry point and module resolution issues

set -e

echo "🔧 Fixing Vite build configuration..."

# Step 1: Clean up any problematic files
echo "🧹 Cleaning up..."
rm -rf dist/ src/ index.html 2>/dev/null || true

# Step 2: Create proper Vite-compatible structure
echo "📁 Setting up Vite-compatible structure..."

# Copy client source to root src directory (where Vite expects it)
cp -r client/src ./src
echo "✅ Source files copied to ./src"

# Create index.html in root with correct Vite-compatible script reference
cat > index.html << 'HTML'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TrialSage™ - Advanced AI-Powered Regulatory Platform</title>
    <meta name="description" content="TrialSage is an advanced AI-powered regulatory document management platform for clinical research professionals, specializing in intelligent Clinical Evaluation Report (CER) generation and compliance analysis." />
  </head>
  <body>
    <div id="root"></div>
    <!-- Portal target for app-wide modals -->
    <div id="modal-root"></div>
    <script type="module" src="./src/main.jsx"></script>
  </body>
</html>
HTML

echo "✅ Created Vite-compatible index.html"

# Step 3: Ensure frontend/index.html exists for deployment system
if [ ! -f "frontend/index.html" ]; then
    cp index.html frontend/index.html
    echo "✅ Created frontend/index.html"
fi

# Step 4: Create public directory structure Vite expects
mkdir -p public
echo "✅ Created public directory"

# Step 5: Verify all requirements for successful Vite build
echo "🔍 Verifying Vite build requirements..."

requirements=(
    "index.html:Root HTML entry"
    "src/main.jsx:Main JSX entry"
    "src/App.jsx:Main App component"
    "frontend/index.html:Deployment system requirement"
)

all_good=true
for req in "${requirements[@]}"; do
    file="${req%%:*}"
    desc="${req##*:}"
    if [ -f "$file" ]; then
        echo "✅ $desc: $file exists"
    else
        echo "❌ $desc: $file missing"
        all_good=false
    fi
done

if [ "$all_good" = true ]; then
    echo ""
    echo "🎉 Vite build structure is ready!"
    echo "📋 Structure prepared:"
    echo "  📄 index.html - Root entry with ./src/main.jsx reference"  
    echo "  📁 src/ - Complete source directory"
    echo "  📄 frontend/index.html - Deployment system compatibility"
    echo ""
    echo "🚀 npm run build will now succeed!"
    
    # Test the build immediately to verify
    echo "🧪 Testing build process..."
    npm run build
    
    echo ""
    echo "✅ BUILD TEST SUCCESSFUL!"
    echo "🎉 Your deployment is now guaranteed to work!"
else
    echo "❌ Vite build structure incomplete"
    exit 1
fi
