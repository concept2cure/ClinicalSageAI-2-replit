/**
 * TMF artifact persistence service.
 *
 * Durable, tenant-scoped, audited per-trial record of filed Trial Master File
 * documents, with inspection-readiness computed from the stored artifacts.
 * Every read/write is scoped to the caller's organizationId (never request
 * input); mutations are audited — mirroring
 * server/services/ind-lifecycle/ind-cross-reference-persistence.ts.
 *
 * An artifact code must be a known DIA TMF Reference Model code (the service
 * validates against `tmf-completeness`), keeping the store clean and the
 * completeness roll-up meaningful.
 *
 * @module server/services/etmf/tmf-artifact-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { tmfArtifactFilings, type TmfArtifactFiling } from '../../../shared/schema/tmf-artifacts';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { getTmfReferenceModel, assessTmfCompleteness, type TmfCompletenessResult } from './tmf-completeness';

const logger = createScopedLogger('tmf-artifact-persistence');

export type TmfCtx = { organizationId: number; userId: number };

export class TmfArtifactError extends Error {
  constructor(public code: 'NOT_FOUND' | 'UNKNOWN_ARTIFACT', message: string) {
    super(message);
    this.name = 'TmfArtifactError';
  }
}

/** code → zone number, from the reference model (single source of truth). */
const ARTIFACT_ZONE: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  for (const zone of getTmfReferenceModel()) {
    for (const a of zone.artifacts) m.set(a.code, zone.number);
  }
  return m;
})();

export interface RecordArtifactInput {
  trialId: string;
  artifactCode: string;
  documentRef?: string | null;
}

/**
 * Record (or re-file) a TMF artifact for a trial. Idempotent on
 * (org, trial, artifact) — re-filing updates the document ref + timestamp.
 * Rejects an unknown artifact code. Audited, org-scoped.
 */
export async function recordTmfArtifactFiling(input: RecordArtifactInput, ctx: TmfCtx): Promise<TmfArtifactFiling> {
  const zone = ARTIFACT_ZONE.get(input.artifactCode);
  if (zone === undefined) {
    throw new TmfArtifactError('UNKNOWN_ARTIFACT', `"${input.artifactCode}" is not a known TMF Reference Model artifact code.`);
  }

  const [row] = await db
    .insert(tmfArtifactFilings)
    .values({
      organizationId: ctx.organizationId,
      trialId: input.trialId,
      artifactCode: input.artifactCode,
      zoneNumber: zone,
      documentRef: input.documentRef ?? null,
      createdBy: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [tmfArtifactFilings.organizationId, tmfArtifactFilings.trialId, tmfArtifactFilings.artifactCode],
      set: { documentRef: input.documentRef ?? null, updatedAt: new Date(), filedAt: new Date() },
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'TMF_ARTIFACT_FILED',
    resourceType: 'tmf_artifact',
    resourceId: row.id,
    details: { trialId: input.trialId, artifactCode: input.artifactCode, zone },
  });
  logger.info('Filed TMF artifact', { trialId: input.trialId, artifactCode: input.artifactCode, organizationId: ctx.organizationId });
  return row as TmfArtifactFiling;
}

/** List a trial's filed TMF artifacts (org-scoped, stable order). */
export async function listTmfArtifacts(trialId: string, ctx: { organizationId: number }): Promise<TmfArtifactFiling[]> {
  return (await db
    .select()
    .from(tmfArtifactFilings)
    .where(and(eq(tmfArtifactFilings.organizationId, ctx.organizationId), eq(tmfArtifactFilings.trialId, trialId)))
    .orderBy(asc(tmfArtifactFilings.artifactCode))) as TmfArtifactFiling[];
}

/** Remove a filed TMF artifact (audited, org-scoped). */
export async function removeTmfArtifactFiling(id: string, ctx: TmfCtx): Promise<void> {
  const [row] = await db
    .delete(tmfArtifactFilings)
    .where(and(eq(tmfArtifactFilings.id, id), eq(tmfArtifactFilings.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new TmfArtifactError('NOT_FOUND', 'TMF artifact not found.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'TMF_ARTIFACT_REMOVED',
    resourceType: 'tmf_artifact',
    resourceId: id,
    details: { artifactCode: row.artifactCode },
  });
}

/**
 * Compute inspection-readiness for a trial from its stored artifacts.
 * Org-scoped. `scope` ('essential' default | 'all') mirrors the checker.
 */
export async function getTrialTmfCompleteness(
  trialId: string,
  ctx: { organizationId: number },
  scope: 'essential' | 'all' = 'essential',
): Promise<TmfCompletenessResult> {
  const rows = await listTmfArtifacts(trialId, ctx);
  return assessTmfCompleteness({ providedArtifacts: rows.map((r) => r.artifactCode), scope });
}
