/**
 * Living Record Spine — Canonical Fact Store (data access).
 *
 * Reads and writes the canonical fact store, derived-value bindings, and drift
 * rows. The single agreed value per (program, entity, field) lives here.
 *
 * Pure comparison/decision logic lives in value-reconciliation.ts; orchestration
 * (reconcile-on-write, the Drift Sentinel job) lives in reconciliation-engine.ts.
 * This module is only persistence.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.
 */

import { createHash } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
// New spine tables live in their own submodule; import them by explicit path
// (the bare '../../../shared/schema' specifier resolves to the monolith
// schema.ts, which does not re-export submodule tables). This matches how
// change-router.service.ts imports standardsApplicability / gspr tables.
import {
  canonicalFacts,
  factBindings,
  factDrift,
  type CanonicalFact,
  type FactBinding,
  type FactStatus,
  type BindingKind,
  type BindingTargetKind,
  type DriftType,
  type DriftStatus,
} from '../../../shared/schema/living-record-spine';
import { targetKind } from './object-model';
import type { FactValueView, Severity } from './value-reconciliation';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function valueHash(programId: string, entity: string, field: string, value: string): string {
  return createHash('sha256').update(`${programId}|${entity}|${field}|${value}`).digest('hex');
}

/** Drizzle returns numeric columns as strings; coerce to number | null. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Build the pure FactValueView the reconciliation logic consumes. */
export function factValueView(fact: CanonicalFact): FactValueView {
  return {
    valueNum: num(fact.valueNum),
    valueText: fact.valueText ?? null,
    unit: fact.unit ?? null,
    valueType: fact.valueType ?? 'text',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Facts
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveActiveFact(
  programId: string,
  entity: string,
  field: string
): Promise<CanonicalFact | null> {
  const rows = await db
    .select()
    .from(canonicalFacts)
    .where(
      and(
        eq(canonicalFacts.programId, programId),
        eq(canonicalFacts.entity, entity),
        eq(canonicalFacts.field, field),
        eq(canonicalFacts.status, 'active')
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface UpsertFactInput {
  organizationId: number;
  programId: string;
  entity: string;
  field: string;
  valueNum?: number | null;
  valueText?: string | null;
  unit?: string | null;
  comparator?: string;
  valueType?: string;
  establishedByClaimId?: number | null;
  establishedBySourceId?: number | null;
  confidence?: number;
  createdBy?: number | null;
}

/**
 * Establish or re-version the active fact for a (program, entity, field). If an
 * active fact already exists it is superseded and a new version is written, so
 * the store keeps full history rather than mutating a cell in place.
 */
export async function upsertCanonicalFact(input: UpsertFactInput): Promise<CanonicalFact> {
  const existing = await resolveActiveFact(input.programId, input.entity, input.field);
  const canonical =
    input.valueNum !== null && input.valueNum !== undefined
      ? String(input.valueNum)
      : (input.valueText ?? '').trim();
  const hash = valueHash(input.programId, input.entity, input.field, canonical);

  if (existing) {
    await db
      .update(canonicalFacts)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(eq(canonicalFacts.id, existing.id));
  }

  const [row] = await db
    .insert(canonicalFacts)
    .values({
      organizationId: input.organizationId,
      programId: input.programId,
      entity: input.entity,
      field: input.field,
      valueNum: input.valueNum !== null && input.valueNum !== undefined ? String(input.valueNum) : null,
      valueText: input.valueText ?? null,
      unit: input.unit ?? null,
      comparator: input.comparator ?? '=',
      valueType: input.valueType ?? 'text',
      establishedByClaimId: input.establishedByClaimId ?? null,
      establishedBySourceId: input.establishedBySourceId ?? null,
      confidence: input.confidence !== undefined ? String(input.confidence) : '0.5000',
      status: 'active',
      version: existing ? existing.version + 1 : 1,
      supersedesId: existing?.id ?? null,
      contentHash: hash,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

export async function setFactStatus(factId: string, status: FactStatus): Promise<void> {
  await db
    .update(canonicalFacts)
    .set({ status, updatedAt: new Date() })
    .where(eq(canonicalFacts.id, factId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Bindings
// ─────────────────────────────────────────────────────────────────────────────

export interface BindFactInput {
  organizationId: number;
  programId: string;
  factId: string;
  target: string;
  bindingKind?: BindingKind;
  transform?: Record<string, unknown> | null;
  observedValue?: string | null;
  overrideReason?: string | null;
  createdBy?: number | null;
}

export async function bindToFact(input: BindFactInput): Promise<FactBinding> {
  const kind = (targetKind(input.target) ?? 'document') as BindingTargetKind;
  const [row] = await db
    .insert(factBindings)
    .values({
      organizationId: input.organizationId,
      programId: input.programId,
      factId: input.factId,
      target: input.target,
      targetKind: kind,
      bindingKind: input.bindingKind ?? 'mirror',
      transform: input.transform ?? null,
      observedValue: input.observedValue ?? null,
      bindingStatus: input.bindingKind === 'manual_override' ? 'overridden' : 'bound',
      overrideReason: input.overrideReason ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row;
}

export async function recordObservedValue(bindingId: string, observedValue: string): Promise<void> {
  await db
    .update(factBindings)
    .set({ observedValue, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(factBindings.id, bindingId));
}

export async function setBindingStatus(
  bindingId: string,
  status: 'bound' | 'drifted' | 'overridden' | 'broken'
): Promise<void> {
  await db
    .update(factBindings)
    .set({ bindingStatus: status, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(factBindings.id, bindingId));
}

/**
 * Bindings the Drift Sentinel should compare: active facts, non-override
 * bindings, currently bound or already drifted. Joined with their fact.
 */
export async function getDriftCandidates(
  programId: string
): Promise<Array<{ binding: FactBinding; fact: CanonicalFact }>> {
  const rows = await db
    .select({ binding: factBindings, fact: canonicalFacts })
    .from(factBindings)
    .innerJoin(canonicalFacts, eq(canonicalFacts.id, factBindings.factId))
    .where(
      and(
        eq(factBindings.programId, programId),
        eq(canonicalFacts.status, 'active'),
        sql`${factBindings.bindingKind} <> 'manual_override'`,
        sql`${factBindings.bindingStatus} in ('bound','drifted')`
      )
    );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift
// ─────────────────────────────────────────────────────────────────────────────

export interface WriteDriftInput {
  organizationId: number;
  programId: string;
  factId: string;
  bindingId?: string | null;
  expectedValue: string;
  observedValue: string;
  driftType: DriftType;
  severity: Severity;
  cascadeActionId?: string | null;
}

export async function writeDrift(input: WriteDriftInput) {
  const [row] = await db
    .insert(factDrift)
    .values({
      organizationId: input.organizationId,
      programId: input.programId,
      factId: input.factId,
      bindingId: input.bindingId ?? null,
      expectedValue: input.expectedValue,
      observedValue: input.observedValue,
      driftType: input.driftType,
      severity: input.severity,
      status: 'open',
      detectedBy: 'drift_sentinel',
      cascadeActionId: input.cascadeActionId ?? null,
    })
    .returning();
  return row;
}

export async function resolveDrift(
  driftId: string,
  resolution: string,
  resolvedBy: number,
  status: Extract<DriftStatus, 'resolved' | 'dismissed'> = 'resolved'
): Promise<void> {
  await db
    .update(factDrift)
    .set({ status, resolution, resolvedBy, resolvedAt: new Date() })
    .where(eq(factDrift.id, driftId));
}

/** Read model: open drift for a program, with a small summary. */
export async function programFactDriftReport(programId: string) {
  const open = await db
    .select()
    .from(factDrift)
    .where(and(eq(factDrift.programId, programId), eq(factDrift.status, 'open')));

  const bySeverity: Record<string, number> = {};
  for (const d of open) bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;

  return {
    programId,
    generatedAt: new Date().toISOString(),
    openDriftCount: open.length,
    bySeverity,
    drift: open,
    hasOpenDrift: open.length > 0,
  };
}
