/**
 * Living Record Spine — Fact-Change Orchestrator (governed change propagation).
 *
 * The fact-centric half of change propagation. The Drift Sentinel is the pull
 * path (scan bindings, find divergence); this module is the push path: an
 * operator changes a governed value once, and the platform
 *
 *   1. previews the impact — every citation (fact_binding) of the value,
 *      classified: will drift / already consistent / override / not evaluable;
 *   2. applies the change as a new fact version (never mutating in place),
 *      carrying every binding forward to the new version;
 *   3. flags each now-divergent citation immediately (fact_drift rows, binding
 *      status, claim verification) without waiting for the sentinel sweep;
 *   4. fans the change out through the existing cascade router so downstream
 *      artifacts (defense packets, governed dependencies) restale;
 *   5. opens a governed resolution plan (trigger 'impact_propagation') listing
 *      every affected object, so the propagated update travels through the
 *      resolution/re-approval workflow rather than as silent edits;
 *   6. writes the audit record with the operator's reason for change.
 *
 * Pure classification logic is in fact-change.ts; persistence is in
 * canonical-fact-store.ts; the cascade is change-router.service.ts; governance
 * is resolution-planner.ts. This module only composes them.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.5 (Governed Fact Change).
 */

import { inArray } from 'drizzle-orm';

import { db } from '../../db';
import { evidenceClaims } from '../../../shared/schema';
import type { CanonicalFact, FactBinding, FactDrift } from '../../../shared/schema/living-record-spine';
import auditService from '../auditService';
import { propagateRegulatoryChange } from '../living-file/change-router.service';
import { createResolutionPlan } from '../resolution/resolution-planner';
import type { AffectedObject } from '../../../shared/schema/resolution';
import {
  factValueView,
  getFact,
  listBindingsForFact,
  listOpenDriftForFact,
  resolveActiveFact,
  setBindingStatus,
  supersedeAndReversion,
  upsertCanonicalFact,
  writeDrift,
} from './canonical-fact-store';
import {
  classifyBindingImpact,
  hasProposedValue,
  isNoopChange,
  proposedFactView,
  summarizeImpacts,
  type BindingImpact,
  type FactChangeImpactSummary,
  type ProposedFactValue,
} from './fact-change';
import { resolveLegacyProgram } from './program-link';
import { toCanonicalValue } from './value-reconciliation';

// ─────────────────────────────────────────────────────────────────────────────
// Shared result envelope
// ─────────────────────────────────────────────────────────────────────────────

export type FactChangeFailureCode = 'not_found' | 'conflict' | 'invalid';

export interface FactChangeFailure {
  ok: false;
  code: FactChangeFailureCode;
  message: string;
}

function fail(code: FactChangeFailureCode, message: string): FactChangeFailure {
  return { ok: false, code, message };
}

