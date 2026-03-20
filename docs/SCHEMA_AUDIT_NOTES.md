# Schema Audit Notes — General Release

**Date:** 2026-03-20

## Audit Table Inventory

The platform has 6+ audit table patterns. This documents their purpose and boundaries:

| Table | Purpose | Scope | Status |
|-------|---------|-------|--------|
| `audit_events` | GxP-compliant regulatory audit trail with signatures | Organization-scoped, immutable | **Primary — use for new features** |
| `audit_logs` | Simple tenant-scoped operational logs | Tenant-scoped (legacy `tenant_id` column) | Active, legacy naming |
| `audit_trail` | Blockchain-style audit with hash signatures | Entity-scoped | Active |
| `document_audit_trail` | Document lifecycle changes (create/edit/approve) | Organization + document scoped | Active |
| `document_audit_logs` | Workflow-specific document actions | Document-scoped (unified_workflow) | Active |
| `device_audit_trail` | Device-specific regulatory trail | Device-scoped | Active |
| `qmp_audit_trail` | Quality Management Process changes | Organization-scoped | Active |
| `proof_audit_logs` | Document proof/verification logs | Organization-scoped | Active |
| `regulatory_audit_logs` | Regulatory submission audit trail | Organization-scoped | Active |

### Recommendation
- **New features** should use `audit_events` (GxP-compliant, most complete)
- **Document workflows** should use `document_audit_trail`
- A future consolidation should merge `audit_logs` and `audit_trail` into `audit_events`

---

## Unused Schema Tables (91 tables)

The following tables are defined in schema but have **zero references** in server routes/services.
They should NOT be deleted before confirming they aren't needed for upcoming features.

### CDISC Reference (37 tables) — `shared/schema/cdisc-reference.ts`
All 37 tables are unused. These appear to be reference data tables for CDISC compliance
that were pre-built for future integration.

### Quality Control (6 tables) — `shared/schema/qc-schemas.ts`
All 6 tables unused: qcSpecifications, qcOosInvestigations, qcBatchReleases,
qcDeviations, qcMicrobiologicalTests, qcReferenceStandards.

### CSR Knowledge Database (28 of 31 tables) — `shared/schema/csr-knowledge-db.ts`
28 tables unused. Only csrEndpoints (4 refs), csrSections (3 refs), csrReferences (1 ref) are used.

### Regulatory Atoms (13 tables) — `shared/schema/regulatory-atoms.ts`
All 13 tables unused. Pre-built for knowledge graph extraction pipeline.

### Other Unused
- `vaultDocumentChunks`, `vaultEvidenceCitations` (vault.ts)
- `defensePackets` (defense-packets.ts)
- `documentAttachments` (unified_workflow.ts)

### Action Items
1. Gate CDISC tables behind a feature flag or move to a separate optional migration
2. Activate QC tables when QC module routes are implemented
3. CSR/regulatory atom tables should be activated when the extraction pipeline ships
4. Consider removing table definitions from the main schema bundle to reduce startup overhead

---

## Tenant Isolation Patterns

| Pattern | Type | Tables Using It |
|---------|------|----------------|
| `organizationId` (integer) | Standard | 33 tables (primary pattern) |
| `organizationId` (text) | Legacy | 4 tables in unified_workflow — **FIXED in migration 0007** |
| `tenantId` (integer) | Legacy | 1 table (audit_logs) |
| No isolation | Child tables | ~40 tables (depend on parent FK for scoping) |

**Standard:** All new tables MUST use `organizationId: integer('organization_id').notNull().references(() => organizations.id)`

---

## FK Delete Policy Status

- **851 total FK references** in schema.ts
- **81 have explicit `onDelete`** policies
- **Migration 0008** adds policies for critical paths (sessions, documents, supply chain, connectors)
- **Remaining ~770 FKs** use PostgreSQL default RESTRICT — safe but may need review per-table
