import type { GovernedDocumentActionContract } from '../../../../shared/types/document-contract';

type PersonaOverlay = {
  warnings: string[];
  approvalPathOverride?: GovernedDocumentActionContract['approvalPathType'];
  additionalRequiredFields?: string[];
  stricterInspectionReady?: boolean;
};

export function resolvePersonaOverlay(
  contract: Pick<
    GovernedDocumentActionContract,
    | 'persona'
    | 'readinessGate'
    | 'regulatorScope'
    | 'approvalPathType'
    | 'documentClass'
    | 'provenancePayload'
    | 'placementTarget'
  >
): PersonaOverlay {
  const warnings: string[] = [];
  const additionalRequiredFields: string[] = [];
  let approvalPathOverride: GovernedDocumentActionContract['approvalPathType'] | undefined;
  let stricterInspectionReady = false;

  switch (contract.persona) {
    case 'regulatory':
      warnings.push('Regulatory persona enforces explicit regulator scope and defensibility framing.');
      additionalRequiredFields.push('regulatorScope', 'readinessGate', 'approvalPathType');
      if (contract.readinessGate === 'inspection_ready') {
        approvalPathOverride = 'regulated_dual_review';
        stricterInspectionReady = true;
      }
      break;
    case 'medical_writer':
      warnings.push('Medical writer persona emphasizes structure continuity and compareability.');
      additionalRequiredFields.push('editorPayload.title', 'editorPayload.content');
      break;
    case 'cmc':
      warnings.push('CMC persona requires source linkage and Module 3 mapping evidence.');
      additionalRequiredFields.push('provenancePayload.sourceRefs');
      if (contract.documentClass === 'module3_output') {
        additionalRequiredFields.push('placementTarget.sectionKey');
      }
      break;
    case 'clinical':
      warnings.push('Clinical persona expects comparator and rationale traceability.');
      additionalRequiredFields.push('provenancePayload.sourceRefs');
      break;
    case 'qa':
      warnings.push('QA persona applies strict provenance, approval, and lock-readiness checks.');
      additionalRequiredFields.push('approvalPathType', 'provenancePayload.provider', 'provenancePayload.model');
      if (contract.readinessGate === 'inspection_ready') {
        approvalPathOverride = 'qa_lock';
        stricterInspectionReady = true;
      }
      break;
    case 'executive':
      warnings.push('Executive persona keeps governance strict while emphasizing readiness/risk posture.');
      if (contract.readinessGate === 'inspection_ready') {
        approvalPathOverride = 'signoff_required';
      }
      break;
    case 'cro':
      warnings.push('CRO persona requires review-chain and placement consequence visibility.');
      additionalRequiredFields.push('placementTarget.containerId');
      break;
    default:
      break;
  }

  return {
    warnings,
    approvalPathOverride,
    additionalRequiredFields,
    stricterInspectionReady,
  };
}
