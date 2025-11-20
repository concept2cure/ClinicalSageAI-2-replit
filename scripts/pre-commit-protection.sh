
#!/bin/bash

# Pre-commit Protection Hook
# Runs before each commit to verify file integrity

echo "🛡️  Running pre-commit protection checks..."

# Run AI agent protection check
node scripts/ai-agent-protection.js check

# Check for sensitive data
echo "🔍 Scanning for sensitive data..."
if grep -r -i --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
   -E "(password|api[_-]?key|secret|token)\s*[:=]\s*['\"][^'\"]{8,}" \
   client/ server/ 2>/dev/null; then
    echo "❌ Potential sensitive data found in commit!"
    echo "Please remove hardcoded secrets before committing."
    exit 1
fi

# Check file sizes
echo "🔍 Checking for large files..."
find . -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" | while read file; do
    size=$(wc -c < "$file")
    if [ $size -gt 100000 ]; then
        echo "⚠️  Large file detected: $file ($size bytes)"
        echo "Consider splitting large files for better maintainability."
    fi
done

# Verify critical files exist
critical_files=(
    "client/src/pages/CoAuthor.jsx"
    "server/index.ts"
    "package.json"
)

for file in "${critical_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Critical file missing: $file"
        exit 1
    fi
done

echo "✅ Pre-commit checks passed!"
