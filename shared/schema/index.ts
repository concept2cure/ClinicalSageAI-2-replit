/**
 * Schema Domain Index
 * 
 * This barrel file re-exports all schema domains for backward compatibility.
 * Import from '@shared/schema' or '../shared/schema' continues to work.
 * 
 * ARCHITECTURE:
 * - core.ts: organizations, users, sessions, projects (PLANNED)
 * - documents.ts: sharepoint_*, document_*, folders (PLANNED)
 * - regulatory.ts: cer_*, regulatory_*, ind_*, device_* (PLANNED)
 * - clinical.ts: csr_*, trials, protocols, biomarkers (PLANNED)
 * - ai.ts: rag_*, embeddings, knowledge_graph (PLANNED)
 * - compliance.ts: audit_*, compliance_*, validation (PLANNED)
 * - cdisc-reference.ts: 37 CDISC standard tables (DONE)
 * 
 * NOTE: This file is generated. The original schema.ts is preserved
 * at schema-legacy.ts during migration.
 */

// Re-export everything from the original monolithic schema
// This maintains backward compatibility for all existing imports
export * from '../schema';

// Domain-specific exports (for optimized imports)
// These allow consumers to import from specific domains:
// import { CDISC_TABLES } from '@shared/schema/cdisc-reference'
export { CDISC_TABLES, type CdiscTableName } from './cdisc-reference';
