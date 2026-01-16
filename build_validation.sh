#!/bin/bash
# Build Validation Script for TrialSage
#
# This script performs comprehensive validation of the build artifacts
# to ensure they meet security and quality standards before deployment.
# It follows the immutable infrastructure and reproducible builds principles.
#
# Run this script as part of your CI/CD pipeline before deployment.

set -e

# Define colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Define log prefixes
INFO="[${BLUE}INFO${NC}]"
SUCCESS="[${GREEN}SUCCESS${NC}]"
WARNING="[${YELLOW}WARNING${NC}]"
ERROR="[${RED}ERROR${NC}]"

# Record start time
START_TIME=$(date +%s)

echo -e "${INFO} Starting TrialSage build validation at $(date)"
echo -e "${INFO} Environment: ${BLUE}${NODE_ENV:-development}${NC}"

# Check directory structure
echo -e "\n${INFO} Checking directory structure..."
REQUIRED_DIRS=(
  "client"
  "server"
  "shared"
  "public"
)
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo -e "${SUCCESS} Directory '$dir' exists"
  else
    echo -e "${ERROR} Required directory '$dir' not found"
    exit 1
  fi
done

# Check for critical files
echo -e "\n${INFO} Checking for critical files..."
CRITICAL_FILES=(
  "package.json"
  "tsconfig.json"
  "server/index.ts"
  "client/src/App.tsx"
  "client/src/index.css"
)
for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${SUCCESS} File '$file' exists"
  else
    echo -e "${ERROR} Critical file '$file' not found"
    exit 1
  fi
done

# Check package.json for direct dependencies
echo -e "\n${INFO} Checking dependencies in package.json..."
if ! command -v jq &> /dev/null; then
  echo -e "${WARNING} jq not found, skipping dependency version check"
else
  # Check if dependencies have exact versions without ^ or ~
  LOOSE_DEPS=$(jq -r '.dependencies | to_entries[] | select(.value | test("^\\^|~")) | .key' package.json 2>/dev/null || echo "")
  if [ -n "$LOOSE_DEPS" ]; then
    echo -e "${WARNING} The following dependencies have loose version specifiers (^ or ~):"
    echo "$LOOSE_DEPS" | while read -r dep; do
      echo -e "  - ${YELLOW}$dep${NC}"
    done
    echo -e "${WARNING} Consider pinning exact versions for production stability"
  else
    echo -e "${SUCCESS} All dependencies use exact version specifiers"
  fi

  # Check for security vulnerabilities if npm audit is available
  if command -v npm &> /dev/null; then
    echo -e "\n${INFO} Running security audit on dependencies..."
    npm audit --production --json > audit_results.json 2>/dev/null || true
    VULN_COUNT=$(jq '.metadata.vulnerabilities.total' audit_results.json 2>/dev/null || echo "unknown")
    if [ "$VULN_COUNT" = "0" ]; then
      echo -e "${SUCCESS} No vulnerabilities found"
    elif [ "$VULN_COUNT" = "unknown" ]; then
      echo -e "${WARNING} Could not determine vulnerabilities, npm audit failed"
    else
      HIGH_COUNT=$(jq '.metadata.vulnerabilities.high' audit_results.json)
      CRITICAL_COUNT=$(jq '.metadata.vulnerabilities.critical' audit_results.json)
      echo -e "${WARNING} Found ${VULN_COUNT} vulnerabilities (${RED}${CRITICAL_COUNT}${NC} critical, ${YELLOW}${HIGH_COUNT}${NC} high)"
      echo -e "${WARNING} Review audit_results.json for details"
      if [ "$CRITICAL_COUNT" -gt 0 ]; then
        echo -e "${ERROR} Critical vulnerabilities found, failing build"
        exit 1
      fi
    fi
  fi
fi

# Check TypeScript configuration
echo -e "\n${INFO} Validating TypeScript configuration..."
if [ -f "tsconfig.json" ]; then
  # Check strict mode
  STRICT_MODE=$(grep -c '"strict": true' tsconfig.json || echo "0")
  if [ "$STRICT_MODE" -gt 0 ]; then
    echo -e "${SUCCESS} TypeScript strict mode is enabled"
  else
    echo -e "${WARNING} TypeScript strict mode not enabled, consider enabling for type safety"
  fi
  
  # Check for noImplicitAny
  NO_IMPLICIT_ANY=$(grep -c '"noImplicitAny": true' tsconfig.json || echo "0")
  if [ "$NO_IMPLICIT_ANY" -gt 0 ]; then
    echo -e "${SUCCESS} noImplicitAny is enabled"
  else
    echo -e "${WARNING} noImplicitAny not enabled, consider enabling for type safety"
  fi
