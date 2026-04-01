/**
 * Canonical Document Action Contract — shared across all generation paths.
 *
 * LAW 1: All meaningful AI work must follow:
 * Intent -> Orchestration -> Governed Artifact -> Editor -> Project/Dossier Context -> Lifecycle -> Audit/Provenance
 *
 * LAW 3: No preview-only generation. No export-only generation.
 * Every generation MUST produce a governed artifact.
 */

// ─── Source systems that can produce governed artifacts ──────────────────────

export type ArtifactSourceSystem =
  | 'ana_ri'
  | 'cerv2_510k'
  | 'cerv2_pma'
  | 'cerv2_cer'
  | 'authoring_actions'
  | 'document_builder'
  | 'report_engine'
  | 'safety_narrative'
  | 'ectd_compiler'
  | 'cmc_builder'
  | 'ind_autodraft';

// ─── Artifact lifecycle states ─────────────────────────────────────────────

export type ArtifactStatus = 'draft' | 'review' | 'approved' | 'locked' | 'archived';

// ─── The Canonical Document Action Contract ─────────────────────────────────

export interface CanonicalDocumentContract {
  /** What kind of document is being created (e.g. 'cerv2_510k', 'risk_memo', 'clinical_overview') */
  documentType: string;
  /** Project this artifact belongs to (required — no orphan artifacts) */
  projectId: number;
  /** Tenant isolation (required for multi-tenant) */
  organizationId: number;
  /** Which system produced this artifact */
  sourceSystem: ArtifactSourceSystem;
  /** The active intent lens (e.g. 'regulatory_strategy', 'compliance_check') */
  intentLens: string;
  /** User role for audit trail */
  userRole: string;
  /** The artifact content (markdown or structured) */
  content: string;
  /** Structured sections present in content */
  structuredSections: string[];
  /** Optional metadata tags for search/filter */
  metadataTags?: Record<string, string>;
  /** Provenance chain — who generated this, when, how */
  provenance: ArtifactProvenance;
  /** Version number (starts at 1, incremented on amend) */
  version: number;
  /** Lifecycle status */
  status: ArtifactStatus;
  /** Optional CTD section code (e.g. '2.5', '3.2.S') */
  ctdSection?: string;
  /** Optional artifact title */
  title?: string;
}

/**
 * Platform-Law Contract (2026-03 consolidation sprint).
 *
 * This interface intentionally mirrors the sprint-level fields required to
 * eliminate competing centers of truth across server routes, services, and UI
 * surfaces. It is additive (non-breaking) to the legacy CanonicalDocumentContract.
 */
