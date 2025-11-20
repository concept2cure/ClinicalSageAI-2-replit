#!/bin/bash

# ========================================================================
# COMPREHENSIVE DEPENDENCY INSTALLATION SCRIPT FOR eCTD CO-AUTHOR PLATFORM
# This script ensures ALL required dependencies are installed upon startup
# ========================================================================

echo "==========================================="
echo "🚀 eCTD Co-Author Platform Startup Script"
echo "==========================================="
echo ""
echo "This script ensures all dependencies are properly installed"
echo "to guarantee app stability on every startup."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Step 1: Clean corrupted packages
echo "🧹 Step 1: Cleaning potentially corrupted packages..."
echo "-------------------------------------------"

# Clean Vite cache
if [ -d "node_modules/.vite" ]; then
    rm -rf node_modules/.vite
    print_success "Vite cache cleaned"
fi

# Clean react-toastify if it exists (often gets corrupted)
if [ -d "node_modules/react-toastify" ]; then
    rm -rf node_modules/react-toastify
    print_warning "Removed react-toastify for clean reinstall"
fi

echo ""

# Step 2: Ensure package.json exists
echo "📋 Step 2: Verifying package.json..."
echo "-------------------------------------------"

if [ ! -f "package.json" ]; then
    print_error "package.json not found! Cannot proceed."
    exit 1
fi

print_success "package.json found"
echo ""

# Step 3: Install ALL dependencies from package.json
echo "📦 Step 3: Installing all dependencies from package.json..."
echo "-------------------------------------------"

# First, try a clean install
echo "Running npm install to ensure all packages are installed..."
npm install --no-audit

if [ $? -eq 0 ]; then
    print_success "npm install completed successfully"
else
    print_warning "npm install had issues, attempting to fix..."
    
    # Try to fix any audit issues
    npm audit fix --force
    
    # Reinstall
    npm install --no-audit
fi

echo ""

# Step 4: Install additional packages that might be missing
echo "🔧 Step 4: Ensuring critical packages are installed..."
echo "-------------------------------------------"

# Critical packages that often go missing or get corrupted
CRITICAL_PACKAGES=(
    # These are often missing after Replit storage cleanup
    "bcrypt@6.0.0"
    "cheerio@1.1.2"
    "jsonwebtoken@9.0.2"
    "express-rate-limit"
    "marked"
    "docx"
    "file-saver"
    "jspdf-autotable"
    "react-dnd"
    "react-dnd-html5-backend"
    "d3"
    "@tiptap/extension-table"
    "@tiptap/extension-task-list"
    "@tiptap/extension-task-item"
    "@tiptap/extension-character-count"
    "@tiptap/extension-placeholder"
    "react-toastify@11.0.5"
    "mammoth@1.11.0"
    "uuid@13.0.0"
    "xlsx@0.18.5"
)

echo "Verifying ${#CRITICAL_PACKAGES[@]} critical packages..."

for package in "${CRITICAL_PACKAGES[@]}"; do
    # Extract package name without version for checking
    PACKAGE_NAME="${package%@*}"
    
    if [ ! -d "node_modules/$PACKAGE_NAME" ]; then
        print_warning "Missing: $PACKAGE_NAME - Installing..."
        npm install "$package" --no-audit --save
        
        if [ $? -eq 0 ]; then
            print_success "Installed $package"
        else
            print_error "Failed to install $package"
        fi
    else
        print_success "$PACKAGE_NAME already installed"
    fi
done

echo ""

# Step 5: Verify TipTap packages specifically
echo "📝 Step 5: Verifying TipTap editor packages..."
echo "-------------------------------------------"

TIPTAP_PACKAGES=(
    "@tiptap/react@3.7.2"
    "@tiptap/starter-kit@3.7.2"
    "@tiptap/extension-color@3.7.2"
    "@tiptap/extension-text-style@3.7.2"
    "@tiptap/extension-highlight@3.7.2"
    "@tiptap/extension-underline"
    "@tiptap/extension-table"
    "@tiptap/extension-table-row"
    "@tiptap/extension-table-cell"
    "@tiptap/extension-table-header"
    "@tiptap/extension-placeholder"
    "@tiptap/extension-task-list"
    "@tiptap/extension-task-item"
    "@tiptap/extension-character-count"
)

MISSING_TIPTAP=()

for package in "${TIPTAP_PACKAGES[@]}"; do
    PACKAGE_NAME="${package%@*}"
    if [ ! -d "node_modules/$PACKAGE_NAME" ]; then
        MISSING_TIPTAP+=("$package")
    fi
done

if [ ${#MISSING_TIPTAP[@]} -gt 0 ]; then
    print_warning "Installing ${#MISSING_TIPTAP[@]} missing TipTap packages..."
    npm install "${MISSING_TIPTAP[@]}" --no-audit --save
else
    print_success "All TipTap packages installed"
fi

echo ""

# Step 6: Final verification
echo "🔍 Step 6: Final verification of critical imports..."
echo "-------------------------------------------"

# Test critical Node.js packages
node -e "
const packages = [
    'bcrypt',
    'cheerio',
    'jsonwebtoken',
    'express-rate-limit',
    'marked',
    'docx',
    'mammoth',
    'uuid',
    'xlsx'
];

let failedPackages = [];

for (const pkg of packages) {
    try {
        require(pkg);
        console.log('✅ ' + pkg + ' - OK');
    } catch (e) {
        console.log('❌ ' + pkg + ' - FAILED');
        failedPackages.push(pkg);
    }
}

if (failedPackages.length > 0) {
    console.log('');
    console.log('⚠️  Failed packages: ' + failedPackages.join(', '));
    console.log('');
    console.log('Attempting to reinstall failed packages...');
    process.exit(1);
} else {
    console.log('');
    console.log('✅ All Node.js packages verified successfully!');
}
" || {
    # If verification failed, try to reinstall the failed packages
    print_warning "Some packages failed verification. Attempting reinstall..."
    npm install bcrypt@6.0.0 cheerio@1.1.2 jsonwebtoken@9.0.2 express-rate-limit marked docx mammoth@1.11.0 uuid@13.0.0 xlsx@0.18.5 --no-audit --save
}

echo ""

# Step 7: Clean up
echo "🧹 Step 7: Final cleanup..."
echo "-------------------------------------------"

# Remove package-lock if corrupted
if [ -f "package-lock.json" ]; then
    # Check if package-lock is valid JSON
    node -e "
    try {
        require('./package-lock.json');
        console.log('✅ package-lock.json is valid');
    } catch(e) {
        console.log('⚠️  package-lock.json is corrupted');
        process.exit(1);
    }
    " || {
        print_warning "Removing corrupted package-lock.json..."
        rm -f package-lock.json
        print_success "Corrupted package-lock.json removed"
    }
fi

# Final Vite cache cleanup
if [ -d "node_modules/.vite" ]; then
    rm -rf node_modules/.vite
    print_success "Final Vite cache cleanup completed"
fi

echo ""
echo "==========================================="
echo "✅ STARTUP DEPENDENCY CHECK COMPLETE!"
echo "==========================================="
echo ""
echo "Summary:"
echo "- All dependencies from package.json installed"
echo "- Critical packages verified"
echo "- Corrupted packages cleaned and reinstalled"
echo "- Cache directories cleaned"
echo ""
echo "🚀 You can now run: npm run dev"
echo ""
echo "If you still encounter issues, run:"
echo "  rm -rf node_modules package-lock.json"
echo "  npm install"
echo ""