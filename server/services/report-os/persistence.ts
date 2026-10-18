import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { getPool } from '../../db';
import * as schema from '../../../shared/schema';
import { reportRuns, reportSnapshots, reportRunDependencies } from '../../../shared/schema/report-os';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { writeChainedAuditRow } from '../auditService';

export type ReportRunRows = {
  run: typeof reportRuns.$inferInsert;
  snapshot: Omit<typeof reportSnapshots.$inferInsert, 'runId'>;
  dependencies: Array<Omit<typeof reportRunDependencies.$inferInsert, 'runId'>>;
};
export type PersistedReportRun = {
  run: typeof reportRuns.$inferSelect;
  snapshot: typeof reportSnapshots.$inferSelect;
};
export type ReportActor = { userId?: number; ipAddress?: string; userAgent?: string };

/** Lets HTTP callers retain their existing fail-closed 503 response. */
export class ReportRunRecordingError extends Error {
  constructor(cause: unknown) {
    super('Report run could not be recorded on the audit chain', { cause });
    this.name = 'ReportRunRecordingError';
  }
}

function assertConsistentRows(rows: ReportRunRows, actor: ReportActor): void {
  const organizationId = rows.run.organizationId;
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0
    || rows.snapshot.organizationId !== organizationId
    || rows.snapshot.scopeType !== rows.run.scopeType
    || rows.snapshot.scopeId !== rows.run.scopeId
    || (actor.userId != null && rows.run.requestedBy != null && actor.userId !== rows.run.requestedBy)
    || (actor.userId != null && rows.snapshot.createdBy != null && actor.userId !== rows.snapshot.createdBy)
    || rows.dependencies.some(d => d.organizationId !== organizationId)) {
    throw new Error('Report persistence requires one valid organization and matching snapshot scope');
  }
}

/**
 * Canonical creation path for interactive and scheduled reports. The run,
 * immutable first snapshot, dependencies, audit event and optional platform
 * delivery effect commit together. A failed audit or delivery leaves no run.
 */
export async function persistReportRun(
  rows: ReportRunRows,
  actor: ReportActor,
  effect?: (client: PoolClient, created: PersistedReportRun) => Promise<void>,
): Promise<PersistedReportRun> {
  assertConsistentRows(rows, actor);
  const organizationId = rows.run.organizationId;
  const client = await getPool().connect();
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, organizationId);
    const tx = drizzle(client, { schema });
    const [run] = await tx.insert(reportRuns).values(rows.run).returning();
    const [snapshot] = await tx.insert(reportSnapshots).values({ ...rows.snapshot, runId: run.id }).returning();
    if (rows.dependencies.length) {
      await tx.insert(reportRunDependencies).values(rows.dependencies.map(d => ({ ...d, runId: run.id })));
    }
    try {
      await writeChainedAuditRow(client, {
        tenantId: organizationId,
        ...actor,
        action: 'report_os.run_created',
        resourceType: 'report_run',
        resourceId: String(run.id),
        details: {
          runUuid: run.runUuid, reportTypeId: run.reportTypeId,
          scopeType: run.scopeType, scopeId: run.scopeId, status: run.status,
          confidence: run.confidence ?? null,
          blockerCount: Array.isArray(run.blockers) ? run.blockers.length : 0,
        },
      });
    } catch (error) {
      throw new ReportRunRecordingError(error);
    }
    const created = { run, snapshot };
    if (effect) await effect(client, created);
    await client.query('COMMIT');
    return created;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { releaseError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)); }
    throw error;
  } finally {
    // A connection with an uncertain transaction must never return to the pool.
    if (releaseError) client.release(releaseError);
    else client.release();
  }
}
