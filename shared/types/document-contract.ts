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
