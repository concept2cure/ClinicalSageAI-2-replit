#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
TENANT_ID="${TENANT_ID:-demo}"
PRODUCT_CODE="${PRODUCT_CODE:-KRA}"

echo "[1/4] Health"
curl -sS "$BASE_URL/api/lumen/health/live" | head -c 300; echo

echo "[2/4] Shadow Review"
PAYLOAD_SHADOW_REVIEW="$(python3 - <<PY
import json, os
tenant=os.environ.get('TENANT_ID','demo')
product=os.environ.get('PRODUCT_CODE','KRA')
print(json.dumps({
  'tenantId': tenant,
  'productCode': product,
  'dossierContext': {
    'isSoftware': True,
    'hasSBOM': False,
    'contactDuration': 'Permanent',
    'iso10993Report': False,
    'predicateClearanceDate': '2025-06-01',
    'hasAIML': False
  },
  'topic': 'cybersecurity',
  'useCache': True
}))
PY
)"

curl -sS -X POST "$BASE_URL/api/lumen/shadow-review" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD_SHADOW_REVIEW" | head -c 1200; echo

echo "[3/4] Deficiency Upload"
PAYLOAD_UPLOAD="$(python3 - <<PY
import json, os
tenant=os.environ.get('TENANT_ID','demo')
print(json.dumps({
  'tenantId': tenant,
  'text': 'FDA request excerpt (anonymized): Please provide your SBOM and a cybersecurity risk assessment describing threat modeling, vulnerabilities, and patching process.'
}))
PY
)"

curl -sS -X POST "$BASE_URL/api/lumen/deficiency/upload" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD_UPLOAD" | head -c 800; echo

echo "[4/4] Deficiency Query"
PAYLOAD_QUERY="$(python3 - <<PY
import json, os
tenant=os.environ.get('TENANT_ID','demo')
print(json.dumps({
  'tenantId': tenant,
  'topic': 'cybersecurity',
  'includeUnverified': True
}))
PY
)"

curl -sS -X POST "$BASE_URL/api/lumen/deficiency/query" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD_QUERY" | head -c 1200; echo

echo "OK"
