/**
 * IND submission cockpit combiner.
 *
 * The single-call program view: the submission-level dashboard plus a
 * per-sequence dispatch-gate summary, with a roll-up of how many sequences are
 * dispatch-ready vs blocked. Pure / deterministic — the route does the loading
 * and per-sequence gate evaluation; this folds the results together.
 *
 * One verdict per sequence (decision P-33, 2026-10-15). Every per-sequence
 * verdict here is `assessSequenceDispatchReadiness` — the verdict Submit, the
 * Submission Center and the governed freeze / dispatch / transmit steps read —
 * mapped by `indVerdictFromAssessment`. The IND's own gate
 * (ind-lifecycle/ind-dispatch-gate.ts) was merged into it and deleted. A
 * snapshot records which gate produced it (`verdict.source`). A snapshot
 * written before P-33 carries none: the deleted gate wrote it, and it answered
 * a different question (it blocked on a hold read from the request body and on
 * checksums the governed path never sets), so it is reported as recorded under
 * the previous gate — never as drift.
 */

import type { IndDashboard } from './ind-dashboard';
import type { DispatchReadinessAssessment } from '../ectd/assess-dispatch-readiness';

/** The gate every dispatch verdict comes from since P-33, as a snapshot records it. */
export const DISPATCH_VERDICT_SOURCE = 'assess-dispatch-readiness' as const;

/** One blocker, warning or note of a verdict, by its code. */
export interface DispatchVerdictItem {
  code: string;
  message: string;
  sectionCode?: string | null;
}

/** The one dispatch verdict, in the shape the IND lifecycle routes answer and snapshot. */
export interface IndDispatchVerdict {
  /** The assessment's `gate.cleared` — never recomputed here. */
  canDispatch: boolean;
  /**
   * What blocks it: each error and release-blocking finding by its own code,
   * then each blocking gate no finding stands behind (Shadow Review, external
   * validation, release signature), by the corpus rule that gate enforces.
   * Empty exactly when `canDispatch` is true.
   */
  blockers: DispatchVerdictItem[];
  /** Warning findings that do not block (e.g. IND_SAFETY_REPORT_OVERDUE). */
  warnings: DispatchVerdictItem[];
  /** What the verdict did not assess, in the assessment's words (a clinical hold; an external validator). */
  notAssessed: string[];
  source: typeof DISPATCH_VERDICT_SOURCE;
}

type AssessmentForVerdict = Pick<DispatchReadinessAssessment, 'gate' | 'gates' | 'readiness' | 'unacknowledgedShadowCriticals'>;

/**
 * The IND routes' verdict from the one assessment. Pure. The structural
 * gate's own sentences ("N open error-severity validation finding(s) …") are
 * replaced by the findings they count, unless something no finding names
 * (an unacknowledged Shadow Review critical) also blocks it.
 */
export function indVerdictFromAssessment(a: AssessmentForVerdict): IndDispatchVerdict {
  const item = (f: { code: string; message: string; sectionCode: string | null }): DispatchVerdictItem => ({
    code: f.code,
    message: f.message,
    sectionCode: f.sectionCode,
  });
  const findings = a.readiness.findings;
  const findingBlockers = findings.filter((f) => f.severity === 'error' || f.blocksRelease === true).map(item);
  const gateBlockers = a.gates
    .filter((g) => !g.cleared)
    .filter((g) => g.key !== 'structural' || findingBlockers.length === 0 || a.unacknowledgedShadowCriticals !== 0)
    .flatMap((g) => g.blockers.map((message) => ({ code: g.rule?.id ?? g.key, message })));
  const notAssessed = [
    ...a.gates.map((g) => g.notAssessed).filter((n): n is string => typeof n === 'string'),
    ...findings.filter((f) => f.code === 'CLINICAL_HOLD_NOT_ASSESSED').map((f) => f.message),
  ];
  return {
    canDispatch: a.gate.cleared,
    blockers: a.gate.cleared ? [] : [...findingBlockers, ...gateBlockers],
    warnings: findings.filter((f) => f.severity === 'warning' && f.blocksRelease !== true).map(item),
    notAssessed: [...new Set(notAssessed)],
    source: DISPATCH_VERDICT_SOURCE,
  };
}

export interface SequenceGateSummary {
  sequenceId: number;
  sequenceNumber: string;
  type: string;
  status: string;
  canDispatch: boolean;
  blockerCount: number;
  warningCount: number;
  /** Blocker codes (e.g. CROSS_REFERENCE_LOA_MISSING), once each, for a compact at-a-glance view. */
  blockerCodes: string[];
  /** ISO time of the last persisted dispatch snapshot, or null if never verified. */
  lastVerifiedAt: string | null;
  /** True when the live verdict differs from the last snapshot recorded under the same gate. */
  drift: boolean;
  /** The last snapshot was recorded under the deleted IND gate (before P-33), so it is not compared. */
  recordedUnderPreviousGate: boolean;
}

/** A sequence's gate summary from its verdict. Pure. */
export function sequenceGateOf(
  seq: { id: number; sequenceNumber: string; type: string; status: string },
  verdict: Pick<IndDispatchVerdict, 'canDispatch' | 'blockers' | 'warnings'>,
): Omit<SequenceGateSummary, 'lastVerifiedAt' | 'drift' | 'recordedUnderPreviousGate'> {
  return {
    sequenceId: seq.id,
    sequenceNumber: seq.sequenceNumber,
    type: seq.type,
    status: seq.status,
    canDispatch: verdict.canDispatch,
    blockerCount: verdict.blockers.length,
    warningCount: verdict.warnings.length,
    blockerCodes: [...new Set(verdict.blockers.map((b) => b.code))],
  };
}

