/**
 * IND dispatch-readiness snapshot service.
 *
 * Persists and lists point-in-time dispatch-gate verdicts (append-only) so a
 * program's go/no-go history is auditable. Every read/write is tenant-scoped
 * from the caller's organizationId (never request input); creation is audited —
 * mirroring server/services/ind-master-data/ind-master-data-service.ts.
 *
 * Since P-33 (2026-10-15) the verdict is the one verdict,
 * assessSequenceDispatchReadiness, and every row records the gate that
 * produced it in `verdict.source`. Rows written before then carry no source:
 * the deleted IND gate wrote them, and ind-cockpit reports them as recorded
 * under the previous gate rather than comparing them for drift.
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
import { DISPATCH_VERDICT_SOURCE } from './ind-cockpit';

const logger = createScopedLogger('ind-dispatch-snapshot-service');

export type SnapshotCtx = { organizationId: number; userId: number };

/** The verdict a snapshot records: the one verdict, tagged with the gate that produced it. */
export interface DispatchSnapshotVerdict {
  canDispatch: boolean;
  blockers: ReadonlyArray<{ code: string; message: string }>;
  warnings: ReadonlyArray<{ code: string; message: string }>;
  source: typeof DISPATCH_VERDICT_SOURCE;
}

export interface CreateSnapshotInput {
  submissionId: number;
  sequenceId: number;
  sequenceNumber: string;
  verdict: DispatchSnapshotVerdict;
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
      blockerCodes: [...new Set(input.verdict.blockers.map((b) => b.code))],
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
    details: { sequenceId: input.sequenceId, canDispatch: input.verdict.canDispatch, source: input.verdict.source },
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
