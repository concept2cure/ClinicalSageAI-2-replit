/**
 * Document Consequence Engine
 *
 * Generates downstream operating consequences from governed document decisions.
 * Consequences are structured actions that should happen as a result of a document
 * evaluation — blockers, tasks, reviews, readiness updates, workspace state changes.
 *
 * Consequences are generated but not executed here — execution is the responsibility
 * of the consuming lane (CMC, Communication Center, workspace, etc.).
 *
 * Part of the Governed Document Decision Fabric.
 */

import type {
  GovernedDocumentContext,
  LifecycleReadinessState,
  PlacementAuthorityDecision,
  ExportGateDecision,
  PublishGateDecision,
  DownstreamOperatingConsequence,
  ConsequenceType,
  GovernedBlockingReason,
} from '../../../shared/types/governed-document-fabric';

export const DOCUMENT_CONSEQUENCE_ENGINE_VERSION = '1.0.0';

/**
 * Input for consequence generation — the full evaluation state
 */
export interface ConsequenceGenerationInput {
  context: GovernedDocumentContext;
  readiness: LifecycleReadinessState;
  placement: PlacementAuthorityDecision;
  exportGate: ExportGateDecision;
  publishGate: PublishGateDecision;
}

/**
 * Generate downstream operating consequences from a governed document evaluation.
 *
 * Consequences represent actions the platform should take in response to the
 * evaluation results. They are structured, actionable, and traceable.
 */
export function generateConsequences(input: ConsequenceGenerationInput): DownstreamOperatingConsequence[] {
  const consequences: DownstreamOperatingConsequence[] = [];

  // === Readiness-derived consequences ===
  deriveReadinessConsequences(input, consequences);

  // === Placement-derived consequences ===
  derivePlacementConsequences(input, consequences);

  // === Export gate consequences ===
  deriveExportConsequences(input, consequences);

  // === Publish gate consequences ===
  derivePublishConsequences(input, consequences);

  // === Always: audit reference ===
  consequences.push({
    consequenceType: 'create_audit_reference',
    description: `Governed decision recorded for ${input.context.intendedAction} on ${input.context.artifactId || 'new document'}`,
    targetObjectType: 'artifact',
    targetObjectId: input.context.artifactId,
    severity: 'info',
    actionRequired: false,
    autoExecutable: true,
    executed: false,
  });

  // === Provenance linkage ===
  if (input.context.artifactId) {
    consequences.push({
      consequenceType: 'link_provenance',
      description: `Link provenance for ${input.context.intendedAction} action`,
      targetObjectType: 'artifact',
      targetObjectId: input.context.artifactId,
      severity: 'info',
      actionRequired: false,
      autoExecutable: true,
      executed: false,
    });
  }

  return consequences;
}

// === Internal consequence derivation ===

function deriveReadinessConsequences(
  input: ConsequenceGenerationInput,
  consequences: DownstreamOperatingConsequence[]
): void {
  const { readiness, context } = input;

  // Blocked readiness → open blocker consequence
  if (readiness.level === 'blocked') {
    for (const blocker of readiness.blockers.filter(b => b.severity === 'critical')) {
      consequences.push({
        consequenceType: 'open_blocker',
        description: blocker.message,
        targetObjectType: blocker.targetObjectType || 'artifact',
        targetObjectId: blocker.targetObjectId || context.artifactId,
        targetSectionCode: blocker.targetSectionCode,
        severity: 'critical',
        actionRequired: true,
        autoExecutable: false,
        executed: false,
      });
    }
  }

  // Evidence gap → create review requirement
  if (readiness.level === 'evidence_gap') {
    consequences.push({
      consequenceType: 'create_review_requirement',
      description: 'Evidence gaps detected — review and supplement evidence before progression',
      targetObjectType: 'artifact',
      targetObjectId: context.artifactId,
      severity: 'major',
      actionRequired: true,
      autoExecutable: false,
      executed: false,
    });
  }

  // Readiness score change → update readiness score
  consequences.push({
    consequenceType: 'update_readiness_score',
    description: `Readiness evaluated: ${readiness.level} (score: ${readiness.score}/100, confidence: ${readiness.confidence})`,
    targetObjectType: 'project',
    targetObjectId: context.projectId,
    severity: 'info',
    actionRequired: false,
    autoExecutable: true,
    executed: false,
  });

  // Workspace consequence row for any non-trivial readiness state
  if (readiness.level !== 'draft' && readiness.blockers.length > 0) {
    consequences.push({
      consequenceType: 'flag_workspace_consequence_row',
      description: `${readiness.blockers.length} blocker(s), ${readiness.warnings.length} warning(s) for ${context.artifactId || 'document'}`,
      targetObjectType: 'artifact',
      targetObjectId: context.artifactId,
      severity: readiness.blockers.some(b => b.severity === 'critical') ? 'critical' : 'major',
      actionRequired: true,
      autoExecutable: true,
      executed: false,
    });
  }
}

