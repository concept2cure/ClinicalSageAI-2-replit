/**
 * Schema Domain Index
 *
 * This barrel file re-exports all schema domains for backward compatibility.
 * Import from '@shared/schema' or '../shared/schema' continues to work.
 *
 * ARCHITECTURE:
 * - core.ts: organizations, users, sessions, projects (PLANNED — not yet extracted)
 * - documents.ts: sharepoint_*, document_*, folders (PLANNED — not yet extracted)
 * - regulatory.ts: cer_*, regulatory_*, ind_*, device_* (PLANNED — not yet extracted)
 * - clinical.ts: csr_*, trials, protocols, biomarkers (PLANNED — not yet extracted)
 * - ai.ts: rag_*, embeddings, knowledge_graph (PLANNED — not yet extracted)
 * - compliance.ts: audit_*, compliance_*, validation (PLANNED — not yet extracted)
 * - cdisc-reference.ts: 37 CDISC standard tables (DEFINED — no routes/services use these yet)
 * - qc-schemas.ts: 6 QC tables (DEFINED — no routes/services use these yet)
 * - vault.ts: vaultDocumentChunks, vaultEvidenceCitations (DEFINED — not wired to services)
 *
 * UNUSED TABLE AUDIT (2026-03-17):
 *   47 tables are defined in schema but have zero references in routes/services:
 *   - 37 CDISC reference tables (cdisc-reference.ts + schema.ts)
 *   - 6 QC tables (qc-schemas.ts)
 *   - 2 vault tables (vault.ts: vaultDocumentChunks, vaultEvidenceCitations)
 *   - 1 workflow table (unified_workflow.ts: documentAttachments)
 *   - 1 clinical table (schema.ts: pkpdCompartments)
 *   These tables have matching migrations but no active queries.
 *   They should either be activated with proper routes or removed to reduce schema bloat.
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
export { CSR_KNOWLEDGE_DB_TABLES, type CsrKnowledgeDbTableName } from './csr-knowledge-db';
export * from './regulatory-atoms';
export * from './api-keys';
export * from './ctd-projects';

// unified_workflow.ts: re-export everything EXCEPT names already in schema.ts
// Conflicts: documentComments, insertDocumentVersionSchema, DocumentVersion, InsertDocumentVersion
export {
  documentStatusEnum,
  workflowStatusEnum,
  approvalStatusEnum,
  approvalTypeEnum,
  moduleTypeEnum,
  unifiedDocuments,
  workflowDocumentVersions,
  moduleDocuments,
  documentAuditLogs,
  workflowTemplates,
  workflowSteps,
  documentWorkflows,
  workflowApprovals,
  workflowHistory,
  documentAttachments,
  unifiedDocumentsRelations,
  workflowDocumentVersionsRelations,
  moduleDocumentsRelations,
  workflowTemplatesRelations,
  workflowStepsRelations,
  documentWorkflowsRelations,
  workflowApprovalsRelations,
  workflowHistoryRelations,
  documentAttachmentsRelations,
  documentCommentsRelations,
  insertUnifiedDocumentSchema,
  insertModuleDocumentSchema,
  insertWorkflowTemplateSchema,
  insertWorkflowStepSchema,
  insertDocumentWorkflowSchema,
  insertWorkflowApprovalSchema,
} from './unified_workflow';
export type {
  UnifiedDocument,
  InsertUnifiedDocument,
  ModuleDocument,
  InsertModuleDocument,
  WorkflowTemplate,
  InsertWorkflowTemplate,
  WorkflowStep,
  InsertWorkflowStep,
  DocumentWorkflow,
  InsertDocumentWorkflow,
  WorkflowApproval,
  InsertWorkflowApproval,
} from './unified_workflow';

export * from './support-admin';

// orchestration.ts: re-export everything EXCEPT EvidenceSource (already in schema.ts)
export {
  workflowRunStatusEnum,
  workflowStepStatusEnum,
  approvalGateTypeEnum,
  triggerSourceEnum,
  actorTypeEnum,
  evidenceClassEnum,
  confidenceLevelEnum,
  readinessRuleTypeEnum,
  workflowRuns,
  approvalCheckpoints,
  readinessRules,
  readinessEvaluations,
  projectIntelligenceSummaries,
  workflowRunsRelations,
  approvalCheckpointsRelations,
  readinessEvaluationsRelations,
  insertWorkflowRunSchema,
  insertApprovalCheckpointSchema,
  insertReadinessRuleSchema,
  insertReadinessEvaluationSchema,
  insertProjectIntelligenceSummarySchema,
} from './orchestration';
export type {
  WorkflowStepRecord,
  TouchedObject,
  CreatedOutput,
  WorkflowBlocker,
  ApprovalRecord,
  DiffSummary,
  DiffChange,
  EvidencedRecommendation,
  ReadinessFinding,
  IntelligenceBlocker,
  IntelligenceChange,
  IntelligenceDecision,
  IntelligenceRisk,
  ReadinessSnapshot,
  WorkflowOutcome,
  WorkflowRun,
  InsertWorkflowRun,
  ApprovalCheckpoint,
  InsertApprovalCheckpoint,
  ReadinessRule,
  InsertReadinessRule,
  ReadinessEvaluation,
  InsertReadinessEvaluation,
  ProjectIntelligenceSummary,
  InsertProjectIntelligenceSummary,
} from './orchestration';

export * from './resolution';
export * from './project-charter';
