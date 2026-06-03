/**
 * Living Record Spine — Reconciliation Engine (orchestration).
 *
 * Two entry points:
 *   - reconcileClaim   the reconcile-on-write path: fold a claim's value into or
 *                      against the canonical fact for its (entity, field).
 *   - runDriftSentinel the scheduled job: scan a program's bindings, flag every
 *                      value that diverges from its canonical fact, and hand the
 *                      divergence to the existing cascade (change-router) so the
 *                      downstream artifacts restale through the path that
 *                      already exists.
 *
 * Pure comparison/decision logic is in value-reconciliation.ts; persistence is
 * in canonical-fact-store.ts; this module only composes them (plus the claim
 * lifecycle machine and the cascade router). It forks no existing subsystem.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.3–3.4.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { evidenceClaims } from '../../../shared/schema';
import { propagateRegulatoryChange } from '../living-file/change-router.service';
import {
  canTransitionVerification,
  type ClaimVerification,
} from './claim-lifecycle';
import { claimIdFromTarget, claimTarget } from './object-model';
import {
  bindToFact,
  factValueView,
  getDriftCandidates,
  resolveActiveFact,
  setBindingStatus,
  setFactStatus,
  upsertCanonicalFact,
  writeDrift,
} from './canonical-fact-store';
import {
  detectDrift,
  numToCanonical,
  reconcileClaimValue,
  type ClaimValueView,
  type ReconcileResult,
} from './value-reconciliation';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper
// ─────────────────────────────────────────────────────────────────────────────

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Apply a verification move only if it is a legal, non-identity transition. */
async function setClaimVerification(
  claimId: number,
  from: ClaimVerification,
  to: ClaimVerification,
  extra: Partial<{ canonicalFactId: string }> = {}
): Promise<void> {
  if (from !== to && !canTransitionVerification(from, to)) {
    // Out-of-band state; record nothing rather than forcing an illegal move.
    return;
  }
  await db
    .update(evidenceClaims)
    .set({ verification: to, ...extra })
    .where(eq(evidenceClaims.id, claimId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile-on-write
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileClaimParams {
  claimId: number;
  /** UUID of the regulatory_programs row that scopes the canonical fact. */
  programId: string;
  organizationId: number;
  tolerance?: number;
  actor?: number | null;
}

export interface ReconcileClaimOutcome extends ReconcileResult {
  claimId: number;
  factId: string | null;
}

/**
 * Reconcile a single claim against the canonical fact store. Establishes the
 * fact when none exists, verifies the claim when it agrees, or disputes both
 * when it diverges. Never silently overwrites an agreed value.
 */
export async function reconcileClaim(params: ReconcileClaimParams): Promise<ReconcileClaimOutcome> {
  const [claim] = await db
    .select()
    .from(evidenceClaims)
    .where(eq(evidenceClaims.id, params.claimId))
    .limit(1);

  if (!claim) {
    return {
      verdict: 'skipped',
      reason: 'claim not found',
      claimVerification: 'unverified',
      factStatusAfter: null,
      claimId: params.claimId,
      factId: null,
    };
  }

  const claimValue: ClaimValueView = {
    valueNum: num(claim.valueNum),
    valueText: claim.valueText ?? null,
    unit: claim.unit ?? null,
    valueType: claim.valueType ?? 'text',
    hasValue: Boolean(claim.entity && claim.field && (num(claim.valueNum) !== null || claim.valueText)),
  };

  const currentVerification = (claim.verification ?? 'unverified') as ClaimVerification;
  const existingFact = claimValue.hasValue
    ? await resolveActiveFact(params.programId, claim.entity!, claim.field!)
    : null;

  const result = reconcileClaimValue({
    claim: claimValue,
    existingFact: existingFact ? factValueView(existingFact) : null,
    tolerance: params.tolerance,
  });

  let factId: string | null = existingFact?.id ?? null;

  if (result.verdict === 'established') {
    const fact = await upsertCanonicalFact({
      organizationId: params.organizationId,
      programId: params.programId,
      entity: claim.entity!,
      field: claim.field!,
      valueNum: claimValue.valueNum,
      valueText: claimValue.valueText,
      unit: claimValue.unit,
      comparator: claim.comparator ?? '=',
      valueType: claimValue.valueType,
      establishedByClaimId: claim.id,
      establishedBySourceId: claim.sourceId ?? null,
      confidence: num(claim.confidence) ?? 0.5,
      createdBy: params.actor ?? null,
    });
    factId = fact.id;
    await bindToFact({
      organizationId: params.organizationId,
      programId: params.programId,
      factId: fact.id,
      target: claimTarget(claim.id),
      bindingKind: 'mirror',
      observedValue:
        claimValue.valueNum !== null ? numToCanonical(claimValue.valueNum) : claimValue.valueText,
      createdBy: params.actor ?? null,
    });
    await setClaimVerification(claim.id, currentVerification, 'verified', { canonicalFactId: fact.id });
  } else if (result.verdict === 'agreed' && existingFact) {
    await bindToFact({
      organizationId: params.organizationId,
      programId: params.programId,
      factId: existingFact.id,
      target: claimTarget(claim.id),
      bindingKind: 'mirror',
      observedValue:
        claimValue.valueNum !== null ? numToCanonical(claimValue.valueNum) : claimValue.valueText,
      createdBy: params.actor ?? null,
    });
    await setClaimVerification(claim.id, currentVerification, 'verified', { canonicalFactId: existingFact.id });
  } else if (result.verdict === 'disputed' && existingFact) {
    await setFactStatus(existingFact.id, 'disputed');
    await setClaimVerification(claim.id, currentVerification, 'disputed', { canonicalFactId: existingFact.id });
  }

  return { ...result, claimId: claim.id, factId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift Sentinel (the job)
// ─────────────────────────────────────────────────────────────────────────────

export interface DriftSentinelResultItem {
  bindingId: string;
  factId: string;
  target: string;
  outcome: 'drift' | 'healed' | 'ok';
  driftType?: string;
  expected?: string;
  observed?: string;
  cascaded?: boolean;
}

export interface DriftSentinelReport {
  programId: string;
  scanned: number;
  driftDetected: number;
  healed: number;
  items: DriftSentinelResultItem[];
}

/**
 * Scan every comparable binding in a program. For each value that diverges from
 * its canonical fact: write a drift row, mark the binding drifted, drift the
 * bound claim's verification, and fan the change out through the existing
 * cascade router. For each previously-drifted binding that now agrees: heal it.
 */
export async function runDriftSentinel(
  programId: string,
  opts: { tolerance?: number } = {}
): Promise<DriftSentinelReport> {
  const candidates = await getDriftCandidates(programId);
  const items: DriftSentinelResultItem[] = [];
  let driftDetected = 0;
  let healed = 0;

  for (const { binding, fact } of candidates) {
    const finding = detectDrift(
      {
        bindingKind: binding.bindingKind as 'mirror' | 'derived' | 'manual_override',
        observedValue: binding.observedValue ?? null,
        transform: (binding.transform as Record<string, unknown> | null) ?? null,
      },
      factValueView(fact),
      { tolerance: opts.tolerance }
    );

    if (!finding.drift) {
      // Self-heal: a binding that previously drifted but now agrees.
      if (binding.bindingStatus === 'drifted') {
        await setBindingStatus(binding.id, 'bound');
        const claimId = claimIdFromTarget(binding.target);
        if (claimId !== null) {
          await db
            .update(evidenceClaims)
            .set({ verification: 'verified' })
            .where(and(eq(evidenceClaims.id, claimId), eq(evidenceClaims.verification, 'drifted')));
        }
        healed += 1;
        items.push({ bindingId: binding.id, factId: fact.id, target: binding.target, outcome: 'healed' });
      } else {
        items.push({ bindingId: binding.id, factId: fact.id, target: binding.target, outcome: 'ok' });
      }
      continue;
    }

    driftDetected += 1;
    let cascaded = false;
    const claimId = claimIdFromTarget(binding.target);

    // Fan out to the existing cascade for claim-kind drift (it carries the
    // legacy integer program id the change-router needs).
    if (claimId !== null) {
      try {
        const [claim] = await db
          .select({ programId: evidenceClaims.programId })
          .from(evidenceClaims)
          .where(eq(evidenceClaims.id, claimId))
          .limit(1);
        await propagateRegulatoryChange({
          organizationId: binding.organizationId,
          programId,
          legacyProgramId: claim?.programId ?? undefined,
          event: 'claim_changed',
          sourceId: String(claimId),
          sourceLabel: `${fact.entity}.${fact.field}`,
          reason: `value drift detected by drift sentinel (${finding.driftType})`,
        });
        cascaded = true;
        await db
          .update(evidenceClaims)
          .set({ verification: 'drifted' })
          .where(eq(evidenceClaims.id, claimId));
      } catch {
        // Cascade is best-effort; the drift row is the durable record.
      }
    }

    await writeDrift({
      organizationId: binding.organizationId,
      programId,
      factId: fact.id,
      bindingId: binding.id,
      expectedValue: finding.expected,
      observedValue: finding.observed,
      driftType: finding.driftType ?? 'value_mismatch',
      severity: finding.severity,
      cascadeActionId: cascaded ? 'change-router' : null,
    });
    await setBindingStatus(binding.id, 'drifted');

    items.push({
      bindingId: binding.id,
      factId: fact.id,
      target: binding.target,
      outcome: 'drift',
      driftType: finding.driftType ?? 'value_mismatch',
      expected: finding.expected,
      observed: finding.observed,
      cascaded,
    });
  }

  return { programId, scanned: candidates.length, driftDetected, healed, items };
}

// Re-export the read model for ergonomic imports.
export { programFactDriftReport } from './canonical-fact-store';
