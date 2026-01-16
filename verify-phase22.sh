#!/bin/bash
# Phase 22 CSR Ingestion Pipeline - Verification Script
# This script verifies that all components are in place

echo "======================================================================"
echo "Phase 22 CSR Ingestion Pipeline - Implementation Verification"
echo "======================================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    return 0
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    return 1
  fi
}

check_dependency() {
  if command -v $1 &> /dev/null; then
    echo -e "${GREEN}✓${NC} $1 installed"
    return 0
  else
    echo -e "${RED}✗${NC} $1 not found"
    return 1
  fi
}

check_npm_package() {
  if npm list $1 &> /dev/null; then
    echo -e "${GREEN}✓${NC} npm package: $1"
    return 0
  else
    echo -e "${YELLOW}⚠${NC} npm package: $1 (not in node_modules, but may be in package.json)"
    return 0
  fi
}

check_python_module() {
  if python3 -c "import $1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Python module: $1"
    return 0
  else
    echo -e "${RED}✗${NC} Python module: $1 (not installed)"
    return 1
  fi
}

echo "1. Database Migration"
echo "--------------------"
check_file "server/db/migrations/22_ingestion_log.sql"
echo ""

echo "2. Service Layer"
echo "---------------"
check_file "server/services/PDFProcessor.ts"
check_file "server/services/pdf_extractor_helper.py"
check_file "server/services/ValidationService.ts"
check_file "server/services/CSRHarvesterService.ts"
echo ""

echo "3. Queue System"
echo "--------------"
check_file "server/queue/CSRHarvestQueue.ts"
check_file "server/queue/worker.ts"
echo ""

echo "4. API Layer"
echo "-----------"
check_file "server/api/vault/harvest.ts"
echo ""

echo "5. Documentation"
echo "---------------"
check_file "PHASE22_CSR_INGESTION_README.md"
check_file "PHASE22_IMPLEMENTATION_SUMMARY.md"
echo ""

echo "6. Test Scripts"
echo "--------------"
check_file "test-phase22-components.js"
check_file "test-csr-pipeline.js"
echo ""

echo "7. Node.js Dependencies"
echo "----------------------"
check_npm_package "bullmq"
check_npm_package "ioredis"
check_npm_package "axios"
echo ""

echo "8. Python Dependencies"
echo "---------------------"
check_python_module "pdfplumber"
check_python_module "PyPDF2"
echo ""

echo "9. System Dependencies"
echo "---------------------"
check_dependency "node"
check_dependency "python3"
check_dependency "redis-cli"
echo ""

echo "10. Configuration"
echo "----------------"
check_file ".env.example"
if grep -q "REDIS_HOST" .env.example; then
  echo -e "${GREEN}✓${NC} Redis config in .env.example"
else
  echo -e "${RED}✗${NC} Redis config missing in .env.example"
fi

if grep -q "worker:csr-harvest" package.json; then
  echo -e "${GREEN}✓${NC} Worker script in package.json"
else
  echo -e "${RED}✗${NC} Worker script missing in package.json"
fi
echo ""

echo "11. Route Mounting"
echo "-----------------"
if grep -q "harvestRouter" server/index.ts; then
  echo -e "${GREEN}✓${NC} Harvest routes imported in server/index.ts"
else
  echo -e "${RED}✗${NC} Harvest routes not imported"
fi

if grep -q "/api/vault/harvest" server/index.ts; then
  echo -e "${GREEN}✓${NC} Harvest routes mounted at /api/vault/harvest"
else
  echo -e "${RED}✗${NC} Harvest routes not mounted"
fi
echo ""

echo "======================================================================"
echo "Verification Complete"
echo "======================================================================"
echo ""
echo "Next Steps:"
echo "1. Ensure Redis is running: redis-cli ping"
echo "2. Apply database migration: psql \$DATABASE_URL -f server/db/migrations/22_ingestion_log.sql"
echo "3. Start the worker: npm run worker:csr-harvest"
echo "4. Test the API endpoints (requires authentication)"
echo ""
echo "For detailed documentation, see PHASE22_CSR_INGESTION_README.md"
