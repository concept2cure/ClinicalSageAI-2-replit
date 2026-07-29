/**
 * Living Record Spine — Fact Propagation (write the agreed value into citations).
 *
 * The last mile of the governed change path: after a canonical fact changed and
 * its citations were flagged (fact-change-orchestrator.ts), this module applies
 * the new value to every divergent **claim** citation — the one citation kind
 * that carries a structured value the platform can set mechanically.
 *
 * Deliberate boundaries:
 *   - prose targets (section:/paragraph:/document:) are skipped and reported —
 *     running text changes travel the resolution rewrite workflow, never a
 *     silent mechanical edit;
 *   - manual overrides are never overwritten;
 *   - only the active fact value propagates, an explicit reason is required,
 *     and the action is audited (canonical_fact.propagated).
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.5 step 7.
 */

import { eq } from 'drizzle-orm';

import { db } from '../../db';
import { evidenceClaims } from '../../../shared/schema';
import type { CanonicalFact, FactBinding } from '../../../shared/schema/living-record-spine';
import auditService from '../auditService';
import {
  factValueView,
  getFact,
  listBindingsForFact,
  listOpenDriftForFact,
  recordObservedValue,
  resolveDrift,
  setBindingStatus,
} from './canonical-fact-store';
import {
  bindingImpactInput,
  classifyBindingImpact,
  factChangeFailure as fail,
  propagationEligibility,
  type FactChangeFailure,
  type PropagationSkipReason,
} from './fact-change';
import { toCanonicalValue, type FactValueView } from './value-reconciliation';

export interface PropagateFactParams {
  factId: string;
  organizationId: number;
  /** Reason for change — required; recorded on the audit trail. */
  reason: string;
  actor: number | null;
  /** Restrict propagation to these bindings; omitted = every eligible citation. */
  bindingIds?: string[];
  tolerance?: number;
}

export interface PropagatedCitation {
  bindingId: string;
  target: string;
  claimId: number;
  previousObserved: string;
  newValue: string;
}

export interface SkippedCitation {
  bindingId: string;
  target: string;
  reason: PropagationSkipReason | 'not_selected';
}

export interface PropagateFactResult {
  ok: true;
  fact: CanonicalFact;
  propagated: PropagatedCitation[];
  skipped: SkippedCitation[];
  driftResolved: number;
}

/** Write the fact's value into one citing claim and heal its binding. */
async function applyToClaimCitation(
  fact: CanonicalFact,
  binding: FactBinding,
  claimId: number,
  newValue: string
): Promise<void> {
  await db
    .update(evidenceClaims)
    .set({
      valueNum: fact.valueNum,
      valueText: fact.valueText,
      unit: fact.unit,
      valueType: fact.valueType,
      comparator: fact.comparator,
      verification: 'verified',
      canonicalFactId: fact.id,
    })
    .where(eq(evidenceClaims.id, claimId));
  await recordObservedValue(binding.id, newValue);
  await setBindingStatus(binding.id, 'bound');
}

/** Resolve the open drift rows of the bindings the propagation just healed. */
async function closeHealedDrift(
  factId: string,
  healedBindingIds: Set<string>,
  reason: string,
  actor: number | null
): Promise<number> {
  if (healedBindingIds.size === 0) return 0;
  let resolved = 0;
  const openDrift = await listOpenDriftForFact(factId);
  for (const drift of openDrift) {
    if (drift.bindingId && healedBindingIds.has(drift.bindingId)) {
      await resolveDrift(drift.id, `value propagated to citation: ${reason}`, actor);
      resolved += 1;
    }
  }
  return resolved;
}

function classifyForPropagation(
  binding: FactBinding,
  factView: FactValueView,
  tolerance: number | undefined
): { claimId: number; observed: string } | { skipReason: PropagationSkipReason } {
  const impact = classifyBindingImpact(bindingImpactInput(binding), factView, { tolerance });
  const eligibility = propagationEligibility(impact);
  if (!eligibility.eligible) return { skipReason: eligibility.reason };
  return { claimId: impact.claimId!, observed: impact.observed };
}

/**
 * Write the agreed value into every divergent claim citation of a fact: the
 * claim's structured value is set to the fact's, its verification returns to
 * 'verified', the binding heals to 'bound', and the open drift rows resolve.
 */
export async function propagateFactToCitations(
  params: PropagateFactParams
): Promise<PropagateFactResult | FactChangeFailure> {
  const reason = (params.reason ?? '').trim();
  if (!reason) return fail('invalid', 'reason for change is required');

  const fact = await getFact(params.factId);
  if (!fact || fact.organizationId !== params.organizationId) {
    return fail('not_found', 'Fact not found');
  }
  if (fact.status !== 'active') {
    return fail('conflict', `Only the active value propagates; this fact is ${fact.status}`);
  }

  const factView = factValueView(fact);
  const newValue = toCanonicalValue(factView);
  const selected = params.bindingIds ? new Set(params.bindingIds) : null;

  const bindings = await listBindingsForFact(fact.id);
  const propagated: PropagatedCitation[] = [];
  const skipped: SkippedCitation[] = [];

  for (const binding of bindings) {
    if (selected && !selected.has(binding.id)) {
      skipped.push({ bindingId: binding.id, target: binding.target, reason: 'not_selected' });
      continue;
    }
    const verdict = classifyForPropagation(binding, factView, params.tolerance);
    if ('skipReason' in verdict) {
      skipped.push({ bindingId: binding.id, target: binding.target, reason: verdict.skipReason });
      continue;
    }
    await applyToClaimCitation(fact, binding, verdict.claimId, newValue);
    propagated.push({
      bindingId: binding.id,
      target: binding.target,
      claimId: verdict.claimId,
      previousObserved: verdict.observed,
      newValue,
    });
  }

  const driftResolved = await closeHealedDrift(
    fact.id,
    new Set(propagated.map(p => p.bindingId)),
    reason,
    params.actor
  );

  await auditService.logAction({
    tenantId: fact.organizationId,
    userId: params.actor ?? 'system',
    action: 'canonical_fact.propagated',
    resourceType: 'canonical_fact',
    resourceId: fact.id,
    details: {
      programId: fact.programId,
      entity: fact.entity,
      field: fact.field,
      newValue,
      reason,
      propagatedCount: propagated.length,
      propagatedTargets: propagated.map(p => p.target),
      skipped: skipped.map(s => ({ target: s.target, reason: s.reason })),
      driftResolved,
    },
  });

  return { ok: true, fact, propagated, skipped, driftResolved };
}
