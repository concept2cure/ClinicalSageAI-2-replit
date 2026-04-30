/**
 * PCCP Service — CRUD + lifecycle for AI/ML Predetermined Change Control Plans.
 *
 * Reads/writes ai_ml_pccp_plans + ai_ml_modifications. Pure-DB; the
 * deterministic validator lives in pccp-validator.service.ts.
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  aiMlPccpPlans,
  aiMlModifications,
  type AiMlPccpPlan,
  type AiMlModification,
  type InsertAiMlPccpPlan,
  type InsertAiMlModification,
} from '../../../shared/schema/ai-ml-pccp';
import { validatePccp, type PccpValidationResult } from './pccp-validator.service';
import { publishRegulatoryChange } from '../living-file/publish';

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getPlan(
  organizationId: number,
  planId: string
): Promise<AiMlPccpPlan | null> {
  const [row] = await db
    .select()
    .from(aiMlPccpPlans)
    .where(and(eq(aiMlPccpPlans.id, planId), eq(aiMlPccpPlans.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listProgramPlans(
  organizationId: number,
  programId: string
): Promise<AiMlPccpPlan[]> {
  return db
    .select()
    .from(aiMlPccpPlans)
    .where(
      and(
        eq(aiMlPccpPlans.organizationId, organizationId),
        eq(aiMlPccpPlans.programId, programId)
      )
    )
    .orderBy(desc(aiMlPccpPlans.updatedAt));
}

export async function getModifications(planId: string): Promise<AiMlModification[]> {
  return db
    .select()
    .from(aiMlModifications)
    .where(eq(aiMlModifications.planId, planId))
    .orderBy(asc(aiMlModifications.ordering), asc(aiMlModifications.code));
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

export async function createPlan(values: InsertAiMlPccpPlan): Promise<AiMlPccpPlan> {
  const [row] = await db.insert(aiMlPccpPlans).values(values).returning();
  return row;
}

export async function updatePlan(
  organizationId: number,
  planId: string,
  patch: Partial<InsertAiMlPccpPlan>
): Promise<AiMlPccpPlan | null> {
  const existing = await getPlan(organizationId, planId);
  if (!existing) return null;
  if (existing.locked) {
    throw Object.assign(new Error('Plan is locked'), { code: 'PCCP_LOCKED' });
  }
  const [row] = await db
    .update(aiMlPccpPlans)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(aiMlPccpPlans.id, planId))
    .returning();
  return row ?? null;
}

export async function addModification(
  organizationId: number,
  planId: string,
  values: Omit<InsertAiMlModification, 'planId'>
): Promise<AiMlModification | null> {
  const plan = await getPlan(organizationId, planId);
  if (!plan) return null;
  if (plan.locked) {
    throw Object.assign(new Error('Plan is locked'), { code: 'PCCP_LOCKED' });
  }
  const [row] = await db
    .insert(aiMlModifications)
    .values({ ...values, planId })
    .returning();
  return row;
}

export async function updateModification(
  modificationId: string,
  patch: Partial<InsertAiMlModification>
): Promise<AiMlModification | null> {
  const [row] = await db
    .update(aiMlModifications)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(aiMlModifications.id, modificationId))
    .returning();
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovePlanArgs {
  organizationId: number;
  planId: string;
  approvedBy: string;
  signatureId?: string;
}

export async function approvePlan(args: ApprovePlanArgs): Promise<{
  plan: AiMlPccpPlan;
  validation: PccpValidationResult;
} | { error: 'NOT_FOUND' } | { error: 'GATE_BLOCKED'; validation: PccpValidationResult } | { error: 'ALREADY_LOCKED' }> {
  const plan = await getPlan(args.organizationId, args.planId);
  if (!plan) return { error: 'NOT_FOUND' };
  if (plan.locked) return { error: 'ALREADY_LOCKED' };

  const mods = await getModifications(plan.id);
  const validation = validatePccp(plan, mods);

  if (!validation.passesGate) {
    return { error: 'GATE_BLOCKED', validation };
  }

  const [updated] = await db
    .update(aiMlPccpPlans)
    .set({
      status: 'approved',
      locked: true,
      approvedBy: args.approvedBy,
      approvedAt: new Date(),
      signatureId: args.signatureId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(aiMlPccpPlans.id, plan.id))
    .returning();

  // Living-file: PCCP approval changes the AI/ML governance posture, which
  // downstream registrants (defense packets, sufficiency assessments,
  // reviewer simulations) need to reflect.
  await publishRegulatoryChange({
    organizationId: updated.organizationId,
    programId: updated.programId,
    event: 'device_profile_changed',
    sourceId: updated.programId,
    sourceLabel: `PCCP ${updated.code} v${updated.version} approved`,
    reason: 'pccp_approved',
    userId: args.approvedBy,
  });

  return { plan: updated, validation };
}

export interface SupersedeArgs {
  organizationId: number;
  oldPlanId: string;
  newTitle?: string;
  createdBy?: string;
}

/**
 * Create a new draft version of a plan, copying modifications. The previous
 * plan's status flips to `superseded` once the new draft is committed.
 */
