/**
 * Export & Publish Gates
 *
 * Determines export and publish/dispatch eligibility for governed documents.
 * Fail-closed: if required checks cannot be evaluated, the gate blocks.
 *
 * Export gates verify a document is ready for export (PDF, DOCX, eCTD package).
 * Publish gates verify a document/package is ready for submission/dispatch to authorities.
 *
 * Part of the Governed Document Decision Fabric.
 */

import { randomUUID } from 'crypto';
import type {
  GovernedDocumentContext,
  ExportGateDecision,
  PublishGateDecision,
  GateCheck,
  GateOutcome,
  GovernedBlockingReason,
  LifecycleReadinessState,
  PlacementAuthorityDecision,
} from '../../../shared/types/governed-document-fabric';

export const EXPORT_PUBLISH_GATES_VERSION = '1.0.0';

/**
 * Input for export gate evaluation
 */
export interface ExportGateInput {
  context: GovernedDocumentContext;
  readiness: LifecycleReadinessState;
  placement: PlacementAuthorityDecision;

  // Additional export-specific state
  hasContent: boolean;
  contentHash?: string;
  hasApproval: boolean;
  approvalDate?: string;
  humanReviewApproved: boolean;
  aiGenerated: boolean;
  provenanceComplete: boolean;
  unresolvedContradictionCount: number;
  isStale: boolean;
}

/**
 * Input for publish gate evaluation
 */
export interface PublishGateInput extends ExportGateInput {
  // Publish-specific state
  exportCompleted: boolean;
  exportHash?: string;
  hasGatewayProfile: boolean;
  gatewayProfileValid: boolean;
  hasSequenceNumber: boolean;
  hasAuthorityProfile: boolean;
  authorityAcceptsFormat: boolean;
  allSectionsApproved: boolean;
  staleSectionCount: number;
}

/**
 * Evaluate export eligibility for a governed document.
 * Fail-closed: missing information blocks export.
 */
export function evaluateExportGate(input: ExportGateInput): ExportGateDecision {
  const checks: GateCheck[] = [];
  const blockingReasons: GovernedBlockingReason[] = [];
  const remediationSteps: string[] = [];


  // Check 1: Content exists
  checks.push({
    checkId: 'export_content_present',
    checkName: 'Content Present',
    passed: input.hasContent,
    detail: input.hasContent ? 'Document has content' : 'Document has no content',
    required: true,
  });
  if (!input.hasContent) {
    blockingReasons.push(makeBlocker('export_gate_failed', 'critical', 'Cannot export document with no content'));
    remediationSteps.push('Add content to the document before exporting');
  }

  // Check 2: Placement present
  const hasPlacement = input.placement.outcome === 'allowed' || input.placement.outcome === 'fallback_allowed';
  checks.push({
    checkId: 'export_placement_present',
    checkName: 'CTD Placement',
    passed: hasPlacement,
    detail: hasPlacement
      ? `Placed at ${input.placement.canonicalDestination || input.context.ctdSection || 'assigned section'}`
      : 'No valid CTD placement',
    required: true,
  });
  if (!hasPlacement) {
    blockingReasons.push(makeBlocker('missing_placement', 'major', 'Document must be placed in a CTD section before export'));
    remediationSteps.push('Place the document in the appropriate CTD section');
  }

  // Check 3: Approval status
  checks.push({
    checkId: 'export_approval_status',
    checkName: 'Approval Status',
    passed: input.hasApproval,
    detail: input.hasApproval
      ? `Approved${input.approvalDate ? ` on ${input.approvalDate}` : ''}`
      : 'Not yet approved',
    required: true,
  });
  if (!input.hasApproval) {
    blockingReasons.push(makeBlocker('missing_approval', 'critical', 'Document must be approved before export'));
    remediationSteps.push('Complete the approval workflow for this document');
  }

  // Check 4: Provenance complete
  checks.push({
    checkId: 'export_provenance_complete',
    checkName: 'Provenance Chain',
    passed: input.provenanceComplete,
    detail: input.provenanceComplete ? 'Provenance chain is complete' : 'Provenance chain has gaps',
    required: true,
  });
  if (!input.provenanceComplete) {
    blockingReasons.push(makeBlocker('export_gate_failed', 'major', 'Provenance chain is incomplete — audit trail required for export'));
    remediationSteps.push('Ensure all document modifications have been tracked with provenance events');
  }

  // Check 5: No critical contradictions
  const noContradictions = input.unresolvedContradictionCount === 0;
  checks.push({
    checkId: 'export_no_contradictions',
    checkName: 'No Unresolved Contradictions',
    passed: noContradictions,
    detail: noContradictions
      ? 'No unresolved contradictions'
      : `${input.unresolvedContradictionCount} unresolved contradiction(s)`,
    required: true,
  });
  if (!noContradictions) {
    blockingReasons.push(makeBlocker('unresolved_contradiction', 'critical', `${input.unresolvedContradictionCount} unresolved contradiction(s) block export`));
    remediationSteps.push('Resolve all contradictions before exporting');
  }

  // Check 6: Not stale
  checks.push({
    checkId: 'export_not_stale',
    checkName: 'Not Stale',
    passed: !input.isStale,
    detail: input.isStale ? 'Document is stale — source data has changed' : 'Document is current',
    required: true,
  });
  if (input.isStale) {
    blockingReasons.push(makeBlocker('export_gate_failed', 'major', 'Document is stale — refresh before export'));
    remediationSteps.push('Refresh or recompile the document to incorporate source changes');
  }

  // Check 7: Human review for AI-generated content
  if (input.aiGenerated) {
    checks.push({
      checkId: 'export_human_review',
      checkName: 'Human Review (AI Content)',
      passed: input.humanReviewApproved,
      detail: input.humanReviewApproved
        ? 'AI-generated content has been human-reviewed'
        : 'AI-generated content has NOT been human-reviewed',
      required: true,
    });
    if (!input.humanReviewApproved) {
      blockingReasons.push(makeBlocker('missing_review', 'critical', 'AI-generated content requires human review before export'));
      remediationSteps.push('Complete human review of AI-generated content');
    }
  }

  // Check 8: Regulatory context
  const hasRegContext = Boolean(input.context.regulatorBody);
  checks.push({
    checkId: 'export_regulatory_context',
    checkName: 'Regulatory Context',
    passed: hasRegContext,
    detail: hasRegContext
      ? `Regulatory context: ${input.context.regulatorBody}`
      : 'No regulatory body specified',
    required: false, // warning, not blocking
  });

  // Determine outcome
  const requiredFailed = checks.filter(c => c.required && !c.passed);
  let outcome: GateOutcome;
  if (requiredFailed.length > 0) {
    outcome = 'blocked';
  } else if (!hasRegContext) {
    outcome = 'insufficient_context';
  } else {
    outcome = 'eligible';
  }

  return {
    outcome,
    gateChecks: checks,
    blockingReasons,
    remediationSteps,
  };
}

