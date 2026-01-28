// Roadmap Step 1.6: Audit log schema
// Re-export canonical definitions to match roadmap pathing without duplication.

export { auditTrail, insertAuditTrailSchema } from '../../shared/schema';
export type { AuditTrailEntry, InsertAuditTrailEntry } from '../../shared/schema';
