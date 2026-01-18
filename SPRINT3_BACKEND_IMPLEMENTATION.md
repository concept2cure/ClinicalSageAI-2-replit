# Sprint 3 Backend Implementation - Complete Documentation

## Overview
This document details the backend implementation for Sprint 3, which adds advanced evidence management features including export manifest support, bulk operations, and export preflight checks.

## Implemented Features

### 1. Export Manifest with Evidence Set Hash

#### Description
All export operations now compute and store a cryptographic hash representing the complete evidence set and link graph at the time of export. This provides tamper detection and snapshot versioning.

#### Implementation Details
- **Hash Computation**: `sha256(sorted(evidence_sha256_list + link_graph))`
  - Evidence hashes are sorted alphabetically
  - Link graph entries are formatted as `evidenceId:entityType:entityId` and sorted
  - Combined and hashed using SHA-256

- **Audit Event Metadata**: All exports now log with full metadata:
  ```json
  {
    "sha256": "file_path_reference",
    "sizeBytes": 12345,
    "evidenceSetHash": "abc123...",
    "filename": "sanitized_name.xlsx",
    "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
  ```

#### Modified Function
`createExportEvidence()` in [server/routes/cerv2-workbench.ts](server/routes/cerv2-workbench.ts)

#### Affected Export Endpoints
- `POST /programs/:programId/exports/claims-matrix`
- `POST /programs/:programId/exports/standards-coverage`
- `POST /programs/:programId/exports/outcomes-substantiation`
- `POST /programs/:programId/exports/defense-pack`

---

### 2. Bulk Evidence Linking

#### Endpoint
`POST /programs/:programId/evidence-links/bulk`

#### Request Body
```json
{
  "evidenceIds": ["uuid-1", "uuid-2", "uuid-3"],
  "entityType": "CLAIM",
  "entityId": "claim-001"
}
```

#### Response
```json
{
  "ok": true,
  "count": 3
}
```

#### Features
- Creates multiple evidence links in a single transaction
- Automatically marks the target entity for review
- Logs `EVIDENCE_LINKED_BULK` audit event with metadata:
  ```json
  {
    "evidenceIds": ["uuid-1", "uuid-2", "uuid-3"],
    "count": 3
  }
  ```
- Uses `onConflictDoNothing()` to handle duplicate links gracefully

#### Use Cases
- Linking multiple evidence files to a claim after batch upload
- Associating a set of related documents to a standard requirement
- Bulk operations in UI (multi-select → link)

#### Example cURL
```bash
curl -X POST "http://localhost:5000/api/cerv2-workbench/programs/test-001/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1" \
  -d '{
    "evidenceIds": ["ev-001", "ev-002", "ev-003"],
    "entityType": "CLAIM",
    "entityId": "claim-efficacy-01"
  }'
```

---

### 3. Bulk Evidence Unlinking

#### Endpoint
`DELETE /programs/:programId/evidence-links/bulk`

#### Request Body
```json
{
  "evidenceIds": ["uuid-1", "uuid-2"],
  "entityType": "CLAIM",          // Optional
  "entityId": "claim-001"          // Optional
}
```

#### Response
```json
{
  "ok": true,
  "removedCount": 5
}
```

#### Features
- Flexible deletion:
  - With `entityType` + `entityId`: Remove specific links
  - Without filters: Remove ALL links for specified evidence IDs
- Automatically marks all affected entities for review
- Logs `EVIDENCE_UNLINKED_BULK` audit event with detailed metadata:
  ```json
  {
    "evidenceIds": ["uuid-1", "uuid-2"],
    "removedCount": 5,
    "affectedEntities": [
      {
        "entityType": "CLAIM",
        "entityIds": ["claim-001", "claim-002"]
      },
      {
        "entityType": "STANDARD_REQUIREMENT",
        "entityIds": ["std-001"]
      }
    ]
  }
  ```

#### Use Cases
- Remove multiple obsolete evidence links at once
- Clear all links for evidence being archived
- Cleanup after evidence replacement

#### Example cURL Commands

**Remove specific links:**
```bash
curl -X DELETE "http://localhost:5000/api/cerv2-workbench/programs/test-001/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1" \
  -d '{
    "evidenceIds": ["ev-001", "ev-002"],
    "entityType": "CLAIM",
    "entityId": "claim-001"
  }'
```

**Remove all links for evidence:**
```bash
curl -X DELETE "http://localhost:5000/api/cerv2-workbench/programs/test-001/evidence-links/bulk" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1" \
  -d '{
    "evidenceIds": ["ev-obsolete-001", "ev-obsolete-002"]
  }'
```

---

### 4. Export Preflight Check