/**
 * Evaluate publish/dispatch eligibility for a governed document or submission package.
 * More restrictive than export gate — includes submission-specific checks.
 */
export function evaluatePublishGate(input: PublishGateInput): PublishGateDecision {
  // Start with export gate evaluation
  const exportResult = evaluateExportGate(input);

  const checks: GateCheck[] = [...exportResult.gateChecks];
  const blockingReasons: GovernedBlockingReason[] = [...exportResult.blockingReasons];
  const remediationSteps: string[] = [...exportResult.remediationSteps];
  const dispatchBlockers: GovernedBlockingReason[] = [];


  // Publish-specific check 1: Export completed
  checks.push({
    checkId: 'publish_export_completed',
    checkName: 'Export Completed',
    passed: input.exportCompleted,
    detail: input.exportCompleted ? 'Export has been completed' : 'Export has not been completed',
    required: true,
  });
  if (!input.exportCompleted) {
    blockingReasons.push(makeBlocker('export_gate_failed', 'critical', 'Document must be exported before publishing'));
    remediationSteps.push('Complete document export before attempting to publish');
  }

  // Publish-specific check 2: Gateway profile (for eCTD submissions)
  if (input.context.submissionType) {
    checks.push({
      checkId: 'publish_gateway_profile',
      checkName: 'Gateway Profile',
      passed: input.hasGatewayProfile && input.gatewayProfileValid,
      detail: input.hasGatewayProfile
        ? (input.gatewayProfileValid ? 'Gateway profile is valid' : 'Gateway profile is invalid')
        : 'No gateway profile configured',
      required: false, // warning level for now
    });
  }

  // Publish-specific check 3: Sequence number (for eCTD)
  const ectdLike = ['NDA', 'BLA', 'ANDA', 'MAA', 'IND'].includes(input.context.submissionType || '');
  if (ectdLike) {
    checks.push({
      checkId: 'publish_sequence_number',
      checkName: 'eCTD Sequence Number',
      passed: input.hasSequenceNumber,
      detail: input.hasSequenceNumber ? 'Sequence number assigned' : 'Missing eCTD sequence number',
      required: true,
    });
    if (!input.hasSequenceNumber) {
      blockingReasons.push(makeBlocker('publish_gate_failed', 'critical', 'eCTD submissions require a sequence number'));
      remediationSteps.push('Assign an eCTD sequence number before publishing');
    }
  }

  // Publish-specific check 4: Authority profile
  checks.push({
    checkId: 'publish_authority_profile',
    checkName: 'Authority Profile',
    passed: input.hasAuthorityProfile,
    detail: input.hasAuthorityProfile
      ? (input.authorityAcceptsFormat ? 'Authority accepts submission format' : 'Authority may not accept this format')
      : 'No authority profile configured',
    required: false,
  });

  // Publish-specific check 5: All sections approved (for packages)
  if (input.allSectionsApproved !== undefined) {
    checks.push({
      checkId: 'publish_all_sections_approved',
      checkName: 'All Sections Approved',
      passed: input.allSectionsApproved,
      detail: input.allSectionsApproved
        ? 'All sections are approved'
        : `Not all sections are approved${input.staleSectionCount > 0 ? ` (${input.staleSectionCount} stale)` : ''}`,
      required: true,
    });
    if (!input.allSectionsApproved) {
      blockingReasons.push(makeBlocker('missing_approval', 'critical', 'All sections must be approved before publishing'));
      remediationSteps.push('Approve all sections before publishing');
    }
  }

  // Determine dispatch readiness
  const dispatchReady = blockingReasons.length === 0 && dispatchBlockers.length === 0;

  // Determine outcome
  const requiredFailed = checks.filter(c => c.required && !c.passed);
  let outcome: GateOutcome;
  if (requiredFailed.length > 0) {
    outcome = 'blocked';
  } else if (!input.context.regulatorBody || !input.context.submissionType) {
    outcome = 'insufficient_context';
  } else {
    outcome = 'eligible';
  }

  return {
    outcome,
    gateChecks: checks,
    blockingReasons,
    remediationSteps,
    dispatchReady,
    dispatchBlockers: dispatchBlockers.length > 0 ? dispatchBlockers : undefined,
  };
}

// === Helper ===

function makeBlocker(
  category: GovernedBlockingReason['category'],
  severity: GovernedBlockingReason['severity'],
  message: string,
): GovernedBlockingReason {
  return {
    id: `gate_${randomUUID()}`,
    category,
    severity,
    message,
    source: `export-publish-gates@${EXPORT_PUBLISH_GATES_VERSION}`,
  };
}
