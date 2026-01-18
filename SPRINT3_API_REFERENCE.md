# Sprint 3 Backend - Quick API Reference

## Base URL
```
http://localhost:5000/api/cerv2-workbench
```

## Authentication
Add to all requests:
```bash
-H "x-organization-id: 1"
# Add authentication token if configured:
# -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 1. Export Preflight Check

**Endpoint**: `GET /programs/:programId/exports/preflight`

**Purpose**: Validate export readiness before generating exports

**cURL**:
```bash
curl -X GET "http://localhost:5000/api/cerv2-workbench/programs/test-001/exports/preflight" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "canExport": true,
    "blockers": [],
    "warnings": ["2 claim(s) marked as needing review"],
    "metrics": {
      "evidenceCount": 25,
      "claimCoverage": 85,
      "standardCoverage": 92,
      "needsReview": 2
    }
  }
}
```

---

## 2. Bulk Link Evidence

**Endpoint**: `POST /programs/:programId/evidence-links/bulk`

**Purpose**: Link multiple evidence files to an entity in one operation

**cURL**:
```bash
curl -X POST "http://localhost:5000/api/cerv2-workbench/programs/test-001/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-001",
      "evidence-uuid-002",
      "evidence-uuid-003"
    ],
    "entityType": "CLAIM",
    "entityId": "claim-001"
  }'
```

**Entity Types**:
- `CLAIM`
- `STANDARD_REQUIREMENT`
- `OUTCOME`

**Response**:
```json
{
  "ok": true,
  "count": 3
}
```

---

## 3. Bulk Unlink Evidence (Specific Entity)

**Endpoint**: `DELETE /programs/:programId/evidence-links/bulk`

**Purpose**: Remove links between evidence and a specific entity

**cURL**:
```bash
curl -X DELETE "http://localhost:5000/api/cerv2-workbench/programs/test-001/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-001",
      "evidence-uuid-002"
    ],
    "entityType": "CLAIM",
    "entityId": "claim-001"
  }'
```

**Response**:
```json
{
  "ok": true,
  "removedCount": 2
}
```

---

## 4. Bulk Unlink Evidence (All Links)

**Endpoint**: `DELETE /programs/:programId/evidence-links/bulk`

**Purpose**: Remove ALL links for specified evidence IDs

**cURL**:
```bash
curl -X DELETE "http://localhost:5000/api/cerv2-workbench/programs/test-001/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1" \
  -d '{
    "evidenceIds": [
      "evidence-uuid-003"
    ]
  }'
```

**Response**:
```json
{
  "ok": true,
  "removedCount": 5
}
```

---

## 5. Generate Claims Matrix Export

**Endpoint**: `POST /programs/:programId/exports/claims-matrix`

**Purpose**: Generate Excel export of claims with evidence mapping

**cURL**:
```bash
curl -X POST "http://localhost:5000/api/cerv2-workbench/programs/test-001/exports/claims-matrix" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": 123,
    "evidenceId": "export-uuid-001",
    "name": "Claims_Matrix_test-001.xlsx",
    "evidenceType": "EXPORT",
    "status": "published",
    "sizeBytes": 45678,
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "uploadedAt": "2026-01-18T10:30:00Z"
  }
}
```

---

## 6. Generate Standards Coverage Export

**Endpoint**: `POST /programs/:programId/exports/standards-coverage`

**Purpose**: Generate Excel export of standards compliance

**cURL**:
```bash
curl -X POST "http://localhost:5000/api/cerv2-workbench/programs/test-001/exports/standards-coverage" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

---

## 7. Generate Outcomes Substantiation Export

**Endpoint**: `POST /programs/:programId/exports/outcomes-substantiation`

**Purpose**: Generate Excel export of clinical outcomes with evidence

**cURL**:
```bash
curl -X POST "http://localhost:5000/api/cerv2-workbench/programs/test-001/exports/outcomes-substantiation" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

---

## 8. Generate Defense Pack Export

**Endpoint**: `POST /programs/:programId/exports/defense-pack`

**Purpose**: Generate comprehensive ZIP with all exports and evidence files

**cURL**:
```bash
curl -X POST "http://localhost:5000/api/cerv2-workbench/programs/test-001/exports/defense-pack" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

**Note**: This endpoint creates a ZIP file containing:
- `exports/claims-matrix.xlsx`
- `exports/standards-coverage.xlsx`
- `exports/outcomes-substantiation.xlsx`
- `evidence/[all evidence files]`

---

## 9. View Audit Trail

**Endpoint**: `GET /programs/:programId/audit`

**Purpose**: Retrieve audit events with full metadata