export interface GovernedDocumentActionContract {
  projectId: number;
  artifactId: number | null;
  documentType: string;
  originSurface:
    | 'project_workspace_shell'
    | 'editor_panel'
    | 'api_route'
    | 'ai_orchestrator'
    | 'import_pipeline'
    | 'system'
    | 'ri_copilot'
    | 'ectd_coauthor'
    | 'ind_workspace'
    | 'cmc_workspace'
    | 'cerv2_device';
  generationMode: 'manual' | 'ai_assisted' | 'ai_generated' | 'imported' | 'amendment';
  lifecycleStatus: ArtifactStatus | 'in_review' | 'published' | 'superseded';
  clientTrack: 'biotech' | 'device' | 'diagnostics';
  submissionProgram: 'ind' | 'ectd' | '510k' | 'pma' | 'cer' | 'ivdr' | 'general_ri';
  persona: 'regulatory' | 'medical_writer' | 'cmc' | 'clinical' | 'qa' | 'executive' | 'cro';
  regulatorScope: 'fda' | 'ema' | 'mhra' | 'hc' | 'pmda' | 'multi';
  evidenceMode: 'csr' | 'literature' | 'predicate' | 'cmc_source' | 'test_data' | 'mixed';
  documentClass:
    | 'strategy_memo'
    | 'evidence_memo'
    | 'section_draft'
    | 'module3_output'
    | 'submission_component'
    | 'audit_report'
    | 'comparator_summary'
    | 'risk_benefit'
    | 'protocol_rationale'
    | 'regional_differences'
    | 'safety_evidence_brief'
    | 'endpoint_justification';
  readinessGate: 'exploratory' | 'internal_review' | 'submission_candidate' | 'inspection_ready';
  approvalPathType: 'single_reviewer' | 'regulated_dual_review' | 'qa_lock' | 'signoff_required';
  recommendationSource:
    | 'ana_ri'
    | 'cmc_builder'
    | 'cerv2_510k'
    | 'cerv2_pma'
    | 'cerv2_cer'
    | 'ectd_compiler'
    | 'ind_autodraft'
    | 'report_engine';
  workspaceTarget: 'project' | 'dossier' | 'vault';
  dossierContainerId?: string;
  artifactContainerId?: string;
  regulatorIntent:
    | 'submission_authoring'
    | 'evidence_analysis'
    | 'strategy'
    | 'comparison'
    | 'qa_review'
    | 'inspection_support';
  editorPayload: {
    title: string;
    content: string;
    ctdSection?: string;
    reviewerIds?: string[];
  };
  placementTarget: {
    workspace: 'project' | 'dossier' | 'vault';
    containerId: string;
    sectionKey?: string;
  };
  provenancePayload: {
    generatedAt: string;
    generatedBy: string;
    provider?: string;
    model?: string;
    runId?: string;
    sourceRefs?: string[];
  };
  auditEventPayload: {
    eventType:
      | 'artifact.created'
      | 'artifact.updated'
      | 'artifact.versioned'
      | 'artifact.reviewed'
      | 'artifact.exported'
      | 'artifact.generated.ai';
    actorId: string;
    actorRole?: string;
    at: string;
    metadata?: Record<string, unknown>;
  };
  exportEligibility: {
    allowed: boolean;
    reason?: string;
    gateChecks?: Array<{ name: string; passed: boolean; detail?: string }>;
    blockingReasons?: string[];
    readinessOutcome?: 'blocked' | 'conditional' | 'ready';
  };
}

export interface ArtifactProvenance {
  generatedAt: string;
  generatedBy: string;
  aiProvider: string;
  aiModel: string;
  conversationContext: number;
  qualityGrade: string;
  evidenceLabels: number;
  /** Run ID for tracing */
  runId?: string;
}

// ─── Generation Guard ────────────────────────────────────────────────────────

export interface GenerationGuardResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that a document contract meets minimum quality gates before persistence.
 * Called by all generation paths before saving an artifact.
 *
 * If this fails, the generation should either:
 * - Reject the save entirely (fail closed)
 * - Mark the artifact as low-confidence draft with warnings
 */
