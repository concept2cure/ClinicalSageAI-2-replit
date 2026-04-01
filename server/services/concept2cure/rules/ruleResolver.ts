import type { GovernedDocumentActionContract } from '../../../../shared/types/document-contract';
import {
  getDocumentClassSemantics,
  type DocumentClassSemantics,
} from '../authority/documentClassSemantics';
import { resolveTrackRulePack, type RulePackResult } from './rulePacks';
import { resolvePersonaOverlay } from './personaOverlays';

type FieldRequirement = {
  field: string;
  required: boolean;
  reason: string;
};

export type ResolvedRulePack = {
  trackPack: RulePackResult;
  personaOverlay: ReturnType<typeof resolvePersonaOverlay>;
  documentSemantics: DocumentClassSemantics;
  requiredFields: FieldRequirement[];
  requiredPlacementConstraints: string[];
  requiredEvidenceConstraints: string[];
  requiredProvenanceMinima: string[];
  exportGates: string[];
  approvalDefault: GovernedDocumentActionContract['approvalPathType'];
  warnings: string[];
  disallowedCombinations: string[];
};

export function resolveRulePack(
  contract: GovernedDocumentActionContract,
  baseWarnings: string[] = []
): ResolvedRulePack {
  const trackPack = resolveTrackRulePack(contract);
  const personaOverlay = resolvePersonaOverlay({
    persona: contract.persona,
    readinessGate: contract.readinessGate,
    regulatorScope: contract.regulatorScope,
    approvalPathType: contract.approvalPathType,
    documentClass: contract.documentClass,
    provenancePayload: contract.provenancePayload,
    placementTarget: contract.placementTarget,
  });
  const documentSemantics = getDocumentClassSemantics(contract.documentClass);
  const warnings: string[] = [...baseWarnings];
  const disallowedCombinations: string[] = [];

  if (!documentSemantics.allowedClientTracks.includes(contract.clientTrack)) {
    disallowedCombinations.push(
      `documentClass ${contract.documentClass} is not allowed for clientTrack ${contract.clientTrack}`
    );
  }

  if (!documentSemantics.allowedSubmissionPrograms.includes(contract.submissionProgram)) {
    disallowedCombinations.push(
      `documentClass ${contract.documentClass} is not allowed for submissionProgram ${contract.submissionProgram}`
    );
  }

  if (!documentSemantics.requiredEvidenceModes.includes(contract.evidenceMode)) {
    warnings.push(
      `evidenceMode ${contract.evidenceMode} is unusual for documentClass ${contract.documentClass}`
    );
  }

  if (!documentSemantics.allowedOriginSurfaces.includes(contract.originSurface)) {
    disallowedCombinations.push(
      `originSurface ${contract.originSurface} is not allowed for documentClass ${contract.documentClass}`
    );
  }

  if (contract.workspaceTarget !== documentSemantics.suggestedPlacement) {
    warnings.push(
      `workspaceTarget ${contract.workspaceTarget} differs from suggested placement ${documentSemantics.suggestedPlacement} for ${contract.documentClass}`
    );
  }

  if (
    contract.readinessGate === 'inspection_ready' &&
    !['regulated_dual_review', 'qa_lock', 'signoff_required'].includes(contract.approvalPathType)
  ) {
    disallowedCombinations.push(
      `approvalPathType ${contract.approvalPathType} is too weak for inspection_ready on ${contract.clientTrack}`
    );
  }

  if (contract.readinessGate === 'submission_candidate' && contract.workspaceTarget !== 'dossier') {
    warnings.push(
      'submission_candidate readiness should target dossier placement unless explicitly waived'
    );
  }

  const requiredFields: FieldRequirement[] = [
    { field: 'projectId', required: true, reason: 'artifact ownership' },
    { field: 'documentType', required: true, reason: 'artifact classification' },
    { field: 'documentClass', required: true, reason: 'semantics and gate evaluation' },
    { field: 'clientTrack', required: true, reason: 'rule-pack routing' },
    { field: 'submissionProgram', required: true, reason: 'program-specific rules' },
    { field: 'persona', required: true, reason: 'overlay behavior' },
    { field: 'regulatorScope', required: true, reason: 'regulatory expectations' },
    { field: 'readinessGate', required: true, reason: 'stage-aware constraints' },
  ];

  const requiredPlacementConstraints = [
    ...trackPack.requiredPlacementConstraints,
    ...documentSemantics.requiredPlacementMinima,
  ];
  const requiredEvidenceConstraints = [
    ...trackPack.requiredEvidenceConstraints,
    ...documentSemantics.requiredEvidenceModes.map(mode => `evidence_mode:${mode}`),
  ];
  const requiredProvenanceMinima = [
    ...trackPack.requiredProvenanceMinima,
    ...documentSemantics.requiredProvenanceMinima,
  ];
  const exportGates = Array.from(
    new Set([...trackPack.exportGateList, ...documentSemantics.exportGateExpectations])
  );

  return {
    trackPack,
    personaOverlay,
    documentSemantics,
    requiredFields,
    requiredPlacementConstraints,
    requiredEvidenceConstraints,
    requiredProvenanceMinima,
    exportGates,
    approvalDefault: documentSemantics.defaultApprovalPath,
    warnings,
    disallowedCombinations,
  };
}