#### Endpoint
`GET /programs/:programId/exports/preflight`

#### Response
```json
{
  "ok": true,
  "data": {
    "canExport": false,
    "blockers": [
      "Claims coverage below 70% (currently 45%)",
      "Standards coverage below 70% (currently 60%)"
    ],
    "warnings": [
      "3 claim(s) marked as needing review"
    ],
    "metrics": {
      "evidenceCount": 15,
      "claimCoverage": 45,
      "standardCoverage": 60,
      "needsReview": 3
    }
  }
}
```

#### Validation Rules

**Blockers** (prevent export):
- No evidence files uploaded
- Claims coverage < 70%
- Standards coverage < 70%

**Warnings** (allow export but flag issues):
- Claims coverage < 90% but >= 70%
- Standards coverage < 90% but >= 70%
- Any items marked as needing review

#### Coverage Calculation
- **Claims Coverage**: `(unique claims with evidence / total claims) * 100`
- **Standards Coverage**: `(unique standards with evidence / total standards) * 100`

#### Use Cases
- Pre-validation before generating exports
- Display readiness dashboard in UI
- Gate export buttons with actionable error messages

#### Example cURL
```bash
curl -X GET "http://localhost:5000/api/cerv2-workbench/programs/test-001/exports/preflight" \
  -H "Content-Type: application/json" \
  -H "x-organization-id: 1"
```

---

## Database Queries

### Evidence Set Hash Computation
```typescript
// Get all non-archived evidence hashes
const evidenceRows = await db
  .select({ hash: cerv2Evidence.hash })
  .from(cerv2Evidence)
  .where(
    and(
      eq(cerv2Evidence.organizationId, organizationId),
      eq(cerv2Evidence.programId, programId),
      sql`${cerv2Evidence.archivedAt} IS NULL`
    )
  );

// Get complete link graph
const links = await db
  .select({
    evidenceId: cerv2EvidenceLinks.evidenceId,
    entityType: cerv2EvidenceLinks.entityType,
    entityId: cerv2EvidenceLinks.entityId,
  })
  .from(cerv2EvidenceLinks)
  .where(
    and(
      eq(cerv2EvidenceLinks.organizationId, organizationId),
      eq(cerv2EvidenceLinks.programId, programId)
    )
  );

// Compute hash
const evidenceHashes = evidenceRows.map((r) => r.hash || '').filter(Boolean).sort();
const linkGraph = links.map((l) => `${l.evidenceId}:${l.entityType}:${l.entityId}`).sort();
const combined = [...evidenceHashes, ...linkGraph].join('|');
const evidenceSetHash = crypto.createHash('sha256').update(combined).digest('hex');
```

### Bulk Link Creation
```typescript
const values = evidenceIds.map((evidenceId) => ({
  organizationId,
  programId,
  evidenceId,
  entityType,
  entityId,
}));

await db.insert(cerv2EvidenceLinks).values(values).onConflictDoNothing();
```

### Bulk Unlink with ANY clause
```typescript
const conditions = [
  eq(cerv2EvidenceLinks.organizationId, organizationId),
  eq(cerv2EvidenceLinks.programId, programId),
  sql`${cerv2EvidenceLinks.evidenceId} = ANY(${evidenceIds})`,
];

const removed = await db
  .delete(cerv2EvidenceLinks)
  .where(and(...conditions))
  .returning();
```

---

## Audit Trail

All operations create comprehensive audit events:

### Export Operations
```typescript
{
  action: 'EXPORT_GENERATED',
  entityType: 'EVIDENCE',
  entityId: 'export-evidence-uuid',
  diffSummary: 'Export generated: Claims_Matrix_test-001.xlsx',
  metadata: {
    sha256: 'file_path',
    sizeBytes: 45678,
    evidenceSetHash: 'abc123def456...',
    filename: 'Claims_Matrix_test-001.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
}
```

### Bulk Link Operations
```typescript
{
  action: 'EVIDENCE_LINKED_BULK',
  entityType: 'CLAIM',
  entityId: 'claim-001',
  diffSummary: 'Bulk linked 5 evidence items to CLAIM',
  metadata: {
    evidenceIds: ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5'],
    count: 5
  }
}
```

### Bulk Unlink Operations
```typescript
{
  action: 'EVIDENCE_UNLINKED_BULK',
  entityType: null,
  entityId: null,
  diffSummary: 'Bulk unlinked 7 evidence links',
  metadata: {
    evidenceIds: ['ev-1', 'ev-2'],
    removedCount: 7,
    affectedEntities: [
      { entityType: 'CLAIM', entityIds: ['claim-1', 'claim-2'] },
      { entityType: 'STANDARD_REQUIREMENT', entityIds: ['std-1'] }
    ]
  }
}
```