export function validateDocumentContract(contract: CanonicalDocumentContract): GenerationGuardResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!contract.projectId) errors.push('projectId is required — no orphan artifacts');
  if (!contract.organizationId) errors.push('organizationId is required — tenant isolation');
  if (!contract.documentType) errors.push('documentType is required');
  if (!contract.sourceSystem) errors.push('sourceSystem is required');
  if (!contract.content) errors.push('content is required — no empty artifacts');
  if (!contract.intentLens) errors.push('intentLens is required');
  if (!contract.userRole) errors.push('userRole is required');

  // Content quality gates
  if (contract.content) {
    if (contract.content.length < 100) {
      errors.push('Content too short (< 100 chars) — likely placeholder');
    }
    // Check for placeholder/filler text
    const fillerPatterns = [
      /\[insert\s/i,
      /\[placeholder\]/i,
      /lorem ipsum/i,
      /coming soon/i,
      /\[todo\]/i,
      /\[tbd\]/i,
    ];
    for (const pattern of fillerPatterns) {
      if (pattern.test(contract.content)) {
        warnings.push(`Content contains filler text matching: ${pattern.source}`);
      }
    }
  }

  // Structured sections check
  if (!contract.structuredSections || contract.structuredSections.length === 0) {
    warnings.push('No structured sections detected — content may lack structure');
  }

  // Provenance completeness
  if (!contract.provenance?.generatedAt) errors.push('provenance.generatedAt is required');
  if (!contract.provenance?.generatedBy) errors.push('provenance.generatedBy is required');
  if (!contract.provenance?.aiProvider) warnings.push('provenance.aiProvider is missing');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateGovernedDocumentActionContract(
  contract: GovernedDocumentActionContract
): GenerationGuardResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!contract.projectId) errors.push('projectId is required');
  if (!contract.documentType) errors.push('documentType is required');
  if (!contract.originSurface) errors.push('originSurface is required');
  if (!contract.generationMode) errors.push('generationMode is required');
  if (!contract.lifecycleStatus) errors.push('lifecycleStatus is required');
  if (!contract.clientTrack) errors.push('clientTrack is required');
  if (!contract.submissionProgram) errors.push('submissionProgram is required');
  if (!contract.persona) errors.push('persona is required');
  if (!contract.regulatorScope) errors.push('regulatorScope is required');
  if (!contract.evidenceMode) errors.push('evidenceMode is required');
  if (!contract.documentClass) errors.push('documentClass is required');
  if (!contract.readinessGate) errors.push('readinessGate is required');
  if (!contract.approvalPathType) errors.push('approvalPathType is required');
  if (!contract.recommendationSource) errors.push('recommendationSource is required');
  if (!contract.workspaceTarget) errors.push('workspaceTarget is required');
  if (!contract.regulatorIntent) errors.push('regulatorIntent is required');
  if (!contract.editorPayload?.title) errors.push('editorPayload.title is required');
  if (!contract.editorPayload?.content) errors.push('editorPayload.content is required');
  if (!contract.placementTarget?.workspace) errors.push('placementTarget.workspace is required');
  if (!contract.placementTarget?.containerId) errors.push('placementTarget.containerId is required');
  if (!contract.provenancePayload?.generatedAt) errors.push('provenancePayload.generatedAt is required');
  if (!contract.provenancePayload?.generatedBy) errors.push('provenancePayload.generatedBy is required');
  if (!contract.auditEventPayload?.eventType) errors.push('auditEventPayload.eventType is required');
  if (!contract.auditEventPayload?.actorId) errors.push('auditEventPayload.actorId is required');

  if (contract.workspaceTarget !== contract.placementTarget.workspace) {
    errors.push('workspaceTarget must match placementTarget.workspace');
  }

  if (contract.workspaceTarget === 'dossier' && !contract.dossierContainerId) {
    errors.push('dossierContainerId is required when workspaceTarget=dossier');
  }

  if (contract.workspaceTarget === 'vault' && !contract.artifactContainerId) {
    errors.push('artifactContainerId is required when workspaceTarget=vault');
  }

  if (contract.documentClass === 'section_draft' && !contract.editorPayload.ctdSection) {
    warnings.push('section_draft should include editorPayload.ctdSection');
  }

  if (contract.documentClass === 'module3_output') {
    const ctd = contract.editorPayload.ctdSection || '';
    if (!ctd.startsWith('3.')) {
      errors.push('module3_output requires ctdSection mapping under section 3.x');
    }
    if (!contract.provenancePayload?.sourceRefs?.length) {
      errors.push('module3_output requires provenancePayload.sourceRefs');
    }
  }

  if (
    contract.submissionProgram === '510k' &&
    contract.documentClass === 'submission_component' &&
    contract.evidenceMode === 'predicate' &&
    !contract.provenancePayload?.sourceRefs?.length
  ) {
    errors.push('510k submission_component with predicate evidence requires sourceRefs context');
  }

  if (contract.evidenceMode === 'predicate' && contract.clientTrack !== 'device') {
    warnings.push('predicate evidence mode is typically restricted to device track');
  }

  if (contract.documentClass === 'audit_report' && !contract.artifactId) {
    warnings.push('audit_report should be linked to a source artifactId');
  }

  if (contract.readinessGate === 'inspection_ready') {
    if (!contract.provenancePayload.provider || !contract.provenancePayload.model) {
      errors.push('inspection_ready requires provenancePayload provider and model');
    }
    if (
      !['regulated_dual_review', 'qa_lock', 'signoff_required'].includes(contract.approvalPathType)
    ) {
      errors.push('inspection_ready requires stronger approvalPathType');
    }
  }

  if (contract.exportEligibility.allowed && contract.lifecycleStatus === 'draft') {
    warnings.push('draft artifacts marked export-eligible should be explicitly justified');
  }

  if (
    contract.readinessGate === 'submission_candidate' &&
    contract.workspaceTarget !== 'dossier' &&
    contract.documentClass !== 'strategy_memo'
  ) {
    warnings.push('submission_candidate artifacts should generally be placed in dossier workspace');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
