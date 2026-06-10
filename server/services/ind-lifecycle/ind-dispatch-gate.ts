/**
 * IND dispatch-readiness gate.
 *
 * The final go/no-go before an eCTD sequence is sent. It fuses the structural
 * sequence validation (required sections present), the package manifest
 * (checksum completeness + leaf count) and the count of unresolved critical
 * actions (clinical hold / overdue safety report) into a single deterministic
 * verdict. Hard blockers stop dispatch; soft warnings are advisory.
 *
 * This is a content-readiness gate at the IND level — complementary to the
 * deterministic eCTD dispatch-gate in server/services/ectd/dispatch-gate.ts.
 */

import type { SequenceValidationReport } from './ind-sequence-validation';
import type { PackageManifest } from './ind-package-manifest';

export interface DispatchFinding {
  code: string;
  message: string;
}

export interface DispatchGateInput {
  sequenceValidation: SequenceValidationReport;
  manifest: PackageManifest;
  /** Unresolved critical next-actions (clinical hold, overdue safety reports). */
  criticalActions?: number;
  /** Current sequence status; a sequence already dispatched is blocked from re-send. */
  sequenceStatus?: string;
}

export interface DispatchGateVerdict {
  /** True ⇔ zero hard blockers. */
  canDispatch: boolean;
  blockers: DispatchFinding[];
  warnings: DispatchFinding[];
  summary: {
    missingRequiredSections: number;
    totalLeaves: number;
    missingChecksums: number;
    criticalActions: number;
    unknownSections: number;
  };
}

/**
 * Evaluate the dispatch gate. `canDispatch` is the authoritative go/no-go:
 * true only when there are no hard blockers.
 */
export function evaluateDispatchGate(input: DispatchGateInput): DispatchGateVerdict {
  const blockers: DispatchFinding[] = [];
  const warnings: DispatchFinding[] = [];

  const missingRequiredSections = input.sequenceValidation.missing.length;
  const totalLeaves = input.manifest.totalLeaves;
  const missingChecksums = input.manifest.missingChecksums;
  const criticalActions = input.criticalActions ?? 0;
  const unknownSections = input.sequenceValidation.unknownSections.length;

  // Hard blockers.
  if (input.sequenceStatus === 'dispatched') {
    blockers.push({ code: 'ALREADY_DISPATCHED', message: 'This sequence has already been dispatched.' });
  }
  if (totalLeaves === 0) {
    blockers.push({ code: 'EMPTY_SEQUENCE', message: 'The sequence has no leaves to dispatch.' });
  }
  if (missingRequiredSections > 0) {
    blockers.push({
      code: 'MISSING_REQUIRED_SECTIONS',
      message: `${missingRequiredSections} required section(s) have no leaf in the sequence.`,
    });
  }
  if (missingChecksums > 0) {
    blockers.push({
      code: 'MISSING_CHECKSUMS',
      message: `${missingChecksums} leaf/leaves have no checksum (rendered bytes not attached); the eCTD index-md5 would be incomplete.`,
    });
  }
  if (criticalActions > 0) {
    blockers.push({
      code: 'CRITICAL_ACTIONS_OPEN',
      message: `${criticalActions} critical action(s) are unresolved (e.g. clinical hold or overdue IND safety report).`,
    });
  }

  // Soft warnings.
  if (unknownSections > 0) {
    warnings.push({
      code: 'UNKNOWN_SECTIONS',
      message: `${unknownSections} leaf/leaves map to no known CTD section; confirm placement before dispatch.`,
    });
  }

  return {
    canDispatch: blockers.length === 0,
    blockers,
    warnings,
    summary: { missingRequiredSections, totalLeaves, missingChecksums, criticalActions, unknownSections },
  };
}