---

## Testing

### Prerequisites
1. Server running on port 5000
2. Database with test data:
   - At least one program/project
   - Some evidence files
   - Claims, standards, and outcomes
   - Some existing evidence links

### Running Tests
```bash
# Make script executable
chmod +x test-sprint3-backend.sh

# Run all tests
./test-sprint3-backend.sh

# Or run individual curl commands from the script
```

### Test Sequence
1. Preflight check (baseline)
2. Bulk link evidence to claim
3. Bulk link evidence to standard
4. Generate exports (verify metadata)
5. Bulk unlink specific links
6. Bulk unlink all links for evidence
7. Check audit trail for all operations

### Expected Results
- All endpoints return `{ ok: true }` with appropriate data
- Audit events contain full metadata
- `needsReview` flags are set on affected entities
- Export files are created with `evidenceSetHash` in metadata

---

## Error Handling

All endpoints include proper error handling:

```typescript
try {
  // ... operation logic
} catch (error: any) {
  res.status(500).json({ 
    ok: false, 
    error: error?.message || 'Operation failed' 
  });
}
```

Common error scenarios:
- Invalid UUIDs in request body
- Missing required fields (caught by Zod validation)
- Database connection issues
- File system errors (for exports)

---

## Security Considerations

1. **Multi-tenant Isolation**: All queries filter by `organizationId`
2. **SQL Injection Prevention**: Using Drizzle ORM parameterized queries
3. **Input Validation**: Zod schemas for all request bodies
4. **Audit Trail**: Complete traceability of all operations
5. **Transaction Safety**: Bulk operations use database transactions

---

## Performance Notes

1. **Bulk Operations**: Optimized with single INSERT/DELETE queries
2. **Hash Computation**: Runs in-memory after fetching data
3. **Coverage Calculations**: Uses efficient Set-based deduplication
4. **Preflight**: Multiple queries run in parallel (can be optimized further)

### Future Optimizations
- Cache coverage calculations
- Use materialized views for metrics
- Batch preflight checks in worker queue
- Add Redis caching for frequently accessed data

---

## Integration with Frontend

The frontend can integrate these endpoints as follows:

```typescript
// Export preflight
const preflightCheck = async (programId: string) => {
  const res = await fetch(`/api/cerv2-workbench/programs/${programId}/exports/preflight`);
  return res.json();
};

// Bulk link
const bulkLinkEvidence = async (
  programId: string,
  evidenceIds: string[],
  entityType: string,
  entityId: string
) => {
  const res = await fetch(
    `/api/cerv2-workbench/programs/${programId}/evidence-links/bulk`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceIds, entityType, entityId })
    }
  );
  return res.json();
};

// Bulk unlink
const bulkUnlinkEvidence = async (
  programId: string,
  evidenceIds: string[],
  entityType?: string,
  entityId?: string
) => {
  const res = await fetch(
    `/api/cerv2-workbench/programs/${programId}/evidence-links/bulk`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceIds, entityType, entityId })
    }
  );
  return res.json();
};
```

---

## Summary

### Files Modified
- `server/routes/cerv2-workbench.ts` - All backend implementation

### New Endpoints
1. `POST /programs/:programId/evidence-links/bulk` - Bulk link evidence
2. `DELETE /programs/:programId/evidence-links/bulk` - Bulk unlink evidence
3. `GET /programs/:programId/exports/preflight` - Preflight validation

### Enhanced Endpoints
1. `POST /programs/:programId/exports/claims-matrix` - Now logs full metadata
2. `POST /programs/:programId/exports/standards-coverage` - Now logs full metadata
3. `POST /programs/:programId/exports/outcomes-substantiation` - Now logs full metadata
4. `POST /programs/:programId/exports/defense-pack` - Now logs full metadata

### New Audit Actions
- `EVIDENCE_LINKED_BULK`
- `EVIDENCE_UNLINKED_BULK`
- Enhanced `EXPORT_GENERATED` with full metadata

### Test Coverage
- ✅ 11 test scenarios in `test-sprint3-backend.sh`
- ✅ All endpoints tested with realistic data
- ✅ Audit trail verification included

---

## Next Steps

For complete Sprint 3 implementation:
1. **Frontend Integration** - UI components for bulk operations
2. **Error Handling UI** - Display preflight blockers/warnings
3. **Performance Testing** - Load test bulk operations
4. **Documentation** - User-facing guides and API documentation
5. **Monitoring** - Add metrics for export operations and bulk actions

---

**Implementation Status**: ✅ Complete
**Date**: 2026-01-18
**Agent**: Backend Agent - Sprint 3
