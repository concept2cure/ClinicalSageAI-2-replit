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
 * - cdisc-reference.ts: 5 CDISC PRM tables (ACTIVE — study-design spine; ~32 unused dropped in #846)
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
export * from './canonical_documents';

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

// AnA Intelligence System (CLAUDE.md Memory Compression Model)
export * from './ana-intelligence';

// AnA Relational Profiles (self-developed per-user/per-project personality)
export * from './ana-relational';

// External Intelligence (nightly regulatory + study-methodology monitoring)
export * from './external-intelligence';

export * from './report-os';

// Programs & Evidence
export {
  regulatoryPrograms,
  evidenceObjects,
  evidenceLinks,
  programMilestones,
  programActivityLog,
  regulatoryProgramsRelations,
  evidenceObjectsRelations,
  evidenceLinksRelations,
  programMilestonesRelations,
  programActivityLogRelations,
  insertRegulatoryProgramSchema,
  insertEvidenceObjectSchema,
  insertEvidenceLinkSchema,
  insertProgramMilestoneSchema,
} from './programs';
export type {
  RegulatoryProgram,
  InsertRegulatoryProgram,
  EvidenceObject,
  InsertEvidenceObject,
  EvidenceLink,
  InsertEvidenceLink,
  ProgramMilestone,
  InsertProgramMilestone,
} from './programs';

// CMC Operating System tables (PR #352)
export * from './cmc-os';

// Standards Applicability — per-program decision linking regulatory_programs
// to the canonical device_test_standards catalog. evidence_claims and
// device_test_standards have been EXTENDED with governance fields in the
// canonical shared/schema.ts (see migration 20260429_regulatory_graph.sql).
export {
  standardsApplicability,
  standardsApplicabilityRelations,
  insertStandardsApplicabilitySchema,
} from './regulatory-graph';
export type {
  StandardsApplicability,
  InsertStandardsApplicability,
} from './regulatory-graph';

// Reviewer Simulation Runs — persisted red-team output (one row per run).
export {
  reviewerSimulationRuns,
  reviewerSimulationRunsRelations,
  insertReviewerSimulationRunSchema,
} from './reviewer-simulation';
export type {
  ReviewerSimulationRun,
  InsertReviewerSimulationRun,
} from './reviewer-simulation';

// PDEV → IND Workflow — per-program activity state + readiness snapshots
// See PDEV_IND_WORKFLOW_AUDIT.md (repo root) for the audit that justifies
// these tables existing alongside the existing IND / regulatory primitives.
export {
  pdevProgramActivities,
  pdevReadinessSnapshots,
  pdevProgramActivitiesRelations,
  pdevReadinessSnapshotsRelations,
  insertPdevProgramActivitySchema,
  insertPdevReadinessSnapshotSchema,
} from './pdev-workflow';

// Organization Lifecycle — beta self-serve trial state machine.
// See /root/.claude/plans/mossy-dancing-dusk.md (Track A) for the rationale.
// State map lives in shared/schema/org-lifecycle.ts; transition service is
// server/services/lifecycle/org-lifecycle.ts.
export {
  orgLifecycleState,
  orgLifecycleStateHistory,
  orgLifecycleStateRelations,
  orgLifecycleStateHistoryRelations,
  insertOrgLifecycleStateSchema,
  insertOrgLifecycleStateHistorySchema,
  ORG_LIFECYCLE_STATES,
  ORG_LIFECYCLE_TRANSITIONS,
  ORG_LIFECYCLE_PRODUCTIVE_STATES,
  ORG_LIFECYCLE_TRIGGERS,
} from './org-lifecycle';
export type {
  OrgLifecycleState,
  OrgLifecycleStateRow,
  OrgLifecycleStateHistoryRow,
  InsertOrgLifecycleState,
  InsertOrgLifecycleStateHistory,
  OrgLifecycleTrigger,
} from './org-lifecycle';
export type {
  PdevProgramActivity,
  PdevReadinessSnapshot,
  PdevReadinessFinding,
  InsertPdevProgramActivity,
  InsertPdevReadinessSnapshot,
} from './pdev-workflow';

// AI/ML Predetermined Change Control Plan (PCCP)
export {
  aiMlPccpPlans,
  aiMlModifications,
  aiMlPccpPlansRelations,
  aiMlModificationsRelations,
  insertAiMlPccpPlanSchema,
  insertAiMlModificationSchema,
} from './ai-ml-pccp';
export type {
  AiMlPccpPlan,
  InsertAiMlPccpPlan,
  AiMlModification,
  InsertAiMlModification,
} from './ai-ml-pccp';

// GSPR (EU MDR / IVDR Annex I) + Post-Market documents
export {
  gsprRequirements,
  gsprProgramMappings,
  postMarketDocuments,
  gsprRequirementsRelations,
  gsprProgramMappingsRelations,
  postMarketDocumentsRelations,
  insertGsprRequirementSchema,
  insertGsprProgramMappingSchema,
  insertPostMarketDocumentSchema,
  pmcfEnrollmentRecords,
  insertPmcfEnrollmentRecordSchema,
  PMCF_ACTIVITY_KINDS,
  PMCF_ACTIVITY_STATUSES,
} from './gspr-postmarket';
export type {
  GsprRequirement,
  InsertGsprRequirement,
  GsprProgramMapping,
  InsertGsprProgramMapping,
  PostMarketDocument,
  InsertPostMarketDocument,
  PostMarketDocumentType,
  PmcfEnrollmentRecord,
  InsertPmcfEnrollmentRecord,
  PmcfActivityKind,
  PmcfActivityStatus,
} from './gspr-postmarket';

// Evidence Sufficiency Assessments — PMA / De Novo / 510(k) approval-readiness
export {
  evidenceSufficiencyAssessments,
  evidenceSufficiencyAssessmentsRelations,
  insertEvidenceSufficiencyAssessmentSchema,
} from './evidence-sufficiency';
export type {
  EvidenceSufficiencyAssessment,
  InsertEvidenceSufficiencyAssessment,
  EvidenceSufficiencyVerdict,
  SubmissionPathway,
} from './evidence-sufficiency';

// Q-Submission program (Pre-Sub / SIR / SRD / Agreement / Informational)
export {
  qSubmissions,
  qSubMeetings,
  qSubQuestions,
  qSubCommitments,
  qSubTimelineEntries,
  qSubmissionsRelations,
  qSubMeetingsRelations,
  qSubQuestionsRelations,
  qSubCommitmentsRelations,
  qSubTimelineRelations,
  insertQSubmissionSchema,
  insertQSubQuestionSchema,
  insertQSubCommitmentSchema,
  Q_SUB_TYPES,
  Q_SUB_STAGES,
  QUESTION_STATUSES,
  DOSSIER_LINK_KINDS,
} from './q-sub';
export type {
  QSubmission,
  QSubMeeting,
  QSubQuestion,
  QSubCommitment,
  QSubTimelineEntry,
} from './q-sub';

// CAPA + complaint + MDR/vigilance triage (MDX_DESIGN_BACKLOG.md Wave 1 #8)
export {
  complaints,
  mdrEvents,
  capaRecords,
  capaActions,
  vigilanceEvents,
  complaintsRelations,
  mdrEventsRelations,
  capaRecordsRelations,
  capaActionsRelations,
  insertComplaintSchema,
  insertMdrEventSchema,
  insertCapaRecordSchema,
  insertCapaActionSchema,
  insertVigilanceEventSchema,
  COMPLAINT_SOURCES,
  COMPLAINT_CHANNELS,
  HARM_LEVELS,
  SEVERITY_LEVELS,
  COMPLAINT_STATES,
  MDR_JURISDICTIONS,
  FDA_MDR_REPORT_TYPES,
  EU_MDR_SEVERITY,
  MDR_STATES,
  CAPA_TYPES,
  CAPA_SOURCES,
  RISK_LEVELS,
  CAPA_STATES,
  ACTION_STATES,
  ACTION_TYPES,
  VIGILANCE_EVENT_KINDS,
} from './capa-mdr';
export type {
  Complaint,
  InsertComplaint,
  MdrEvent,
  InsertMdrEvent,
  CapaRecord,
  InsertCapaRecord,
  CapaAction,
  InsertCapaAction,
  VigilanceEvent,
  InsertVigilanceEvent,
  ComplaintSource,
  ComplaintChannel,
  HarmLevel,
  SeverityLevel,
  ComplaintState,
  MdrJurisdiction,
  FdaMdrReportType,
  EuMdrSeverity,
  MdrState,
  CapaType,
  CapaSource,
  RiskLevel,
  CapaState,
  ActionState,
  ActionType,
  VigilanceEventKind,
} from './capa-mdr';

// Living Record Spine — the canonical fact store, derived-value bindings, drift
// sentinel output, the eCTD sequence node, and the graph overlay. The value
// layer underneath the existing living-file cascade.
// See docs/architecture/LIVING_RECORD_SPINE.md.
export * from './living-record-spine';

// IND master data — sponsor, US agent (21 CFR 312.3) and investigator
// registries that feed FDA Forms 1571/1572/3674 and submission metadata.
// Service: server/services/ind-master-data; migration: migrations/20260609_ind_master_data.sql.
export * from './ind-master-data';

// IND dispatch-readiness snapshots — auditable point-in-time go/no-go records.
// Service: server/services/ind-lifecycle/ind-dispatch-snapshot-service;
// migration: migrations/20260610_ind_dispatch_snapshots.sql.
export * from './ind-dispatch-snapshots';

// IND cross-references — external files (DMF/IND/NDA/BLA) an IND depends on (m1.4).
// Service: server/services/ind-lifecycle/ind-cross-reference-persistence;
// migration: migrations/20260614_ind_cross_references.sql.
export * from './ind-cross-references';

// IND safety reports — durable 312.32 expedited-report drafts (draft → filed).
// Service: server/services/ind-lifecycle/ind-safety-report-persistence;
// migration: migrations/20260614_ind_safety_reports.sql.
export * from './ind-safety-reports';

// IND annual reports — durable 312.33 annual-report / DSUR drafts (draft → filed).
// Service: server/services/ind-lifecycle/ind-annual-report-persistence;
// migration: migrations/20260615_ind_annual_reports.sql.
export * from './ind-annual-reports';

// IND amendments — durable 312.30/.31 amendment-plan drafts (draft → filed).
// Service: server/services/ind-lifecycle/ind-amendment-persistence;
// migration: migrations/20260615_ind_amendments.sql.
export * from './ind-amendments';

// IND ICSR transmissions — durable E2B(R3) safety-message records (prepared →
// transmitted → acknowledged). Service: ind-icsr-transmission-persistence;
// migration: migrations/20260615_ind_icsr_transmissions.sql.
export * from './ind-icsr-transmissions';

// Regulatory assessments — durable RI/CDISC/eTMF verdict snapshots per program.
// Service: regulatory-assessments/regulatory-assessment-persistence;
// migration: migrations/20260615_regulatory_assessments.sql.
export * from './regulatory-assessments';

// TMF artifact filings — durable per-trial log of filed reference-model artifact
// codes (powers the code-based completeness checker; distinct from etmf.ts).
// Service: etmf/tmf-artifact-persistence;
// migration: migrations/20260615_tmf_artifact_filings.sql.
export * from './tmf-artifacts';

// Clinical investigator financial disclosure — 21 CFR 54 (C2C-01) + the generic
// ALCOA+ provenance spine seed (C2C-02). Forms FDA 3454/3455 → Module 1.
// Service: server/services/financial-disclosures; migration: migrations/20260610_financial_disclosure_21cfr54.sql.
export * from './financial-disclosures';

// HA interaction & commitment management (C2C-03): agency meetings (Pre-IND/
// EOP2/pre-NDA) → questions → commitments (PMR/PMC/REMS) → fulfillment, threaded
// onto the provenance spine. Service: server/services/ha-interactions;
// migration: migrations/20260610_ha_interactions_commitments.sql.
export * from './ha-interactions';

// IACUC / animal study governance (C2C-05): animal-use protocols, census,
// committee review/determinations, amendments, semi-annual facility inspections.
// Origin node of the preclinical provenance chain (→ Module 4). PHS Policy / AWA
// / OLAW; USDA pain categories B-E. Service: server/services/iacuc;
// migration: migrations/20260610_iacuc_animal_governance.sql.
export * from './iacuc';

// IRB / IEC submission & amendment management (C2C-06): human-subjects ethics
// review, sIRB multi-site coordination, informed consent, determinations,
// amendments, reportable events. Threads ethics approval → Module 5. Common Rule
// (45 CFR 46), 21 CFR 56, ICH E6. Service: server/services/irb;
// migration: migrations/20260610_irb_submissions.sql.
export * from './irb';

// IBC / biosafety (C2C-07): recombinant/synthetic nucleic acid registrations,
// biological agents (risk groups RG1-4), containment (BSL-1..4) and committee
// determinations — clearance for modality-heavy CGT/mRNA programs. NIH Guidelines
// / BMBL. Service: server/services/ibc;
// migration: migrations/20260610_ibc_biosafety.sql.
export * from './ibc';

// Nonclinical study management + SEND (C2C-04): governed, submission-linked tox/
// pharmacology study registry + CDISC SEND dataset packaging, threading
// IACUC → study → Module 4. ICH M4/S-series; SENDIG. Service: server/services/
// nonclinical; migration: migrations/20260610_nonclinical_send.sql.
export * from './nonclinical';

// eGrants / funder-milestone management (C2C-14): sponsored-programs grant
// lifecycle — opportunities (pre-award) → proposals → awards (post-award) →
// milestones/reporting → sponsor invoicing. 2 CFR 200; SBIR/STTR; NIH RPPR.
// Service: server/services/grants; migration: migrations/20260610_egrants.sql.
export * from './grants';

// RIM-lite — registration grid + labeling (C2C-12): product registry, product ×
// country registration status grid (renewals), and label versions (USPI/SmPC/PIL/
// CCDS). FDA 21 CFR 201; EU Directive 2001/83/EC. Service: server/services/rim;
// migration: migrations/20260610_rim_lite.sql.
export * from './rim';

// Inspection readiness (C2C-13): BIMO/PAI inspections, Form 483 observations +
// responses (15-business-day clock), per-area readiness. FDA BIMO/PAI; EMA GCP/
// GMP. Service: server/services/inspection; migration: migrations/20260610_inspection_readiness.sql.
export * from './inspection';

// Controlled substances tracking (C2C-15): DEA registrations, controlled-
// substance inventory, perpetual transaction ledger. CSA / 21 CFR 1300s.
// Service: server/services/controlled-substances; migration: migrations/20260610_controlled_substances.sql.
export * from './controlled-substances';

// Lifecycle obligation tracking (C2C-11): post-approval recurring-obligation
// engine — variations (IA/IB/II), supplements (PAS/CBE), periodic reports (PSUR
// cadence), pediatric (PREA/PIP), renewals. EU Reg 1234/2008; 21 CFR 314.70;
// ICH E2C. Service: server/services/lifecycle-obligations; migration:
// migrations/20260610_lifecycle_obligations.sql.
export * from './lifecycle';

// AI-native eTMF (C2C-08): Trial Master File against the DIA TMF Reference Model
// — per-study container + classified artifacts + completeness gap-check feeding
// inspection readiness. ICH E6(R2) §8. Service: server/services/etmf; migration:
// migrations/20260610_etmf.sql.
export * from './etmf';

// Research-compliance shared foundation: personnel roster + training/clearance
// records that gate committee approvals ("no index until trained"), feeding the
// compliance-checklist reasoning engine. Service: server/services/research-
// compliance; migration: migrations/20260611_research_compliance.sql.
export * from './research-compliance';

// Effort certification (add-on): per-person per-period committed-vs-actual effort
// across awards; total <= 100%; deviation triggers recertification. 2 CFR 200.430.
export * from './effort-certification';

// Research security / COI-FCOI disclosure (add-on; NOT-OD-26-017 / NSPM-33):
// outside activities, foreign appointments/support, financial interests + review.
export * from './research-security';

// eSTAR client registration: one row per org recording the FDA eSTAR
// prerequisites (ESG / CDRH portal / org identity / MDUFA fee) a client holds.
// Service: server/services/pathway-engines/estar/estar-registration-service.ts;
// migration: migrations/20260730_estar_registration.sql.
export * from './estar-registration';

// eSTAR submission tracking: program-agnostic filing-tracking spine (status +
// review clock) for any catalog key. Service: estar-submission-service.ts;
// migration: migrations/20260730_estar_submission.sql.
export * from './estar-submission';

// Document span lineage: which CHARACTERS of a document came from which Data
// Room source, and how that source was used. The span-grained counterpart to
// authoring_citations (section-grained), anchored to the same canonical
// cre_evidence_sources identity via source/reference_id/payload_sha256.
// Migration: db/migrations/20260803_document_span_lineage.sql.
export * from './document-span-lineage';
