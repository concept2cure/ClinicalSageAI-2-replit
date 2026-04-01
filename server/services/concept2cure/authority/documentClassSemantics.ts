import type { GovernedDocumentActionContract } from '../../../../shared/types/document-contract';

type DocumentClass = GovernedDocumentActionContract['documentClass'];
type ClientTrack = GovernedDocumentActionContract['clientTrack'];
type SubmissionProgram = GovernedDocumentActionContract['submissionProgram'];
type EvidenceMode = GovernedDocumentActionContract['evidenceMode'];
type WorkspaceTarget = GovernedDocumentActionContract['workspaceTarget'];
type ReadinessGate = GovernedDocumentActionContract['readinessGate'];
type ApprovalPathType = GovernedDocumentActionContract['approvalPathType'];
type OriginSurface = GovernedDocumentActionContract['originSurface'];

export interface DocumentClassSemantics {
  key: DocumentClass;
  label: string;
  allowedClientTracks: ClientTrack[];
  allowedSubmissionPrograms: SubmissionProgram[];
  requiredEvidenceModes: EvidenceMode[];
  suggestedPlacement: WorkspaceTarget;
  suggestedReadinessGate: ReadinessGate;
  defaultApprovalPath: ApprovalPathType;
  requiredStructureSections: string[];
  requiredProvenanceMinima: Array<'generatedAt' | 'generatedBy' | 'sourceRefs' | 'provider_model'>;
  requiredPlacementMinima: Array<'containerId' | 'dossierContainerId' | 'artifactContainerId' | 'ctdSection'>;
  exportGateExpectations: string[];
  allowedOriginSurfaces: OriginSurface[];
  recommendedTitlePattern: string;
  recommendedMetadataTags: string[];
}

