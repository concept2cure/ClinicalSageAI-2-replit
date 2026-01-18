# Sprint 3 Backend - Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SPRINT 3 BACKEND FEATURES                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 1. EXPORT MANIFEST WITH EVIDENCE SET HASH                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  createExportEvidence()                                                   │
│  ├── Query: cerv2_evidence (all non-archived hashes)                     │
│  ├── Query: cerv2_evidence_links (complete link graph)                   │
│  ├── Compute: evidenceSetHash                                            │
│  │   └── sha256(sorted_evidence_hashes + sorted_link_graph)              │
│  ├── Store: Export evidence record                                       │
│  └── Log: EXPORT_GENERATED audit event                                   │
│      └── metadata: {sha256, sizeBytes, evidenceSetHash, filename, type}  │
│                                                                           │
│  Used by:                                                                 │
│    • POST /programs/:programId/exports/claims-matrix                     │
│    • POST /programs/:programId/exports/standards-coverage                │
│    • POST /programs/:programId/exports/outcomes-substantiation           │
│    • POST /programs/:programId/exports/defense-pack                      │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 2. BULK LINK ENDPOINT                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  POST /programs/:programId/evidence-links/bulk                           │
│  ┌────────────────────────────────────────────┐                          │
│  │ Request Body:                               │                          │
│  │ {                                           │                          │
│  │   evidenceIds: ["uuid-1", "uuid-2", ...],  │                          │
│  │   entityType: "CLAIM",                      │                          │
│  │   entityId: "claim-001"                     │                          │
│  │ }                                           │                          │
│  └────────────────────────────────────────────┘                          │
│                                                                           │
│  Flow:                                                                    │
│  1. Validate input (Zod schema)                                          │
│  2. Map evidenceIds → link objects                                       │
│  3. INSERT bulk links (onConflictDoNothing)                              │
│  4. Mark entity needsReview = true                                       │
│  5. Log EVIDENCE_LINKED_BULK audit event                                 │
│                                                                           │
│  Result: { ok: true, count: N }                                          │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 3. BULK UNLINK ENDPOINT                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  DELETE /programs/:programId/evidence-links/bulk                         │
│  ┌────────────────────────────────────────────┐                          │
│  │ Request Body:                               │                          │
│  │ {                                           │                          │
│  │   evidenceIds: ["uuid-1", "uuid-2"],       │                          │
│  │   entityType: "CLAIM",     // optional     │                          │
│  │   entityId: "claim-001"    // optional     │                          │
│  │ }                                           │                          │
│  └────────────────────────────────────────────┘                          │
│                                                                           │
│  Flow:                                                                    │
│  1. Validate input (Zod schema)                                          │
│  2. Build WHERE conditions:                                              │
│     • organizationId = ?                                                 │
│     • programId = ?                                                      │
│     • evidenceId = ANY(evidenceIds)                                      │
│     • [optional] entityType = ?                                          │
│     • [optional] entityId = ?                                            │
│  3. DELETE with RETURNING                                                │
│  4. Track affected entities (Map<entityType, Set<entityId>>)            │
│  5. Mark all affected entities needsReview = true                        │
│  6. Log EVIDENCE_UNLINKED_BULK with affectedEntities                     │
│                                                                           │
│  Result: { ok: true, removedCount: N }                                   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 4. EXPORT PREFLIGHT ENDPOINT                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  GET /programs/:programId/exports/preflight                              │
│                                                                           │
│  Checks:                                                                  │
│  ┌──────────────────────────────────────────────────────┐                │
│  │ 1. Evidence Count                                     │                │
│  │    • Count non-archived evidence                      │                │
│  │    • BLOCKER if count = 0                             │                │
│  │                                                        │                │
│  │ 2. Claims Coverage                                    │                │
│  │    • claims_with_evidence / total_claims * 100        │                │
│  │    • BLOCKER if < 70%                                 │                │
│  │    • WARNING if 70-89%                                │                │
│  │                                                        │                │
│  │ 3. Standards Coverage                                 │                │
│  │    • standards_with_evidence / total_standards * 100  │                │
│  │    • BLOCKER if < 70%                                 │                │
│  │    • WARNING if 70-89%                                │                │
│  │                                                        │                │
│  │ 4. Items Needing Review                               │                │
│  │    • Count claims with needsReview = true             │                │
│  │    • WARNING if count > 0                             │                │
│  └──────────────────────────────────────────────────────┘                │
│                                                                           │
│  Result:                                                                  │
│  {                                                                        │
│    canExport: boolean,                                                    │
│    blockers: string[],                                                    │
│    warnings: string[],                                                    │
│    metrics: {                                                             │
│      evidenceCount: number,                                               │
│      claimCoverage: number,                                               │
│      standardCoverage: number,                                            │
│      needsReview: number                                                  │
│    }                                                                      │
│  }                                                                        │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ AUDIT TRAIL ENHANCEMENTS                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  New Actions:                                                             │
│  ├── EVIDENCE_LINKED_BULK                                                │
│  │   └── metadata: { evidenceIds, count }                                │
│  │                                                                        │
│  ├── EVIDENCE_UNLINKED_BULK                                              │
│  │   └── metadata: { evidenceIds, removedCount, affectedEntities }       │
│  │                                                                        │
│  └── EXPORT_GENERATED (enhanced)                                         │
│      └── metadata: { sha256, sizeBytes, evidenceSetHash, filename, type }│
│                                                                           │
│  Query Audit Trail:                                                       │
│  SELECT * FROM cerv2_audit_events                                         │
│  WHERE action IN ('EVIDENCE_LINKED_BULK',                                │
│                   'EVIDENCE_UNLINKED_BULK',                              │
│                   'EXPORT_GENERATED')                                     │
│  ORDER BY created_at DESC;                                                │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ DATABASE TABLES USED                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  cerv2_evidence                                                           │
│  ├── Primary: Store evidence metadata                                    │
│  ├── Read: Get hashes for evidenceSetHash computation                    │
│  └── Write: Store export evidence records                                │
│                                                                           │
│  cerv2_evidence_links                                                     │
│  ├── Primary: Store evidence ↔ entity relationships                      │
│  ├── Read: Get link graph for hash, coverage calculations                │
│  ├── Write: Bulk insert links                                            │
│  └── Delete: Bulk remove links                                           │
│                                                                           │
│  cerv2_claims                                                             │
│  ├── Read: Count claims, check needsReview                               │
│  └── Write: Update needsReview flag                                      │
│                                                                           │
│  cerv2_standards                                                          │
│  ├── Read: Count standards, check needsReview                            │
│  └── Write: Update needsReview flag                                      │
│                                                                           │
│  cerv2_outcomes                                                           │
│  ├── Read: Count outcomes                                                │
│  └── Write: Update needsReview flag                                      │
│                                                                           │
│  cerv2_audit_events                                                       │
│  └── Write: Log all operations with metadata                             │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ DATA FLOW EXAMPLE                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Scenario: User bulk links 3 evidence files to a claim                   │
│                                                                           │
│  1. Frontend → POST /evidence-links/bulk                                 │
│     {                                                                     │
│       evidenceIds: ["ev-001", "ev-002", "ev-003"],                       │
│       entityType: "CLAIM",                                                │
│       entityId: "claim-safety-01"                                         │
│     }                                                                     │
│                                                                           │
│  2. Backend Process:                                                      │
│     ┌────────────────────────────────────────────────┐                   │
│     │ INSERT INTO cerv2_evidence_links               │                   │
│     │ VALUES                                          │                   │
│     │   (org_id, prog_id, 'ev-001', 'CLAIM', ...),   │                   │
│     │   (org_id, prog_id, 'ev-002', 'CLAIM', ...),   │                   │
│     │   (org_id, prog_id, 'ev-003', 'CLAIM', ...)    │                   │
│     │ ON CONFLICT DO NOTHING;                         │                   │
│     └────────────────────────────────────────────────┘                   │
│                                                                           │
│     ┌────────────────────────────────────────────────┐                   │
│     │ UPDATE cerv2_claims                             │                   │
│     │ SET needsReview = true,                         │                   │
│     │     lastImpactedAt = now()                      │                   │
│     │ WHERE claim_id = 'claim-safety-01';             │                   │
│     └────────────────────────────────────────────────┘                   │
│                                                                           │
│     ┌────────────────────────────────────────────────┐                   │
│     │ INSERT INTO cerv2_audit_events                  │                   │
│     │ VALUES (                                        │                   │
│     │   action: 'EVIDENCE_LINKED_BULK',              │                   │
│     │   entity_type: 'CLAIM',                         │                   │
│     │   entity_id: 'claim-safety-01',                │                   │
│     │   metadata: {                                   │                   │
│     │     evidenceIds: [...],                         │                   │
│     │     count: 3                                    │                   │
│     │   }                                             │                   │
│     │ );                                              │                   │
│     └────────────────────────────────────────────────┘                   │
│                                                                           │
│  3. Backend → Frontend                                                    │
│     { ok: true, count: 3 }                                                │
│                                                                           │
│  4. Frontend updates UI:                                                  │
│     • Show success toast: "Linked 3 evidence files"                      │
│     • Refresh claim view (shows needsReview badge)                       │
│     • Update audit trail panel                                           │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ HASH COMPUTATION ALGORITHM                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Input:                                                                   │
│  • Evidence Hashes: ["hash1", "hash2", "hash3"]                          │
│  • Link Graph: [                                                         │
│      "ev-001:CLAIM:claim-001",                                           │
│      "ev-002:CLAIM:claim-001",                                           │
│      "ev-001:STANDARD_REQUIREMENT:std-001"                               │
│    ]                                                                     │
│                                                                           │
│  Process:                                                                 │
│  1. Sort evidence hashes alphabetically                                  │
│     → ["hash1", "hash2", "hash3"]                                        │
│                                                                           │
│  2. Sort link graph entries alphabetically                               │
│     → ["ev-001:CLAIM:claim-001",                                         │
│        "ev-001:STANDARD_REQUIREMENT:std-001",                            │
│        "ev-002:CLAIM:claim-001"]                                         │
│                                                                           │
│  3. Combine into single string                                           │
│     → "hash1|hash2|hash3|ev-001:CLAIM:claim-001|..."                    │
│                                                                           │
│  4. Compute SHA-256 hash                                                 │
│     → "a1b2c3d4e5f6..."                                                  │
│                                                                           │
│  Output:                                                                  │
│  evidenceSetHash: "a1b2c3d4e5f6..." (64 hex chars)                       │
│                                                                           │
│  Properties:                                                              │
│  • Deterministic (same input → same hash)                                │
│  • Tamper-evident (any change → different hash)                          │
│  • Snapshot versioning (compare hashes across exports)                   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