export async function supersedePlan(
  args: SupersedeArgs
): Promise<{ newPlan: AiMlPccpPlan; modCount: number } | null> {
  const old = await getPlan(args.organizationId, args.oldPlanId);
  if (!old) return null;

  const oldMods = await getModifications(old.id);

  const newVersion = old.version + 1;
  const [newPlan] = await db
    .insert(aiMlPccpPlans)
    .values({
      organizationId: old.organizationId,
      programId: old.programId,
      code: old.code,
      version: newVersion,
      previousPlanId: old.id,
      title: args.newTitle ?? old.title,
      deviceSubjectName: old.deviceSubjectName,
      intendedUse: old.intendedUse,
      descriptionSummary: old.descriptionSummary,
      dataManagementPractices: old.dataManagementPractices,
      retrainingPractices: old.retrainingPractices,
      performanceEvaluationProtocol: old.performanceEvaluationProtocol,
      updateProcedures: old.updateProcedures,
      transparencyCommitments: old.transparencyCommitments,
      benefitsNarrative: old.benefitsNarrative,
      risksNarrative: old.risksNarrative,
      mitigationsNarrative: old.mitigationsNarrative,
      comparisonToCurrentDevice: old.comparisonToCurrentDevice,
      monitoringPlan: old.monitoringPlan,
      driftDetectionPlan: old.driftDetectionPlan,
      biasSubgroupAnalysisPlan: old.biasSubgroupAnalysisPlan,
      cybersecurityImpactNarrative: old.cybersecurityImpactNarrative,
      labelingImpactNarrative: old.labelingImpactNarrative,
      rollbackStrategyNarrative: old.rollbackStrategyNarrative,
      status: 'draft',
      locked: false,
      guidanceVersion: old.guidanceVersion,
      metadata: old.metadata,
      createdBy: args.createdBy ?? old.createdBy,
    })
    .returning();

  if (oldMods.length) {
    await db.insert(aiMlModifications).values(
      oldMods.map(m => ({
        planId: newPlan.id,
        code: m.code,
        ordering: m.ordering,
        title: m.title,
        modificationType: m.modificationType,
        boundary: m.boundary,
        boundaryDeltaLimit: m.boundaryDeltaLimit,
        rationale: m.rationale,
        retrainingDataCriteria: m.retrainingDataCriteria,
        performanceMetric: m.performanceMetric,
        performanceComparator: m.performanceComparator,
        performanceThresholdValue: m.performanceThresholdValue,
        performanceTestSet: m.performanceTestSet,
        rollbackStrategy: m.rollbackStrategy,
        cybersecurityImpact: m.cybersecurityImpact,
        labelingImpact: m.labelingImpact,
        biasSubgroupAnalysis: m.biasSubgroupAnalysis,
        status: 'draft',
        metadata: m.metadata,
      }))
    );
  }

  await db
    .update(aiMlPccpPlans)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(eq(aiMlPccpPlans.id, old.id));

  // Living-file: superseding a PCCP shifts the AI/ML governance baseline.
  await publishRegulatoryChange({
    organizationId: old.organizationId,
    programId: old.programId,
    event: 'device_profile_changed',
    sourceId: old.programId,
    sourceLabel: `PCCP ${old.code} v${old.version} superseded by v${newPlan.version}`,
    reason: 'pccp_superseded',
    userId: args.createdBy,
  });

  return { newPlan, modCount: oldMods.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation entry
// ─────────────────────────────────────────────────────────────────────────────

export async function validatePlan(
  organizationId: number,
  planId: string
): Promise<PccpValidationResult | null> {
  const plan = await getPlan(organizationId, planId);
  if (!plan) return null;
  const mods = await getModifications(plan.id);
  return validatePccp(plan, mods);
}