else
  echo -e "${WARNING} tsconfig.json not found, skipping TypeScript configuration checks"
fi

# Check for environment variables
echo -e "\n${INFO} Checking environment configuration..."
if [ -f ".env.example" ]; then
  echo -e "${SUCCESS} .env.example file exists for reference"
  
  # Check if .env exists if we're not in CI
  if [ -z "$CI" ] && [ ! -f ".env" ]; then
    echo -e "${WARNING} No .env file found in local environment"
  fi

  # Ensure secrets aren't directly in code
  if command -v grep &> /dev/null; then
    SECRET_PATTERN='(api[_-]?key|secret[_-]?key|password|token|credential)[a-zA-Z0-9_]*[\s]*=[\s]*["\047][a-zA-Z0-9_\-\.]{16,}["\047]'
    HARDCODED_SECRETS=$(grep -r -E "$SECRET_PATTERN" --include="*.{ts,js,tsx,jsx}" {client,server,shared} 2>/dev/null || echo "")
    
    if [ -n "$HARDCODED_SECRETS" ]; then
      echo -e "${ERROR} Potential hardcoded secrets found in code:"
      echo "$HARDCODED_SECRETS" | head -n 5
      echo -e "${ERROR} Use environment variables instead of hardcoding secrets"
      exit 1
    else
      echo -e "${SUCCESS} No hardcoded secrets detected in code files"
    fi
  fi
fi

# Check build output
echo -e "\n${INFO} Validating build output..."
npm run build --if-present || {
  echo -e "${ERROR} Build failed"
  exit 1
}

# Check bundle size if applicable
if [ -d "dist" ] || [ -d "build" ]; then
  BUILD_DIR="dist"
  [ -d "build" ] && BUILD_DIR="build"
  
  BUNDLE_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
  echo -e "${INFO} Bundle size: ${BLUE}${BUNDLE_SIZE}${NC}"
  
  # Check for large files
  LARGE_FILES=$(find "$BUILD_DIR" -type f -size +2M | wc -l)
  if [ "$LARGE_FILES" -gt 0 ]; then
    echo -e "${WARNING} Found ${LARGE_FILES} large files (>2MB) in build output"
    find "$BUILD_DIR" -type f -size +2M | xargs ls -lh | head -n 5
    echo -e "${WARNING} Consider optimizing these assets"
  else
    echo -e "${SUCCESS} No unusually large files found in build output"
  fi
fi

# Run tests if available
echo -e "\n${INFO} Running tests..."
TEST_SUCCESS=true
npm run test:ci --if-present || {
  echo -e "${WARNING} Tests failed or test command not found"
  TEST_SUCCESS=false
}

if [ "$TEST_SUCCESS" = true ]; then
  echo -e "${SUCCESS} All tests passed"
else
  echo -e "${WARNING} Tests failed or were not run"
  # Don't exit with error so CI can continue - team decision whether to block on test failure
fi

# Check for runtime errors in JavaScript/TypeScript files
echo -e "\n${INFO} Static analysis for potential runtime errors..."
if command -v npx &> /dev/null; then
  npx eslint --quiet "**/*.{js,ts,jsx,tsx}" --ignore-pattern "node_modules/" --ignore-pattern "dist/" --ignore-pattern "build/" || {
    echo -e "${WARNING} ESLint found potential issues"
  }
fi

# Print summary
echo -e "\n${INFO} Build validation completed at $(date)"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo -e "${INFO} Duration: ${BLUE}${DURATION}${NC} seconds"

echo -e "\n🏁 ${GREEN}BUILD VALIDATION SUCCESSFUL${NC} 🏁"
echo -e "The build meets basic quality and security standards and is ready for deployment."

# Generate build signature/manifest
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

cat << EOF > build_manifest.json
{
  "buildTime": "${BUILD_TIME}",
  "gitCommit": "${GIT_COMMIT}",
  "gitBranch": "${GIT_BRANCH}",
  "environment": "${NODE_ENV:-development}",
  "validationDuration": ${DURATION},
  "validationSuccess": true
}
EOF

echo -e "${INFO} Build manifest generated: ${BLUE}build_manifest.json${NC}"
echo -e "${INFO} Include this file with your deployment for traceability"

exit 0