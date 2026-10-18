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
import type { PacketAuditReceipt } from '../regulatory-graph/defense-packet-staleness.service';
import { combineAuditRowOutcomes, type AuditRowOutcome } from '../audit/audit-write-outcome';
import {
  canTransitionVerification,
  type ClaimVerification,
} from './claim-lifecycle';
import { claimIdFromTarget, claimTarget } from './object-model';
import { linkLegacyProgram, resolveUuidProgram } from './program-link';
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
      // 2026-10-15: was `?? 0.5` — a claim with no score made a fact scored 0.5.
      confidence: num(claim.confidence),
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
  packetAuditReceipts?: PacketAuditReceipt[];
  auditTrail?: AuditRowOutcome;
}

export interface DriftSentinelReport {
  programId: string;
  scanned: number;
  driftDetected: number;
  healed: number;
  items: DriftSentinelResultItem[];
  auditTrail?: AuditRowOutcome;
}

/**
 * Scan every comparable binding in a program. For each value that diverges from
 * its canonical fact: write a drift row, mark the binding drifted, drift the
 * bound claim's verification, and fan the change out through the existing
 * cascade router. For each previously-drifted binding that now agrees: heal it.
 */
type DriftCandidate = Awaited<ReturnType<typeof getDriftCandidates>>[number];

async function cascadeBindingDrift(binding: DriftCandidate['binding'], fact: DriftCandidate['fact'], programId: string, finding: ReturnType<typeof detectDrift>) {
  let cascaded = false;
    let packetAuditReceipts: PacketAuditReceipt[] = [];
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
        const result = await propagateRegulatoryChange({
          organizationId: binding.organizationId,
          programId,
          legacyProgramId: claim?.programId ?? undefined,
          event: 'claim_changed',
          sourceId: String(claimId),
          sourceLabel: `${fact.entity}.${fact.field}`,
          reason: `value drift detected by drift sentinel (${finding.driftType})`,
        });
        packetAuditReceipts = result?.packetAuditReceipts ?? [];
        cascaded = true;
        await db
          .update(evidenceClaims)
          .set({ verification: 'drifted' })
          .where(eq(evidenceClaims.id, claimId));
      } catch {
        // Cascade is best-effort; the drift row is the durable record.
      }
    }
  return { cascaded, packetAuditReceipts };
}

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
    const { cascaded, packetAuditReceipts } = await cascadeBindingDrift(binding, fact, programId, finding);

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
      ...(packetAuditReceipts.length ? { packetAuditReceipts,
        auditTrail: combineAuditRowOutcomes(packetAuditReceipts[0].auditTrail,
          ...packetAuditReceipts.slice(1).map(receipt => receipt.auditTrail)) } : {}),
    });
  }

  const attempted = items.flatMap(item => item.packetAuditReceipts ?? []);
  return { programId, scanned: candidates.length, driftDetected, healed, items,
    ...(attempted.length ? { auditTrail: combineAuditRowOutcomes(attempted[0].auditTrail,
      ...attempted.slice(1).map(receipt => receipt.auditTrail)) } : {}) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Program-level reconcile (the claim write path, dual-id contract)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileProgramResult {
  programId: string;
  reconciled: number;
  established: number;
  agreed: number;
  disputed: number;
  skipped: number;
  outcomes: ReconcileClaimOutcome[];
}

/**
 * Reconcile every current claim in a program against the canonical fact store.
 *
 * Claims are scoped by the legacy integer program id (evidence_claims), while
 * facts are scoped by the uuid regulatory_programs id — the platform's
 * established dual-id contract (the change-router takes both the same way). The
 * caller supplies both; there is no DB-level bridge between the two namespaces.
 */
export async function reconcileProgramClaims(params: {
  /** UUID of the regulatory_programs row (scopes the canonical facts). */
  programId: string;
  /** Integer evidence_claims.program_id (locates the program's claims). */
  legacyProgramId: number;
  organizationId: number;
  tolerance?: number;
  actor?: number | null;
}): Promise<ReconcileProgramResult> {
  // Pairing the two ids here is an explicit operator association, so record the
  // bridge. Subsequent reconcileClaimById calls can then resolve the uuid
  // program from the claim id alone — the reconcile-on-write hook.
  await linkLegacyProgram({
    organizationId: params.organizationId,
    legacyProgramId: params.legacyProgramId,
    programId: params.programId,
    createdBy: params.actor ?? null,
  });

  const claims = await db
    .select({ id: evidenceClaims.id })
    .from(evidenceClaims)
    .where(
      and(
        eq(evidenceClaims.programId, params.legacyProgramId),
        eq(evidenceClaims.organizationId, params.organizationId),
        eq(evidenceClaims.isCurrent, true)
      )
    );

  const outcomes: ReconcileClaimOutcome[] = [];
  const tally = { established: 0, agreed: 0, disputed: 0, skipped: 0 };
  for (const c of claims) {
    const outcome = await reconcileClaim({
      claimId: c.id,
      programId: params.programId,
      organizationId: params.organizationId,
      tolerance: params.tolerance,
      actor: params.actor,
    });
    outcomes.push(outcome);
    tally[outcome.verdict] += 1;
  }

  return {
    programId: params.programId,
    reconciled: outcomes.length,
    ...tally,
    outcomes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile-on-write hook (resolve the uuid program from the claim id alone)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileClaimByIdOutcome extends ReconcileClaimOutcome {
  resolvedProgramId: string | null;
}

/**
 * Reconcile a claim given only its id. Resolves the claim's org + legacy program,
 * looks up the uuid program via the program-id bridge, then reconciles. This is
 * the hook to call right after a claim is created or its value changes. If no
 * program link exists, it no-ops (verdict 'skipped') rather than guessing a
 * mapping.
 */
export async function reconcileClaimById(
  claimId: number,
  opts: { tolerance?: number; actor?: number | null } = {}
): Promise<ReconcileClaimByIdOutcome> {
  const [claim] = await db
    .select({
      id: evidenceClaims.id,
      programId: evidenceClaims.programId,
      organizationId: evidenceClaims.organizationId,
    })
    .from(evidenceClaims)
    .where(eq(evidenceClaims.id, claimId))
    .limit(1);

  if (!claim) {
    return {
      verdict: 'skipped',
      reason: 'claim not found',
      claimVerification: 'unverified',
      factStatusAfter: null,
      claimId,
      factId: null,
      resolvedProgramId: null,
    };
  }

  const programId = await resolveUuidProgram(claim.programId, claim.organizationId);
  if (!programId) {
    return {
      verdict: 'skipped',
      reason: 'no program link for the legacy program; record one via POST /programs/:programId/link',
      claimVerification: 'unverified',
      factStatusAfter: null,
      claimId,
      factId: null,
      resolvedProgramId: null,
    };
  }

  const outcome = await reconcileClaim({
    claimId,
    programId,
    organizationId: claim.organizationId,
    tolerance: opts.tolerance,
    actor: opts.actor,
  });
  return { ...outcome, resolvedProgramId: programId };
}

// Re-export the read model for ergonomic imports.
export { programFactDriftReport } from './canonical-fact-store';