function derivePlacementConsequences(
  input: ConsequenceGenerationInput,
  consequences: DownstreamOperatingConsequence[]
): void {
  const { placement, context } = input;

  if (placement.outcome === 'blocked' && placement.blockingReasons) {
    for (const reason of placement.blockingReasons) {
      consequences.push({
        consequenceType: 'open_blocker',
        description: reason.message,
        targetObjectType: 'artifact',
        targetObjectId: context.artifactId,
        severity: 'major',
        actionRequired: true,
        autoExecutable: false,
        executed: false,
      });
    }
  }

  if (placement.outcome === 'insufficient_context') {
    consequences.push({
      consequenceType: 'flag_workspace_consequence_row',
      description: `Placement cannot be determined: missing ${(placement.missingMetadata || []).join(', ')}`,
      targetObjectType: 'artifact',
      targetObjectId: context.artifactId,
      severity: 'minor',
      actionRequired: false,
      autoExecutable: true,
      executed: false,
    });
  }
}

function deriveExportConsequences(
  input: ConsequenceGenerationInput,
  consequences: DownstreamOperatingConsequence[]
): void {
  const { exportGate, context } = input;

  if (exportGate.outcome === 'blocked') {
    consequences.push({
      consequenceType: 'flag_workspace_consequence_row',
      description: `Export blocked: ${exportGate.blockingReasons.length} gate check(s) failed`,
      targetObjectType: 'artifact',
      targetObjectId: context.artifactId,
      severity: 'major',
      actionRequired: true,
      autoExecutable: true,
      executed: false,
    });
  }
}

function derivePublishConsequences(
  input: ConsequenceGenerationInput,
  consequences: DownstreamOperatingConsequence[]
): void {
  const { publishGate, context } = input;

  if (publishGate.outcome === 'blocked') {
    // Mark submission item not dispatch-ready
    consequences.push({
      consequenceType: 'mark_submission_item_not_dispatch_ready',
      description: `Publish blocked: ${publishGate.blockingReasons.length} gate check(s) failed`,
      targetObjectType: 'submission_item',
      targetObjectId: context.artifactId,
      severity: 'critical',
      actionRequired: true,
      autoExecutable: true,
      executed: false,
    });
  }

  if (!publishGate.dispatchReady) {
    consequences.push({
      consequenceType: 'mark_submission_item_not_dispatch_ready',
      description: 'Submission item is not dispatch-ready',
      targetObjectType: 'submission_item',
      targetObjectId: context.artifactId,
      severity: 'major',
      actionRequired: true,
      autoExecutable: true,
      executed: false,
    });
  }

  // Notify stakeholders of publish-blocking state
  if (publishGate.outcome === 'blocked' && publishGate.blockingReasons.some(b => b.severity === 'critical')) {
    consequences.push({
      consequenceType: 'notify_stakeholder',
      description: 'Critical publish blockers require attention before submission',
      targetObjectType: 'project',
      targetObjectId: context.projectId,
      severity: 'critical',
      actionRequired: true,
      autoExecutable: false,
      executed: false,
    });
  }
}