function bindingImpactInput(b: FactBinding) {
  return {
    id: b.id,
    target: b.target,
    targetKind: b.targetKind,
    bindingKind: b.bindingKind,
    observedValue: b.observedValue,
    transform: (b.transform as Record<string, unknown> | null) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Impact preview
// ─────────────────────────────────────────────────────────────────────────────

export interface FactChangePreview {
  ok: true;
  fact: CanonicalFact;
  currentValue: string;
  proposedValue: string;
  isNoop: boolean;
  impacts: BindingImpact[];
  summary: FactChangeImpactSummary;
  openDrift: FactDrift[];
}

/**
 * Enumerate every citation of a governed value and classify what a proposed
 * change would do to it. Read-only. With no proposal, previews the current
 * binding state (which citations already diverge today).
 */
export async function previewFactChange(params: {
  factId: string;
  organizationId: number;
  proposed?: ProposedFactValue;
  tolerance?: number;
}): Promise<FactChangePreview | FactChangeFailure> {
  const fact = await getFact(params.factId);
  if (!fact || fact.organizationId !== params.organizationId) {
    return fail('not_found', 'Fact not found');
  }

  const currentView = factValueView(fact);
  const nextView = params.proposed ? proposedFactView(currentView, params.proposed) : currentView;

  const bindings = await listBindingsForFact(fact.id);
  const impacts = bindings.map(b =>
    classifyBindingImpact(bindingImpactInput(b), nextView, { tolerance: params.tolerance })
  );
  const openDrift = await listOpenDriftForFact(fact.id);

  return {
    ok: true,
    fact,
    currentValue: toCanonicalValue(currentView),
    proposedValue: toCanonicalValue(nextView),
    isNoop: params.proposed ? isNoopChange(currentView, nextView) : true,
    impacts,
    summary: summarizeImpacts(impacts),
    openDrift,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Governed apply
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyFactChangeParams {
  factId: string;
  organizationId: number;
  newValue: ProposedFactValue;
  /** Reason for change — required; recorded on the audit trail and the plan. */
  reason: string;
  actor: number | null;
  tolerance?: number;
}

export interface ApplyFactChangeResult {
  ok: true;
  previousFact: CanonicalFact;
  newFact: CanonicalFact;
  bindingsCarried: number;
  impacts: BindingImpact[];
  summary: FactChangeImpactSummary;
  driftCreated: number;
  claimsMarkedDrifted: number;
  cascadedClaims: number;
  resolutionPlanId: string | null;
  resolutionPlanSkippedReason: string | null;
}

/**
 * Apply a governed change to a canonical fact and propagate it. The fact is
 * re-versioned (full history kept), every binding follows the new version, each
 * now-divergent citation is flagged immediately, the cascade restales
 * downstream artifacts, and a resolution plan is opened so the propagated
 * update is reviewed and re-approved — never silently written into documents.
 */
export async function applyFactChange(
  params: ApplyFactChangeParams
): Promise<ApplyFactChangeResult | FactChangeFailure> {
  const reason = (params.reason ?? '').trim();
  if (!reason) return fail('invalid', 'reason for change is required');
  if (!hasProposedValue(params.newValue)) {
    return fail('invalid', 'newValue must carry a numeric or text value');
  }

  const fact = await getFact(params.factId);
  if (!fact || fact.organizationId !== params.organizationId) {
    return fail('not_found', 'Fact not found');
  }
  if (fact.status === 'superseded' || fact.status === 'retracted') {
    return fail(
      'conflict',
      `Fact is ${fact.status}; change the active version of ${fact.entity}.${fact.field} instead`
    );
  }

  const currentView = factValueView(fact);
  const nextView = proposedFactView(currentView, params.newValue);
  if (isNoopChange(currentView, nextView)) {
    return fail('invalid', 'proposed value is identical to the current value');
  }

  // Re-version; bindings are carried forward inside supersedeAndReversion.
  const newFact = await supersedeAndReversion(fact, {
    valueNum: nextView.valueNum,
    valueText: nextView.valueText,
    unit: nextView.unit,
    valueType: nextView.valueType,
    confidence: 1.0, // operator-asserted value
    createdBy: params.actor ?? null,
  });

  const bindings = await listBindingsForFact(newFact.id);
  const impacts = bindings.map(b =>
    classifyBindingImpact(bindingImpactInput(b), factValueView(newFact), {
      tolerance: params.tolerance,
    })
  );
  const summary = summarizeImpacts(impacts);
  const drifting = impacts.filter(i => i.outcome === 'will_drift');

  const driftCreated = await flagDivergentCitations(newFact, drifting);
  const claimsMarkedDrifted = await markClaimsDrifted(summary.affectedClaimIds);
  const legacyProgramId = await resolveLegacyProgram(newFact.programId, newFact.organizationId);
  const cascadedClaims = await cascadeDriftedClaims(
    newFact,
    summary.affectedClaimIds,
    legacyProgramId,
    reason,
    params.actor
  );
  const { resolutionPlanId, resolutionPlanSkippedReason } = await openResolutionPlan({
    newFact,
    drifting,
    legacyProgramId,
    previousValue: toCanonicalValue(currentView),
    reason,
    actor: params.actor,
  });

  await auditService.logAction({
    tenantId: newFact.organizationId,
    userId: params.actor ?? 'system',
    action: 'canonical_fact.governed_change',
    resourceType: 'canonical_fact',
    resourceId: newFact.id,
    details: {
      programId: newFact.programId,
      entity: newFact.entity,
      field: newFact.field,
      previousFactId: fact.id,
      previousValue: toCanonicalValue(currentView),
      newValue: toCanonicalValue(factValueView(newFact)),
      previousUnit: fact.unit,
      newUnit: newFact.unit,
      version: newFact.version,
      reason,
      bindingsCarried: bindings.length,
      driftCreated,
      claimsMarkedDrifted,
      cascadedClaims,
      resolutionPlanId,
      resolutionPlanSkippedReason,
    },
  });

  return {
    ok: true,
    previousFact: fact,
    newFact,
    bindingsCarried: bindings.length,
    impacts,
    summary,
    driftCreated,
    claimsMarkedDrifted,
    cascadedClaims,
    resolutionPlanId,
    resolutionPlanSkippedReason,
  };
}

/** Flag each divergent citation now — push, not the next sentinel sweep. */
async function flagDivergentCitations(
  newFact: CanonicalFact,
  drifting: BindingImpact[]
): Promise<number> {
  for (const impact of drifting) {
    await writeDrift({
      organizationId: newFact.organizationId,
      programId: newFact.programId,
      factId: newFact.id,
      bindingId: impact.bindingId,
      expectedValue: impact.expected,
      observedValue: impact.observed,
      driftType: (impact.driftType ?? 'value_mismatch') as
        | 'value_mismatch'
        | 'unit_mismatch'
        | 'stale_source'
        | 'missing_target',
      severity: impact.severity,
      detectedBy: 'fact_change',
      cascadeActionId: 'fact-change-orchestrator',
    });
    await setBindingStatus(impact.bindingId, 'drifted');
  }
  return drifting.length;
}

/** Drift the verification of every claim that cites the old value. */
async function markClaimsDrifted(claimIds: number[]): Promise<number> {
  if (claimIds.length === 0) return 0;
  const updated = await db
    .update(evidenceClaims)
    .set({ verification: 'drifted' })
    .where(inArray(evidenceClaims.id, claimIds))
    .returning({ id: evidenceClaims.id });
  return updated.length;
}

/** Fan out through the existing cascade so downstream artifacts restale. */
async function cascadeDriftedClaims(
  newFact: CanonicalFact,
  claimIds: number[],
  legacyProgramId: number | null,
  reason: string,
  actor: number | null
): Promise<number> {
  if (claimIds.length === 0) return 0;
  const claimPrograms = await db
    .select({ id: evidenceClaims.id, programId: evidenceClaims.programId })
    .from(evidenceClaims)
    .where(inArray(evidenceClaims.id, claimIds));
  const claimProgramById = new Map(claimPrograms.map(c => [c.id, c.programId]));

  let cascaded = 0;
  for (const claimId of claimIds) {
    try {
      await propagateRegulatoryChange({
        organizationId: newFact.organizationId,
        programId: newFact.programId,
        legacyProgramId: claimProgramById.get(claimId) ?? legacyProgramId ?? undefined,
        event: 'claim_changed',
        sourceId: String(claimId),
        sourceLabel: `${newFact.entity}.${newFact.field}`,
        reason: `governed value changed: ${reason}`,
        userId: actor !== null ? String(actor) : undefined,
      });
      cascaded += 1;
    } catch {
      // Cascade is best-effort; drift rows are the durable record.
    }
  }
  return cascaded;
}

/** Open the governed resolution plan over the affected objects. */
async function openResolutionPlan(params: {
  newFact: CanonicalFact;
  drifting: BindingImpact[];
  legacyProgramId: number | null;
  previousValue: string;
  reason: string;
  actor: number | null;
}): Promise<{ resolutionPlanId: string | null; resolutionPlanSkippedReason: string | null }> {
  const { newFact, drifting, legacyProgramId, previousValue, reason, actor } = params;
  if (drifting.length === 0) {
    return { resolutionPlanId: null, resolutionPlanSkippedReason: 'no citations diverge from the new value' };
  }
  if (legacyProgramId === null) {
    return {
      resolutionPlanId: null,
      resolutionPlanSkippedReason:
        'no legacy program link for this program; record one via POST /api/regulatory-graph/programs/:programId/link',
    };
  }
  if (actor === null) {
    return { resolutionPlanId: null, resolutionPlanSkippedReason: 'no numeric actor id available to own the plan' };
  }
  try {
    const affectedObjects: AffectedObject[] = drifting.map(i => ({
      objectType: i.targetKind,
      objectId: i.target,
      impactState: 'direct',
      impactRationale: `cites ${newFact.entity}.${newFact.field} = ${i.observed}; governed value is now ${i.expected}`,
    }));
    const plan = await createResolutionPlan(newFact.organizationId, actor, {
      projectId: legacyProgramId,
      triggerType: 'impact_propagation',
      triggerId: newFact.id,
      triggerDescription:
        `Governed value ${newFact.entity}.${newFact.field} changed from ` +
        `${previousValue} to ${toCanonicalValue(factValueView(newFact))}: ${reason}`,
      affectedObjects,
      recommendedPath: 'harmonize',
      autoCluster: false,
    });
    return { resolutionPlanId: plan.id, resolutionPlanSkippedReason: null };
  } catch (err: any) {
    return {
      resolutionPlanId: null,
      resolutionPlanSkippedReason: `plan creation failed: ${err?.message ?? 'unknown'}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator-declared facts
// ─────────────────────────────────────────────────────────────────────────────

export interface EstablishFactParams {
  organizationId: number;
  programId: string;
  entity: string;
  field: string;
  value: ProposedFactValue;
  comparator?: string;
  confidence?: number;
  reason?: string;
  actor: number | null;
}

export interface EstablishFactResult {
  ok: true;
  fact: CanonicalFact;
}

/**
 * Declare a governed value directly (no claim required). Refuses to overwrite
 * an existing active fact — changing an agreed value must go through
 * applyFactChange so the citations are flagged and the change is governed.
 */
export async function establishGovernedFact(
  params: EstablishFactParams
): Promise<EstablishFactResult | FactChangeFailure> {
  const entity = (params.entity ?? '').trim();
  const field = (params.field ?? '').trim();
  if (!entity || !field) return fail('invalid', 'entity and field are required');
  if (!hasProposedValue(params.value)) {
    return fail('invalid', 'value must carry a numeric or text value');
  }

  const existing = await resolveActiveFact(params.programId, entity, field);
  if (existing) {
    return fail(
      'conflict',
      `An active fact already exists for ${entity}.${field} (${existing.id}); ` +
        'use POST /facts/:factId/change to change it under governance'
    );
  }

  const hasNum = params.value.valueNum !== null && params.value.valueNum !== undefined;
  const fact = await upsertCanonicalFact({
    organizationId: params.organizationId,
    programId: params.programId,
    entity,
    field,
    valueNum: params.value.valueNum ?? null,
    valueText: hasNum ? null : params.value.valueText ?? null,
    unit: params.value.unit ?? null,
    comparator: params.comparator,
    valueType: params.value.valueType,
    confidence: params.confidence ?? 1.0,
    createdBy: params.actor,
  });

  await auditService.logAction({
    tenantId: params.organizationId,
    userId: params.actor ?? 'system',
    action: 'canonical_fact.established',
    resourceType: 'canonical_fact',
    resourceId: fact.id,
    details: {
      programId: params.programId,
      entity,
      field,
      value: toCanonicalValue(factValueView(fact)),
      unit: fact.unit,
      reason: params.reason ?? null,
    },
  });

  return { ok: true, fact };
}

// ─────────────────────────────────────────────────────────────────────────────
// Version history
// ─────────────────────────────────────────────────────────────────────────────

export interface FactHistoryEntry {
  fact: CanonicalFact;
  value: string;
}

/**
 * The supersession chain for a fact, newest first, starting from the given
 * version and walking supersedes_id backwards. Bounded to guard against cycles.
 */
export async function factHistory(
  factId: string,
  organizationId: number,
  limit = 100
): Promise<{ ok: true; history: FactHistoryEntry[] } | FactChangeFailure> {
  const head = await getFact(factId);
  if (!head || head.organizationId !== organizationId) {
    return fail('not_found', 'Fact not found');
  }

  const history: FactHistoryEntry[] = [];
  const seen = new Set<string>();
  let current: CanonicalFact | null = head;
  while (current && history.length < limit && !seen.has(current.id)) {
    seen.add(current.id);
    history.push({ fact: current, value: toCanonicalValue(factValueView(current)) });
    current = current.supersedesId ? await getFact(current.supersedesId) : null;
  }
  return { ok: true, history };
}
