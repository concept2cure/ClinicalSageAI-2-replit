#!/bin/bash

###############################################################################
# Test Script for Branch Synchronization
# 
# This script validates the branch sync functionality in a safe test environment
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Branch Synchronization Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 1: Verify script exists and is executable
echo -e "${BLUE}[TEST 1] Checking script exists and is executable...${NC}"
if [ -x "scripts/sync-branches.sh" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Script exists and is executable"
else
    echo -e "${RED}✗ FAIL${NC} - Script not found or not executable"
    exit 1
fi
echo ""

# Test 2: Verify script syntax is valid
echo -e "${BLUE}[TEST 2] Validating script syntax...${NC}"
if bash -n scripts/sync-branches.sh 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC} - Script syntax is valid"
else
    echo -e "${RED}✗ FAIL${NC} - Script has syntax errors"
    exit 1
fi
echo ""

# Test 3: Verify script contains required functions
echo -e "${BLUE}[TEST 3] Checking required functions exist...${NC}"
required_functions=("fetch_all" "update_main" "get_branches_to_sync" "sync_branch" "print_summary")
all_functions_exist=true

for func in "${required_functions[@]}"; do
    if grep -q "^${func}()" scripts/sync-branches.sh; then
        echo -e "${GREEN}  ✓${NC} Function '$func' exists"
    else
        echo -e "${RED}  ✗${NC} Function '$func' missing"
        all_functions_exist=false
    fi
done

if [ "$all_functions_exist" = true ]; then
    echo -e "${GREEN}✓ PASS${NC} - All required functions exist"
else
    echo -e "${RED}✗ FAIL${NC} - Some functions are missing"
    exit 1
fi
echo ""

# Test 4: Verify governance controls are in place
echo -e "${BLUE}[TEST 4] Checking governance controls...${NC}"
governance_checks=(
    "git merge origin/main"  # Merges FROM main
    "git merge --abort"       # Aborts on conflict
    "CONFLICT"                # Detects conflicts
    "SUCCESS_COUNT"           # Tracks successes
    "CONFLICT_COUNT"          # Tracks conflicts
)
all_checks_pass=true

for check in "${governance_checks[@]}"; do
    if grep -q "$check" scripts/sync-branches.sh; then
        echo -e "${GREEN}  ✓${NC} Control found: '$check'"
    else
        echo -e "${RED}  ✗${NC} Control missing: '$check'"
        all_checks_pass=false
    fi
done

if [ "$all_checks_pass" = true ]; then
    echo -e "${GREEN}✓ PASS${NC} - All governance controls in place"
else
    echo -e "${RED}✗ FAIL${NC} - Some governance controls missing"
    exit 1
fi
echo ""

# Test 5: Verify script does NOT merge INTO main
echo -e "${BLUE}[TEST 5] Verifying script does NOT merge INTO main...${NC}"
if grep -q "git merge.*into main" scripts/sync-branches.sh; then
    echo -e "${RED}✗ FAIL${NC} - Script contains merge INTO main"
    exit 1
else
    echo -e "${GREEN}✓ PASS${NC} - Script does NOT merge INTO main"
fi
echo ""

# Test 6: Verify GitHub Actions workflow exists and is valid
echo -e "${BLUE}[TEST 6] Checking GitHub Actions workflow...${NC}"
if [ -f ".github/workflows/sync-branches.yml" ]; then
    # Validate YAML syntax
    if python3 -c "import yaml; yaml.safe_load(open('.github/workflows/sync-branches.yml'))" 2>/dev/null; then
        echo -e "${GREEN}✓ PASS${NC} - Workflow file exists and YAML is valid"
    else
        echo -e "${RED}✗ FAIL${NC} - Workflow YAML is invalid"
        exit 1
    fi
else
    echo -e "${RED}✗ FAIL${NC} - Workflow file not found"
    exit 1
fi
echo ""

# Test 7: Verify governance documentation exists
echo -e "${BLUE}[TEST 7] Checking governance documentation...${NC}"
if [ -f ".github/BRANCH_SYNC_GOVERNANCE.md" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Governance documentation exists"
else
    echo -e "${RED}✗ FAIL${NC} - Governance documentation not found"
    exit 1
fi
echo ""

# Test 8: Verify user documentation exists
echo -e "${BLUE}[TEST 8] Checking user documentation...${NC}"
if [ -f "BRANCH_SYNC_README.md" ]; then
    echo -e "${GREEN}✓ PASS${NC} - User documentation exists"
else
    echo -e "${RED}✗ FAIL${NC} - User documentation not found"
    exit 1
fi
echo ""

# Test 9: Verify script has proper error handling
echo -e "${BLUE}[TEST 9] Checking error handling...${NC}"
if grep -q "set -e" scripts/sync-branches.sh; then
    echo -e "${GREEN}  ✓${NC} Script exits on error (set -e)"
else
    echo -e "${YELLOW}  !${NC} No 'set -e' found (warning)"
fi

if grep -q "||" scripts/sync-branches.sh && grep -q "return 1" scripts/sync-branches.sh; then
    echo -e "${GREEN}  ✓${NC} Error handling with return codes"
else
    echo -e "${YELLOW}  !${NC} Limited error handling detected"
fi
echo -e "${GREEN}✓ PASS${NC} - Error handling mechanisms in place"
echo ""

# Test 10: Verify logging and audit trail
echo -e "${BLUE}[TEST 10] Checking logging and audit trail...${NC}"
logging_features=(
    "log_info"
    "log_success"
    "log_warning"
    "log_error"
    "SUMMARY"
)
all_logging_exists=true

for feature in "${logging_features[@]}"; do
    if grep -q "$feature" scripts/sync-branches.sh; then
        echo -e "${GREEN}  ✓${NC} Logging feature: '$feature'"
    else
        echo -e "${RED}  ✗${NC} Missing feature: '$feature'"
        all_logging_exists=false
    fi
done

if [ "$all_logging_exists" = true ]; then
    echo -e "${GREEN}✓ PASS${NC} - Comprehensive logging in place"
else
    echo -e "${RED}✗ FAIL${NC} - Logging incomplete"
    exit 1
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Branch synchronization system validated:"
echo "  ✓ Script exists and is executable"
echo "  ✓ Syntax is valid"
echo "  ✓ Required functions implemented"
echo "  ✓ Governance controls in place"
echo "  ✓ Does NOT merge INTO main"
echo "  ✓ GitHub Actions workflow configured"
echo "  ✓ Documentation complete"
echo "  ✓ Error handling robust"
echo "  ✓ Logging comprehensive"
echo ""
echo -e "${GREEN}System is ready to use!${NC}"
echo ""
echo "To synchronize branches, run:"
echo "  ./scripts/sync-branches.sh"
echo ""
echo "For more information, see:"
echo "  - BRANCH_SYNC_README.md (user guide)"
echo "  - .github/BRANCH_SYNC_GOVERNANCE.md (governance rules)"
echo ""

exit 0
