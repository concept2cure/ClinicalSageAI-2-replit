#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
TENANT_HEADER_VALUE="${TENANT_HEADER_VALUE:-1}"

hdr=(-H "Content-Type: application/json" -H "x-organization-id: ${TENANT_HEADER_VALUE}")

echo "[1/3] Upsert evidence source (safety_analysis)…"
curl -sS "${BASE_URL}/api/evidence-fabric/sources/upsert" \
  "${hdr[@]}" \
  -d '{
    "key": "safety_analysis",
    "value": {"primary_endpoint": {"p_value": 0.031, "effect": 1.42}},
    "provenance": {"system": "sas", "dataset": "adam.adsl", "program": "safety_primary.sas"}
  }' | jq .

echo "[2/3] Preview render + capture manifest…"
MANIFEST=$(curl -sS "${BASE_URL}/api/evidence-fabric/preview" \
  "${hdr[@]}" \
  -d '{
    "content": "Primary endpoint p={{safety_analysis.primary_endpoint.p_value}} (effect={{safety_analysis.primary_endpoint.effect}})"
  }' | jq -c '.manifest')

echo "Manifest: ${MANIFEST}"

echo "[3/3] Simulate data change, then preview again (should be stale)…"

curl -sS "${BASE_URL}/api/evidence-fabric/sources/upsert" \
  "${hdr[@]}" \
  -d '{
    "key": "safety_analysis",
    "value": {"primary_endpoint": {"p_value": 0.12, "effect": 1.42}},
    "provenance": {"system": "sas", "dataset": "adam.adsl", "program": "safety_primary.sas"}
  }' > /dev/null

curl -sS "${BASE_URL}/api/evidence-fabric/preview" \
  "${hdr[@]}" \
  -d "$(jq -n --arg content 'Primary endpoint p={{safety_analysis.primary_endpoint.p_value}} (effect={{safety_analysis.primary_endpoint.effect}})' --argjson prev "${MANIFEST}" '{content:$content, previousManifest:$prev}')" | jq .

echo "Done."
