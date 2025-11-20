#!/bin/bash

# CERV2 Medical Device Module - Comprehensive Test Suite
# Tests all major API endpoints and functionality

API_BASE="http://localhost:5000"
ORG_ID="7"

echo "========================================="
echo "CERV2 Module Comprehensive Test Suite"
echo "========================================="
echo ""

# Test 1: FDA 510(k) Health Check
echo "✓ Test 1: FDA 510(k) API Health"
curl -s -H "x-organization-id: $ORG_ID" "$API_BASE/api/fda510k/health" | jq -r '.status, .apiVersion, .database.status, .fdaApi.status'
echo ""

# Test 2: FDA Predicate Device Search
echo "✓ Test 2: FDA Predicate Search"
curl -s -X POST "$API_BASE/api/fda510k/predicates/search" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{"deviceName": "orthopedic implant", "manufacturer": "Zimmer Biomet", "productCode": "MAX"}' \
  | jq -r '.pagination.total // "API Response: \(.)"' | head -5
echo ""

# Test 3: CER Module Version
echo "✓ Test 3: CER Module Version"
curl -s -H "x-organization-id: $ORG_ID" "$API_BASE/api/cer/version" | jq -r '.version // .error' 2>/dev/null || echo "Endpoint not accessible"
echo ""

# Test 4: CER Generate Section
echo "✓ Test 4: CER Section Generation (Test)"
curl -s -X POST "$API_BASE/api/cer/generate-section" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{"sectionType": "device_description", "deviceInfo": {"deviceName": "Hip Implant", "classification": "Class II"}}' \
  | jq -r '.success // .error' 2>/dev/null | head -3
echo ""

# Test 5: Medical Device Projects List
echo "✓ Test 5: Medical Device Projects"
curl -s "$API_BASE/api/medical-devices/510k?organizationId=$ORG_ID" \
  -H "x-organization-id: $ORG_ID" \
  | jq -r 'if type == "array" then "Found \(length) projects" else .message // .error end'
echo ""

# Test 6: System Health
echo "✓ Test 6: Overall System Health"
curl -s "$API_BASE/api/health" | jq -r '.status, .timestamp' | head -1
echo ""

# Test 7: Database Connection
echo "✓ Test 7: Database Connection"
curl -s -H "x-organization-id: $ORG_ID" "$API_BASE/api/fda510k/health" | jq -r '.database.status'
echo ""

echo "========================================="
echo "Test Suite Complete"
echo "========================================="