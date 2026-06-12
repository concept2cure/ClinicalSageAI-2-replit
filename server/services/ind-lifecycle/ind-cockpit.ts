/**
 * IND submission cockpit combiner.
 *
 * The single-call program view: the submission-level dashboard plus a
 * per-sequence dispatch-gate summary, with a roll-up of how many sequences are
 * dispatch-ready vs blocked. Pure / deterministic — the route does the loading
 * and per-sequence gate evaluation; this folds the results together.
 */

import type { IndDashboard } from './ind-dashboard';

export interface SequenceGateSummary {
  sequenceId: number;
  sequenceNumber: string;
  type: string;
  status: string;
  canDispatch: boolean;
  blockerCount: number;
  warningCount: number;
  /** Blocker codes (e.g. MISSING_CHECKSUMS) for a compact at-a-glance view. */
  blockerCodes: string[];
  /** ISO time of the last persisted dispatch snapshot, or null if never verified. */
  lastVerifiedAt: string | null;
  /** True when the live verdict differs from the last recorded snapshot. */
  drift: boolean;
}

/** The minimal latest-snapshot shape used to annotate a gate. */
export interface LatestSnapshotLike {
  canDispatch: boolean;
  createdAt: string | Date;
}

/**
 * Annotate a freshly-computed gate with its last-verified status: when it was
 * last snapshotted and whether the live verdict has drifted from that snapshot.
 * Pure.
 */
export function annotateGateWithSnapshot(
  gate: Omit<SequenceGateSummary, 'lastVerifiedAt' | 'drift'>,
  snapshot: LatestSnapshotLike | null,
): SequenceGateSummary {
  const lastVerifiedAt = snapshot
    ? snapshot.createdAt instanceof Date
      ? snapshot.createdAt.toISOString()
      : snapshot.createdAt
    : null;
  const drift = snapshot ? snapshot.canDispatch !== gate.canDispatch : false;
  return { ...gate, lastVerifiedAt, drift };
}

export interface IndCockpit {
  dashboard: IndDashboard;
  sequenceGates: SequenceGateSummary[];
  summary: {
    totalSequences: number;
    dispatchReady: number;
    blocked: number;
    /** Sequences with no recorded dispatch snapshot. */
    unverified: number;
    /** Sequences whose live verdict differs from their last snapshot. */
    drifted: number;
  };
}

export interface DriftDigestEntry {
  sequenceId: number;
  sequenceNumber: string;
  type: string;
  status: string;
  /** Why it surfaced: the live verdict changed, or it was never snapshotted. */
  reason: 'drifted' | 'never_verified';
  canDispatch: boolean;
  lastVerifiedAt: string | null;
}

export interface DriftDigest {
  entries: DriftDigestEntry[];
  summary: { total: number; drifted: number; neverVerified: number };
}

/**
 * Filter annotated gates to those needing attention: a drifted live verdict
 * (takes precedence) or a sequence never verified. Pure.
 */
export function buildDriftDigest(gates: SequenceGateSummary[]): DriftDigest {
  const entries: DriftDigestEntry[] = [];
  for (const g of gates) {
    const reason: 'drifted' | 'never_verified' | null = g.drift
      ? 'drifted'
      : g.lastVerifiedAt === null
        ? 'never_verified'
        : null;
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
    },
  };
}

/** Fold the dashboard + per-sequence gates into the cockpit with a roll-up. */
export function buildIndCockpit(input: {
  dashboard: IndDashboard;
  sequenceGates: SequenceGateSummary[];
}): IndCockpit {
  const gates = input.sequenceGates;
  const dispatchReady = gates.filter((g) => g.canDispatch).length;
  return {
    dashboard: input.dashboard,
    sequenceGates: gates,
    summary: {
      totalSequences: gates.length,
      dispatchReady,
      blocked: gates.length - dispatchReady,
      unverified: gates.filter((g) => g.lastVerifiedAt === null).length,
      drifted: gates.filter((g) => g.drift).length,
    },
  };
}
