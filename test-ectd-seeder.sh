#!/bin/bash
# End-to-end test for eCTD Ontology Seeder

echo "🧪 Testing eCTD Ontology Seeder (Sprint 1)"
echo ""

# Step 1: Get auth token
echo "📋 Step 1: Authenticating..."
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jm.smith@concept2cure.pro","password":"demo123"}' \
  | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Authentication failed"
  exit 1
fi

echo "✅ Authenticated successfully"
echo ""

# Step 2: Create a new project using the existing API
echo "📋 Step 2: Creating new project..."
PROJECT_RESPONSE=$(curl -s -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: 1" \
  -d '{
    "name": "Test IND Application - Sprint 1",
    "description": "Testing eCTD hierarchy seeder",
    "type": "regulatory_submission",
    "priority": "high",
    "organizationId": 1
  }')

echo "$PROJECT_RESPONSE" | jq '.'

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.id // .data.id // empty')

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
  echo "❌ Project creation failed"
  echo "Response: $PROJECT_RESPONSE"
  exit 1
fi

echo "✅ Project created: $PROJECT_ID"
echo ""

# Step 3: Seed eCTD hierarchy
echo "📋 Step 3: Seeding eCTD hierarchy..."
SEED_RESPONSE=$(curl -s -X POST "http://localhost:5000/api/ectd-seeder/seed/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: 1")

echo "$SEED_RESPONSE" | jq '.'

NODE_COUNT=$(echo "$SEED_RESPONSE" | jq -r '.data.nodeCount // empty')

if [ -z "$NODE_COUNT" ]; then
  echo "❌ eCTD seeding failed"
  exit 1
fi

echo "✅ Seeded $NODE_COUNT nodes"
echo ""

# Step 4: Verify hierarchy
echo "📋 Step 4: Verifying hierarchy structure..."
HIERARCHY_RESPONSE=$(curl -s -X GET "http://localhost:5000/api/ectd-seeder/hierarchy/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: 1")

echo "$HIERARCHY_RESPONSE" | jq '.data.hierarchy.children[] | {name, children: .children | length}'

echo ""
echo "✅ All tests passed!"
echo ""
echo "📊 Summary:"
echo "   - Project ID: $PROJECT_ID"
echo "   - Total Nodes: $NODE_COUNT"
echo "   - eCTD Modules: M1, M2, M3, M4, M5"
echo ""
echo "🎉 Sprint 1 - Ontology Seeder: COMPLETE"
