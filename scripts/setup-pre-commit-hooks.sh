#!/bin/bash

# Setup Pre-Commit Hooks for TrialSage
echo "🔧 Setting up pre-commit hooks..."

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy our pre-commit hook
if [ -f ".git/hooks/pre-commit" ]; then
    echo "✅ Pre-commit hook already exists and is executable"
else
    echo "❌ Pre-commit hook not found. Please run this script from the project root."
    exit 1
fi

# Make sure it's executable
chmod +x .git/hooks/pre-commit

# Create pre-push hook to prevent pushing broken code
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash

# TrialSage Pre-Push Hook
# Additional checks before pushing to remote

echo "🚀 Running pre-push checks..."

# Check if main server file can start without errors
if [ -f "server/index.ts" ]; then
    echo "🔍 Checking server startup..."
    if ! timeout 10s node --check server/index.ts; then
        echo "❌ Server index.ts has syntax errors"
        exit 1
    fi
fi

# Check if client builds successfully (if package.json exists)
if [ -f "client/package.json" ]; then
    echo "🔍 Checking client build..."
    cd client
    if ! npm run build --if-present > /dev/null 2>&1; then
        echo "❌ Client build failed"
        exit 1
    fi
    cd ..
fi

# Run tests if they exist
if [ -f "package.json" ] && grep -q '"test"' package.json; then
    echo "🧪 Running tests..."
    if ! npm test -- --passWithNoTests > /dev/null 2>&1; then
        echo "❌ Tests failed"
        exit 1
    fi
fi

echo "✅ Pre-push checks passed!"
EOF

chmod +x .git/hooks/pre-push

# Create commit-msg hook for commit message validation
cat > .git/hooks/commit-msg << 'EOF'
#!/bin/bash

# TrialSage Commit Message Hook
# Validates commit message format

commit_regex='^(feat|fix|docs|style|refactor|test|chore|security)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ Invalid commit message format!"
    echo "Format: type(scope): description"
    echo "Types: feat, fix, docs, style, refactor, test, chore, security"
    echo "Example: feat(cer): add device profile validation"
    exit 1
fi

# Check for minimum description length
if [ $(head -n1 "$1" | wc -c) -lt 10 ]; then
    echo "❌ Commit message too short (minimum 10 characters)"
    exit 1
fi

echo "✅ Commit message format valid"
EOF

chmod +x .git/hooks/commit-msg

echo "✅ Pre-commit hooks setup complete!"
echo ""
echo "Hooks installed:"
echo "  📝 pre-commit: Prevents redundant files and broken code"
echo "  🚀 pre-push: Additional checks before pushing"
echo "  💬 commit-msg: Validates commit message format"
echo ""
echo "To test the pre-commit hook:"
echo "  git add <some-file> && git commit -m 'test: verify pre-commit hook'"