export const DOCUMENT_CLASS_SEMANTICS: Record<DocumentClass, DocumentClassSemantics> = {
  strategy_memo: {
    key: 'strategy_memo',
    label: 'Regulatory Strategy Memorandum',
    allowedClientTracks: ['biotech', 'device', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['mixed', 'literature', 'test_data'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'single_reviewer',
    requiredStructureSections: ['objective', 'regulatory_context', 'strategy_options', 'recommendation'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['placement_present', 'regulator_scope_declared'],
    allowedOriginSurfaces: [
      'ri_copilot',
      'editor_panel',
      'project_workspace_shell',
      'api_route',
      'ai_orchestrator',
      'system',
    ],
    recommendedTitlePattern: 'Regulatory Strategy Memo - {program|scope} - {date}',
    recommendedMetadataTags: ['strategy', 'regulatory'],
  },
  evidence_memo: {
    key: 'evidence_memo',
    label: 'Evidence Memo',
    allowedClientTracks: ['biotech', 'device', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['csr', 'literature', 'test_data', 'mixed', 'predicate'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'single_reviewer',
    requiredStructureSections: ['evidence_basis', 'known', 'inferred', 'missing'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['evidence_present', 'evidence_classification_present', 'source_refs_present'],
    allowedOriginSurfaces: [
      'ri_copilot',
      'editor_panel',
      'project_workspace_shell',
      'api_route',
      'ai_orchestrator',
      'system',
    ],
    recommendedTitlePattern: 'Evidence Memo - {topic} - {date}',
    recommendedMetadataTags: ['evidence', 'known-inferred-missing'],
  },
  section_draft: {
    key: 'section_draft',
    label: 'CTD Section Draft',
    allowedClientTracks: ['biotech'],
    allowedSubmissionPrograms: ['ind', 'ectd'],
    requiredEvidenceModes: ['mixed', 'csr', 'literature', 'cmc_source', 'test_data'],
    suggestedPlacement: 'dossier',
    suggestedReadinessGate: 'submission_candidate',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['section_scope', 'draft_content', 'open_gaps'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId', 'dossierContainerId', 'ctdSection'],
    exportGateExpectations: ['ctd_section_present', 'dossier_placement_satisfied'],
    allowedOriginSurfaces: ['ectd_coauthor', 'ind_workspace', 'editor_panel', 'api_route'],
    recommendedTitlePattern: 'CTD {ctdSection} Draft - {topic}',
    recommendedMetadataTags: ['ctd', 'section-draft'],
  },
  module3_output: {
    key: 'module3_output',
    label: 'Module 3 Output',
    allowedClientTracks: ['biotech'],
    allowedSubmissionPrograms: ['ind', 'ectd'],
    requiredEvidenceModes: ['cmc_source', 'mixed'],
    suggestedPlacement: 'dossier',
    suggestedReadinessGate: 'submission_candidate',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['materials', 'methods', 'controls', 'source_mapping'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId', 'dossierContainerId', 'ctdSection'],
    exportGateExpectations: ['module_mapping_present', 'source_refs_present', 'ctd_section_present'],
    allowedOriginSurfaces: ['cmc_workspace', 'ectd_coauthor', 'api_route', 'editor_panel'],
    recommendedTitlePattern: 'Module 3 {ctdSection} - {substance|product}',
    recommendedMetadataTags: ['module3', 'cmc'],
  },
  submission_component: {
    key: 'submission_component',
    label: 'Submission Component',
    allowedClientTracks: ['biotech', 'device', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr'],
    requiredEvidenceModes: ['mixed', 'csr', 'predicate', 'test_data', 'cmc_source'],
    suggestedPlacement: 'dossier',
    suggestedReadinessGate: 'submission_candidate',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['component_purpose', 'supporting_evidence', 'regulatory_alignment'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId', 'dossierContainerId'],
    exportGateExpectations: ['readiness_gate_satisfied', 'approval_path_satisfied'],
    allowedOriginSurfaces: ['ectd_coauthor', 'ind_workspace', 'cerv2_device', 'editor_panel', 'api_route'],
    recommendedTitlePattern: 'Submission Component - {program} - {topic}',
    recommendedMetadataTags: ['submission-component'],
  },
  audit_report: {
    key: 'audit_report',
    label: 'Audit Report',
    allowedClientTracks: ['biotech', 'device', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['mixed', 'test_data', 'literature'],
    suggestedPlacement: 'vault',
    suggestedReadinessGate: 'inspection_ready',
    defaultApprovalPath: 'qa_lock',
    requiredStructureSections: ['scope', 'findings', 'evidence_lineage', 'actions'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs', 'provider_model'],
    requiredPlacementMinima: ['containerId', 'artifactContainerId'],
    exportGateExpectations: ['provenance_complete', 'approval_path_satisfied', 'review_status_sufficient'],
    allowedOriginSurfaces: ['api_route', 'system', 'editor_panel', 'ri_copilot'],
    recommendedTitlePattern: 'Audit Report - {artifact|flow} - {date}',
    recommendedMetadataTags: ['audit', 'inspection'],
  },
  comparator_summary: {
    key: 'comparator_summary',
    label: 'Comparator Summary',
    allowedClientTracks: ['device', 'diagnostics', 'biotech'],
    allowedSubmissionPrograms: ['510k', 'pma', 'cer', 'ivdr', 'general_ri', 'ind', 'ectd'],
    requiredEvidenceModes: ['predicate', 'literature', 'mixed'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'single_reviewer',
    requiredStructureSections: ['comparator_basis', 'similarities', 'differences', 'risk_delta'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['evidence_present', 'source_refs_present'],
    allowedOriginSurfaces: ['cerv2_device', 'ri_copilot', 'editor_panel', 'api_route'],
    recommendedTitlePattern: 'Comparator Summary - {predicate|benchmark}',
    recommendedMetadataTags: ['comparator', 'equivalence'],
  },
  risk_benefit: {
    key: 'risk_benefit',
    label: 'Risk-Benefit Assessment',
    allowedClientTracks: ['device', 'biotech', 'diagnostics'],
    allowedSubmissionPrograms: ['510k', 'pma', 'cer', 'ind', 'ectd', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['mixed', 'test_data', 'literature', 'predicate'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['benefit_profile', 'risk_profile', 'mitigation', 'residual_uncertainty'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['evidence_classification_present', 'evidence_present'],
    allowedOriginSurfaces: ['cerv2_device', 'ri_copilot', 'editor_panel', 'api_route'],
    recommendedTitlePattern: 'Risk-Benefit Assessment - {topic}',
    recommendedMetadataTags: ['risk-benefit'],
  },
  protocol_rationale: {
    key: 'protocol_rationale',
    label: 'Protocol Rationale',
    allowedClientTracks: ['biotech', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['csr', 'literature', 'mixed', 'test_data'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['objective', 'design_logic', 'evidence_basis', 'endpoint_alignment'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['evidence_classification_present', 'source_refs_present'],
    allowedOriginSurfaces: ['ri_copilot', 'ind_workspace', 'editor_panel', 'api_route'],
    recommendedTitlePattern: 'Protocol Rationale - {study|program}',
    recommendedMetadataTags: ['protocol', 'rationale'],
  },
  regional_differences: {
    key: 'regional_differences',
    label: 'Regional Differences Analysis',
    allowedClientTracks: ['diagnostics', 'device', 'biotech'],
    allowedSubmissionPrograms: ['ivdr', 'cer', 'pma', '510k', 'ectd', 'ind', 'general_ri'],
    requiredEvidenceModes: ['mixed', 'literature', 'test_data'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['regions', 'difference_matrix', 'impact', 'mitigation'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['regulator_scope_declared', 'document_class_rules_satisfied'],
    allowedOriginSurfaces: ['ri_copilot', 'editor_panel', 'api_route', 'system'],
    recommendedTitlePattern: 'Regional Differences - {regions} - {topic}',
    recommendedMetadataTags: ['regional', 'multi-agency'],
  },
  safety_evidence_brief: {
    key: 'safety_evidence_brief',
    label: 'Safety Evidence Brief',
    allowedClientTracks: ['biotech', 'device', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['csr', 'test_data', 'literature', 'mixed'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['safety_findings', 'signal_quality', 'known_risks', 'residual_questions'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['evidence_present', 'provenance_complete'],
    allowedOriginSurfaces: ['ri_copilot', 'editor_panel', 'api_route', 'system'],
    recommendedTitlePattern: 'Safety Evidence Brief - {topic}',
    recommendedMetadataTags: ['safety', 'evidence'],
  },
  endpoint_justification: {
    key: 'endpoint_justification',
    label: 'Endpoint Justification Memo',
    allowedClientTracks: ['biotech', 'diagnostics'],
    allowedSubmissionPrograms: ['ind', 'ectd', 'ivdr', 'general_ri'],
    requiredEvidenceModes: ['csr', 'literature', 'mixed', 'test_data'],
    suggestedPlacement: 'project',
    suggestedReadinessGate: 'internal_review',
    defaultApprovalPath: 'regulated_dual_review',
    requiredStructureSections: ['endpoint_definition', 'clinical_relevance', 'statistical_basis'],
    requiredProvenanceMinima: ['generatedAt', 'generatedBy', 'sourceRefs'],
    requiredPlacementMinima: ['containerId'],
    exportGateExpectations: ['evidence_classification_present', 'source_refs_present'],
    allowedOriginSurfaces: ['ri_copilot', 'ind_workspace', 'editor_panel', 'api_route'],
    recommendedTitlePattern: 'Endpoint Justification - {endpoint}',
    recommendedMetadataTags: ['endpoint', 'justification'],
  },
};

export function getDocumentClassSemantics(
  documentClass: DocumentClass
): DocumentClassSemantics | null {
  return DOCUMENT_CLASS_SEMANTICS[documentClass] || null;
}
