import type { GovernedDocumentActionContract } from '../../../../shared/types/document-contract';
import {
  DOCUMENT_CLASS_SEMANTICS,
  type DocumentClassSemantics,
} from '../authority/documentClassSemantics';

export interface RulePackResult {
  requiredFields: string[];
  requiredPlacementConstraints: string[];
  requiredEvidenceConstraints: string[];
  requiredProvenanceMinima: string[];
  exportGateList: string[];
  approvalDefault: GovernedDocumentActionContract['approvalPathType'];
  warnings: string[];
  disallowedCombinations: string[];
}

type HarnessContract = GovernedDocumentActionContract;

function buildBaseRulePack(contract: HarnessContract): RulePackResult {
  const semantics = DOCUMENT_CLASS_SEMANTICS[contract.documentClass];

  return {
    requiredFields: [
      'projectId',
      'documentType',
      'clientTrack',
      'submissionProgram',
      'persona',
      'regulatorScope',
      'documentClass',
      'readinessGate',
      'approvalPathType',
      'workspaceTarget',
      'regulatorIntent',
      'editorPayload.title',
      'editorPayload.content',
    ],
    requiredPlacementConstraints: semantics.requiredPlacementMinima,
    requiredEvidenceConstraints: semantics.requiredEvidenceModes.map(mode => `evidenceMode:${mode}`),
    requiredProvenanceMinima: semantics.requiredProvenanceMinima,
    exportGateList: semantics.exportGateExpectations,
    approvalDefault: semantics.defaultApprovalPath,
    warnings: [],
    disallowedCombinations: [],
  };
}

function applyBiotechRules(contract: HarnessContract, rulePack: RulePackResult): RulePackResult {
  if (contract.documentClass === 'section_draft') {
    rulePack.requiredFields.push('editorPayload.ctdSection');
    rulePack.requiredPlacementConstraints.push('ctd_section_present');
  }

  if (contract.documentClass === 'module3_output') {
    rulePack.requiredPlacementConstraints.push('module_mapping_present');
    rulePack.requiredEvidenceConstraints.push('source_refs_present');
  }

  if (contract.readinessGate === 'submission_candidate') {
    rulePack.requiredPlacementConstraints.push('dossier_placement_satisfied');
  }

  if (contract.readinessGate === 'inspection_ready') {
    rulePack.requiredProvenanceMinima.push(
      'provenancePayload.provider',
      'provenancePayload.model',
      'auditEventPayload.actorRole'
    );
    if (
      !['regulated_dual_review', 'qa_lock', 'signoff_required'].includes(contract.approvalPathType)
    ) {
      rulePack.disallowedCombinations.push(
        'biotech inspection_ready requires regulated_dual_review/qa_lock/signoff_required'
      );
    }
  }

  if (contract.documentClass === 'protocol_rationale' || contract.documentClass === 'endpoint_justification') {
    rulePack.requiredEvidenceConstraints.push('evidence_classification_present');
  }

  if (contract.documentClass === 'module3_output' && !contract.editorPayload.ctdSection?.startsWith('3.')) {
    rulePack.disallowedCombinations.push('module3_output must map to CTD section 3.x');
  }

  return rulePack;
}

function applyDeviceRules(contract: HarnessContract, rulePack: RulePackResult): RulePackResult {
  if (
    contract.submissionProgram === '510k' &&
    contract.documentClass === 'submission_component'
  ) {
    rulePack.requiredEvidenceConstraints.push('predicate_context_present');
  }

  if (contract.documentClass === 'risk_benefit') {
    rulePack.requiredEvidenceConstraints.push('evidence_classification_present');
  }

  if (contract.submissionProgram === 'cer') {
    rulePack.requiredProvenanceMinima.push('clinical_evidence_lineage');
  }

  if (contract.submissionProgram === 'pma' && contract.readinessGate !== 'exploratory') {
    if (contract.approvalPathType === 'single_reviewer') {
      rulePack.disallowedCombinations.push(
        'pma non-exploratory flows require regulated_dual_review or stronger'
      );
    }
  }

  if (contract.evidenceMode === 'predicate' && !contract.provenancePayload.sourceRefs?.length) {
    rulePack.warnings.push('predicate evidence should declare sourceRefs/predicate basis');
  }

  return rulePack;
}

function applyDiagnosticsRules(contract: HarnessContract, rulePack: RulePackResult): RulePackResult {
  if (
    contract.documentClass === 'submission_component' ||
    contract.documentClass === 'regional_differences'
  ) {
    rulePack.requiredEvidenceConstraints.push('evidence_classification_present');
    rulePack.requiredFields.push('regulatorScope');
  }

  if (contract.regulatorScope === 'multi' && contract.documentClass === 'regional_differences') {
    rulePack.requiredPlacementConstraints.push('multi_region_logic_declared');
  }

  if (contract.readinessGate === 'inspection_ready') {
    rulePack.requiredProvenanceMinima.push(
      'provenancePayload.provider',
      'provenancePayload.model',
      'provenancePayload.sourceRefs'
    );
  }

  return rulePack;
}

export function resolveTrackRulePack(contract: HarnessContract): RulePackResult {
  const semantics = DOCUMENT_CLASS_SEMANTICS[contract.documentClass];
  const rulePack = buildBaseRulePack(contract);

  if (!semantics.allowedClientTracks.includes(contract.clientTrack)) {
    rulePack.disallowedCombinations.push(
      `${contract.documentClass} is not allowed for clientTrack=${contract.clientTrack}`
    );
  }

  if (!semantics.allowedSubmissionPrograms.includes(contract.submissionProgram)) {
    rulePack.disallowedCombinations.push(
      `${contract.documentClass} is not allowed for submissionProgram=${contract.submissionProgram}`
    );
  }

  switch (contract.clientTrack) {
    case 'biotech':
      return applyBiotechRules(contract, rulePack);
    case 'device':
      return applyDeviceRules(contract, rulePack);
    case 'diagnostics':
      return applyDiagnosticsRules(contract, rulePack);
    default:
      return rulePack;
  }
}

export function getDocumentClassSemantics(
  documentClass: HarnessContract['documentClass']
): DocumentClassSemantics {
  return DOCUMENT_CLASS_SEMANTICS[documentClass];
}