/** The minimal latest-snapshot shape used to annotate a gate. */
export interface LatestSnapshotLike {
  canDispatch: boolean;
  createdAt: string | Date;
  /** The stored verdict; its `source` names the gate that produced it. */
  verdict?: unknown;
}

/** The gate a snapshot was recorded under; null for a row written before P-33. Pure. */
export function snapshotSourceOf(snapshot: LatestSnapshotLike): string | null {
  const v = snapshot.verdict;
  const source = v && typeof v === 'object' ? (v as { source?: unknown }).source : undefined;
  return typeof source === 'string' ? source : null;
}

/**
 * Annotate a freshly-computed gate with its last-verified status: when it was
 * last snapshotted and whether the live verdict has drifted from that snapshot.
 * A snapshot recorded under another gate is not compared (see the header).
 * Pure.
 */
export function annotateGateWithSnapshot(
  gate: Omit<SequenceGateSummary, 'lastVerifiedAt' | 'drift' | 'recordedUnderPreviousGate'>,
  snapshot: LatestSnapshotLike | null,
): SequenceGateSummary {
  const lastVerifiedAt = snapshot
    ? snapshot.createdAt instanceof Date
      ? snapshot.createdAt.toISOString()
      : snapshot.createdAt
    : null;
  const recordedUnderPreviousGate = snapshot ? snapshotSourceOf(snapshot) !== DISPATCH_VERDICT_SOURCE : false;
  const drift = snapshot && !recordedUnderPreviousGate ? snapshot.canDispatch !== gate.canDispatch : false;
  return { ...gate, lastVerifiedAt, drift, recordedUnderPreviousGate };
}

export interface IndCockpit {
  dashboard: IndDashboard;
  sequenceGates: SequenceGateSummary[];
  /** Module 1.4 external-dependency authorization status (from the register). */
  crossReferences?: {
    total: number;
    withLoa: number;
    missingLoa: number;
    ready: boolean;
  };
  summary: {
    totalSequences: number;
    dispatchReady: number;
    blocked: number;
    /** Sequences with no recorded dispatch snapshot. */
    unverified: number;
    /** Sequences whose live verdict differs from their last snapshot. */
    drifted: number;
    /** Sequences whose last snapshot was recorded under the previous gate (before P-33). */
    recordedUnderPreviousGate: number;
  };
}

export type DriftReason = 'drifted' | 'never_verified' | 'recorded_under_previous_gate';

export interface DriftDigestEntry {
  sequenceId: number;
  sequenceNumber: string;
  type: string;
  status: string;
  /** Why it surfaced: the live verdict changed, it was never snapshotted, or its last snapshot predates the one verdict. */
  reason: DriftReason;
  canDispatch: boolean;
  lastVerifiedAt: string | null;
}

export interface DriftDigest {
  entries: DriftDigestEntry[];
  summary: { total: number; drifted: number; neverVerified: number; recordedUnderPreviousGate: number };
}

function driftReasonOf(g: SequenceGateSummary): DriftReason | null {
  if (g.drift) return 'drifted';
  if (g.lastVerifiedAt === null) return 'never_verified';
  return g.recordedUnderPreviousGate ? 'recorded_under_previous_gate' : null;
}

/**
 * Filter annotated gates to those needing attention: a drifted live verdict
 * (takes precedence), a sequence never verified, or one last verified under
 * the previous gate — re-snapshot it under the one verdict. Pure.
 */
export function buildDriftDigest(gates: SequenceGateSummary[]): DriftDigest {
  const entries: DriftDigestEntry[] = [];
  for (const g of gates) {
    const reason = driftReasonOf(g);
    if (!reason) continue;
    entries.push({
      sequenceId: g.sequenceId,
      sequenceNumber: g.sequenceNumber,
      type: g.type,
      status: g.status,
      reason,
      canDispatch: g.canDispatch,
      lastVerifiedAt: g.lastVerifiedAt,
    });
  }
  return {
    entries,
    summary: {
      total: entries.length,
      drifted: entries.filter((e) => e.reason === 'drifted').length,
      neverVerified: entries.filter((e) => e.reason === 'never_verified').length,
      recordedUnderPreviousGate: entries.filter((e) => e.reason === 'recorded_under_previous_gate').length,
    },
  };
}

/** Fold the dashboard + per-sequence gates into the cockpit with a roll-up. */
export function buildIndCockpit(input: {
  dashboard: IndDashboard;
  sequenceGates: SequenceGateSummary[];
  crossReferences?: IndCockpit['crossReferences'];
}): IndCockpit {
  const gates = input.sequenceGates;
  const dispatchReady = gates.filter((g) => g.canDispatch).length;
  return {
    dashboard: input.dashboard,
    sequenceGates: gates,
    ...(input.crossReferences ? { crossReferences: input.crossReferences } : {}),
    summary: {
      totalSequences: gates.length,
      dispatchReady,
      blocked: gates.length - dispatchReady,
      unverified: gates.filter((g) => g.lastVerifiedAt === null).length,
      drifted: gates.filter((g) => g.drift).length,
      recordedUnderPreviousGate: gates.filter((g) => g.recordedUnderPreviousGate).length,
    },
  };
}
