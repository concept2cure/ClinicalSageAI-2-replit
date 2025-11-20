#!/bin/bash

# TrialSage Component Verification Script
# Performs basic syntax checks on JavaScript/React components

echo "🔍 TrialSage Component Verification Tool"
echo "========================================"

# Common error patterns to check for
SYNTAX_ERRORS=(
  "const.*const.*="  # Duplicate const declarations
  "import.*import.*from.*from"  # Duplicate imports
  "function.*function.*\("  # Duplicate function declarations
  "undefined is not"  # Common runtime error pattern
  "Cannot read property"  # Common runtime error pattern
)

# Critical component directories
CRITICAL_DIRS=(
  "client/src/components/cer"
  "client/src/services"
  "server/routes"
)

ERROR_COUNT=0
WARNING_COUNT=0

# Check for basic syntax issues
check_syntax() {
  local file="$1"
  local component_name=$(basename "$file")
  
  echo -e "\n📄 Checking $component_name..."
  
  # Check for syntax errors with node
  node --check "$file" &>/dev/null
  if [ $? -ne 0 ]; then
    echo "❌ SYNTAX ERROR: $component_name has JavaScript syntax errors"
    node --check "$file"
    ERROR_COUNT=$((ERROR_COUNT + 1))
    return 1
  fi
  
  # Check for common error patterns
  for pattern in "${SYNTAX_ERRORS[@]}"; do
    matches=$(grep -E "$pattern" "$file" | wc -l)
    if [ $matches -gt 0 ]; then
      echo "⚠️ WARNING: Potential issue in $component_name - pattern '$pattern' found"
      grep -n -E "$pattern" "$file"
      WARNING_COUNT=$((WARNING_COUNT + 1))
    fi
  done
  
  # Check for incomplete functions (missing closing brackets)
  open_brackets=$(grep -o "{" "$file" | wc -l)
  close_brackets=$(grep -o "}" "$file" | wc -l)
  if [ $open_brackets -ne $close_brackets ]; then
    echo "⚠️ WARNING: $component_name has unbalanced brackets: $open_brackets opens vs $close_brackets closes"
    WARNING_COUNT=$((WARNING_COUNT + 1))
  fi
  
  # Check for duplicate function/const declarations
  local duplicates=$(grep -E "^[[:space:]]*(function|const|let|var)" "$file" | sort | uniq -d)
  if [ ! -z "$duplicates" ]; then
    echo "⚠️ WARNING: Possible duplicate declarations in $component_name:"
    echo "$duplicates"
    WARNING_COUNT=$((WARNING_COUNT + 1))
  fi
  
  echo "✅ Basic syntax check passed for $component_name"
  return 0
}

# Main verification loop
echo "Starting verification of critical components..."

for dir in "${CRITICAL_DIRS[@]}"; do
  echo -e "\n📁 Checking directory: $dir"
  
  # Find all JS/JSX files
  files=$(find "$dir" -type f -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx")
  
  for file in $files; do
    check_syntax "$file"
  done
done

# Summary
echo -e "\n📊 Verification Summary"
echo "======================="
echo "Total Errors: $ERROR_COUNT"
echo "Total Warnings: $WARNING_COUNT"

if [ $ERROR_COUNT -gt 0 ]; then
  echo -e "\n❌ Verification FAILED: $ERROR_COUNT errors found"
  exit 1
else
  if [ $WARNING_COUNT -gt 0 ]; then
    echo -e "\n⚠️ Verification PASSED WITH WARNINGS: $WARNING_COUNT warnings found"
    exit 0
  else
    echo -e "\n✅ Verification PASSED: No issues found"
    exit 0
  fi
fi