#!/bin/bash

# Sprint 3 Backend API Testing Script
# Tests the new endpoints added in Sprint 3

# Configuration
BASE_URL="http://localhost:5000/api/cerv2-workbench"
PROGRAM_ID="test-program-001"
ORG_ID=1

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "================================================"
echo "Sprint 3 Backend API Tests"
echo "================================================"
echo ""

# Note: Add your authentication token here
# AUTH_HEADER="Authorization: Bearer YOUR_TOKEN_HERE"
# For testing purposes, we'll assume tenant middleware is configured

echo -e "${YELLOW}Test 1: Export Preflight Check${NC}"
echo "GET $BASE_URL/programs/$PROGRAM_ID/exports/preflight"
curl -X GET "$BASE_URL/programs/$PROGRAM_ID/exports/preflight" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 2: Bulk Link Evidence${NC}"
echo "POST $BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk"
curl -X POST "$BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-001",
      "evidence-uuid-002",
      "evidence-uuid-003"
    ],
    "entityType": "CLAIM",
    "entityId": "claim-001"
  }' \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 3: Bulk Link to Standard${NC}"
echo "POST $BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk"
curl -X POST "$BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-004",
      "evidence-uuid-005"
    ],
    "entityType": "STANDARD_REQUIREMENT",
    "entityId": "standard-req-001"
  }' \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 4: Bulk Unlink Evidence (specific entity)${NC}"
echo "DELETE $BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk"
curl -X DELETE "$BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-001",
      "evidence-uuid-002"
    ],
    "entityType": "CLAIM",
    "entityId": "claim-001"
  }' \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 5: Bulk Unlink Evidence (all links for evidence)${NC}"
echo "DELETE $BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk"
curl -X DELETE "$BASE_URL/programs/$PROGRAM_ID/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-003"
    ]
  }' \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 6: Generate Claims Matrix Export${NC}"
echo "POST $BASE_URL/programs/$PROGRAM_ID/exports/claims-matrix"
curl -X POST "$BASE_URL/programs/$PROGRAM_ID/exports/claims-matrix" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 7: Generate Standards Coverage Export${NC}"
echo "POST $BASE_URL/programs/$PROGRAM_ID/exports/standards-coverage"
curl -X POST "$BASE_URL/programs/$PROGRAM_ID/exports/standards-coverage" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 8: Generate Outcomes Substantiation Export${NC}"
echo "POST $BASE_URL/programs/$PROGRAM_ID/exports/outcomes-substantiation"
curl -X POST "$BASE_URL/programs/$PROGRAM_ID/exports/outcomes-substantiation" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 9: Generate Defense Pack Export${NC}"
echo "POST $BASE_URL/programs/$PROGRAM_ID/exports/defense-pack"
curl -X POST "$BASE_URL/programs/$PROGRAM_ID/exports/defense-pack" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.'
echo -e "\n"

echo -e "${YELLOW}Test 10: Check Audit Events for Export Metadata${NC}"
echo "GET $BASE_URL/programs/$PROGRAM_ID/audit"
curl -X GET "$BASE_URL/programs/$PROGRAM_ID/audit" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.data | .[] | select(.action | contains("EXPORT")) | {action, entityId, metadata}'
echo -e "\n"

echo -e "${YELLOW}Test 11: Check Audit Events for Bulk Link Operations${NC}"
echo "GET $BASE_URL/programs/$PROGRAM_ID/audit"
curl -X GET "$BASE_URL/programs/$PROGRAM_ID/audit" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -s | jq '.data | .[] | select(.action | contains("BULK")) | {action, entityType, entityId, diffSummary, metadata}'
echo -e "\n"

echo "================================================"
echo "All Tests Completed"
echo "================================================"
echo ""
echo -e "${GREEN}Notes:${NC}"
echo "- Ensure your server is running on port 5000"
echo "- Update PROGRAM_ID and ORG_ID to match your test data"
echo "- Add authentication headers if required by your setup"
echo "- Check that jq is installed for formatted JSON output"
echo ""
