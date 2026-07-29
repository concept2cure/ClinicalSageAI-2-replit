/**
 * IND dispatch-readiness snapshot service.
 *
 * Persists and lists point-in-time dispatch-gate verdicts (append-only) so a
 * program's go/no-go history is auditable. Every read/write is tenant-scoped
 * from the caller's organizationId (never request input); creation is audited —
 * mirroring server/services/ind-master-data/ind-master-data-service.ts.
 *
 * @module server/services/ind-lifecycle/ind-dispatch-snapshot-service
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db';
import {
  indDispatchSnapshots,
  type IndDispatchSnapshot,
} from '../../../shared/schema/ind-dispatch-snapshots';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import type { DispatchGateVerdict } from './ind-dispatch-gate';

const logger = createScopedLogger('ind-dispatch-snapshot-service');

export type SnapshotCtx = { organizationId: number; userId: number };

export interface CreateSnapshotInput {
  submissionId: number;
  sequenceId: number;
  sequenceNumber: string;
  verdict: DispatchGateVerdict;
}

/** Persist a dispatch-gate verdict as an audited, point-in-time snapshot. */
export async function createDispatchSnapshot(
  input: CreateSnapshotInput,
  ctx: SnapshotCtx,
): Promise<IndDispatchSnapshot> {
  const [row] = await db
    .insert(indDispatchSnapshots)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      sequenceId: input.sequenceId,
      sequenceNumber: input.sequenceNumber,
      canDispatch: input.verdict.canDispatch,
      blockerCount: input.verdict.blockers.length,
      warningCount: input.verdict.warnings.length,
      blockerCodes: input.verdict.blockers.map((b) => b.code),
      verdict: input.verdict as unknown as Record<string, unknown>,
      createdBy: ctx.userId,
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_DISPATCH_SNAPSHOT_CREATED',
    resourceType: 'ind_dispatch_snapshot',
    resourceId: row.id,
    details: { sequenceId: input.sequenceId, canDispatch: input.verdict.canDispatch },
  });

  logger.info('Recorded IND dispatch snapshot', {
    sequenceId: input.sequenceId,
    canDispatch: input.verdict.canDispatch,
    organizationId: ctx.organizationId,
  });
  return row as IndDispatchSnapshot;
}

/** List a sequence's dispatch snapshots, newest first (org-scoped). */
export async function listDispatchSnapshots(
  sequenceId: number,
  ctx: { organizationId: number },
): Promise<IndDispatchSnapshot[]> {
  const rows = await db
    .select()
    .from(indDispatchSnapshots)
    .where(and(eq(indDispatchSnapshots.sequenceId, sequenceId), eq(indDispatchSnapshots.organizationId, ctx.organizationId)))
    .orderBy(desc(indDispatchSnapshots.createdAt));
  return rows as IndDispatchSnapshot[];
}

/** The most recent dispatch snapshot for a sequence, or null (org-scoped). */
export async function getLatestDispatchSnapshot(
  sequenceId: number,
  ctx: { organizationId: number },
): Promise<IndDispatchSnapshot | null> {
  const [row] = await db
    .select()
    .from(indDispatchSnapshots)
    .where(and(eq(indDispatchSnapshots.sequenceId, sequenceId), eq(indDispatchSnapshots.organizationId, ctx.organizationId)))
    .orderBy(desc(indDispatchSnapshots.createdAt))
    .limit(1);
  return (row as IndDispatchSnapshot) ?? null;
}

export default { createDispatchSnapshot, listDispatchSnapshots, getLatestDispatchSnapshot };
