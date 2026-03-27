import { FeatureToggleService } from '../featureToggleService';

export const DOCUMENT_STACK_FEATURE_KEYS = {
  sourceIntake: 'ana.document_stack.source_intake',
  citationNormalization: 'ana.document_stack.citation_normalization',
  qualityChecks: 'ana.document_stack.quality_checks',
  reviewerDiffs: 'ana.document_stack.reviewer_diffs',
  pdfValidation: 'ana.document_stack.pdf_validation',
} as const;

export async function isDocumentStackFeatureEnabled(
  featureKey: string,
  organizationId?: number,
  clientWorkspaceId?: number
): Promise<boolean> {
  if (process.env.ANA_DOCUMENT_STACK_FORCE_ON === 'true') {
    return true;
  }

  return FeatureToggleService.isFeatureEnabled(featureKey, organizationId, clientWorkspaceId);
}
