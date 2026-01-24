/**
 * Schema Domain Index
 * 
 * This barrel file re-exports all schema domains for backward compatibility.
 * Import from '@shared/schema' or '../shared/schema' continues to work.
 * 
 * ARCHITECTURE:
 * - core.ts: organizations, users, sessions, projects
 * - documents.ts: sharepoint_*, document_*, folders
 * - regulatory.ts: cer_*, regulatory_*, ind_*, device_*
 * - clinical.ts: csr_*, trials, protocols, biomarkers
 * - ai.ts: rag_*, embeddings, knowledge_graph
 * - compliance.ts: audit_*, compliance_*, validation
 * - reference.ts: cdisc_* (37 read-only reference tables)
 * 
 * NOTE: This file is generated. The original schema.ts is preserved
 * at schema-legacy.ts during migration.
 */

// Re-export everything from the original monolithic schema
// TODO: After migration complete, change this to re-export from domain files
export * from '../schema';