**cURL - All Events**:
```bash
curl -X GET "http://localhost:5000/api/cerv2-workbench/programs/test-001/audit" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

**cURL - Export Events Only**:
```bash
curl -X GET "http://localhost:5000/api/cerv2-workbench/programs/test-001/audit" \
  -H "x-organization-id: 1" \
  | jq '.data | .[] | select(.action | contains("EXPORT"))'
```

**cURL - Bulk Operations Only**:
```bash
curl -X GET "http://localhost:5000/api/cerv2-workbench/programs/test-001/audit" \
  -H "x-organization-id: 1" \
  | jq '.data | .[] | select(.action | contains("BULK"))'
```

---

## Testing Workflow

### Complete Test Sequence
```bash
#!/bin/bash
PROGRAM_ID="test-001"
ORG_ID=1
BASE="http://localhost:5000/api/cerv2-workbench"

# 1. Check preflight
echo "=== Preflight Check ==="
curl -s -X GET "$BASE/programs/$PROGRAM_ID/exports/preflight" \
  -H "x-organization-id: $ORG_ID" | jq '.data'

# 2. Bulk link evidence
echo -e "\n=== Bulk Link Evidence ==="
curl -s -X POST "$BASE/programs/$PROGRAM_ID/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{
    "evidenceIds": ["ev-1", "ev-2", "ev-3"],
    "entityType": "CLAIM",
    "entityId": "claim-001"
  }' | jq '.'

# 3. Generate export
echo -e "\n=== Generate Claims Matrix ==="
curl -s -X POST "$BASE/programs/$PROGRAM_ID/exports/claims-matrix" \
  -H "x-organization-id: $ORG_ID" | jq '.data | {name, sizeBytes, evidenceId}'

# 4. Check audit trail
echo -e "\n=== Recent Audit Events ==="
curl -s -X GET "$BASE/programs/$PROGRAM_ID/audit" \
  -H "x-organization-id: $ORG_ID" \
  | jq '.data[0:5] | .[] | {action, entityType, diffSummary}'

# 5. Bulk unlink
echo -e "\n=== Bulk Unlink Evidence ==="
curl -s -X DELETE "$BASE/programs/$PROGRAM_ID/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: $ORG_ID" \
  -d '{
    "evidenceIds": ["ev-1", "ev-2"]
  }' | jq '.'
```

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "ok": false,
  "error": "Descriptive error message"
}
```

**Common HTTP Status Codes**:
- `200` - Success (GET, DELETE)
- `201` - Created (POST for links)
- `400` - Bad Request (validation error)
- `404` - Not Found (entity doesn't exist)
- `500` - Internal Server Error

---

## Audit Event Types

### New in Sprint 3
- `EVIDENCE_LINKED_BULK` - Bulk link operation
- `EVIDENCE_UNLINKED_BULK` - Bulk unlink operation
- `EXPORT_GENERATED` - Now includes full metadata with `evidenceSetHash`

### Example Audit Metadata

**Export Event**:
```json
{
  "action": "EXPORT_GENERATED",
  "metadata": {
    "sha256": "file_path_reference",
    "sizeBytes": 45678,
    "evidenceSetHash": "abc123def456...",
    "filename": "Claims_Matrix_test-001.xlsx",
    "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
}
```

**Bulk Link Event**:
```json
{
  "action": "EVIDENCE_LINKED_BULK",
  "metadata": {
    "evidenceIds": ["ev-1", "ev-2", "ev-3"],
    "count": 3
  }
}
```

**Bulk Unlink Event**:
```json
{
  "action": "EVIDENCE_UNLINKED_BULK",
  "metadata": {
    "evidenceIds": ["ev-1", "ev-2"],
    "removedCount": 7,
    "affectedEntities": [
      {
        "entityType": "CLAIM",
        "entityIds": ["claim-1", "claim-2"]
      }
    ]
  }
}
```

---

## Tips & Best Practices

1. **Always check preflight before exports**: Prevents generating incomplete exports
2. **Use bulk operations for efficiency**: Single transaction, better performance
3. **Monitor audit trail**: Full traceability of all operations
4. **Check `evidenceSetHash`**: Detect changes in evidence set between exports
5. **Handle needsReview flags**: Re-review entities after evidence changes

---

## jq Filters for Common Tasks

**Extract export metadata**:
```bash
curl ... | jq '.data | .[] | select(.action=="EXPORT_GENERATED") | .metadata'
```

**Count bulk operations**:
```bash
curl ... | jq '[.data | .[] | select(.action | contains("BULK"))] | length'
```

**Find affected entities from bulk unlink**:
```bash
curl ... | jq '.data | .[] | select(.action=="EVIDENCE_UNLINKED_BULK") | .metadata.affectedEntities'
```

**Get coverage metrics**:
```bash
curl ... | jq '.data.metrics'
```

---

**Quick Reference Version**: 1.0
**Last Updated**: 2026-01-18
