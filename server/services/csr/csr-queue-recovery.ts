/**
 * Resume the CSR queues after a restart (2026-10-30;
 * docs/evidence/D2-CSR/2026-10-30-queue-boot-recovery/).
 *
 * The CSR build (csr_build_jobs, csr-job-runner.ts runCSRBuildJob, started by
 * csr-builder.ts launchCSRBuildAsync), the assembly (csr_assembly_runs,
 * csr-assembly-run.ts) and the narrative build (csr_narrative_runs,
 * csr-narrative-run.ts) each start their worker with setImmediate in the
 * process that took the request. A restart stops that worker, and nothing ran
 * it again until a user asked again. This is the one boot sweep over the three
 * queues. It reuses each queue's own worker and stall rule (the build had none:
 * CSR_BUILD_STALL_MINUTES below is it); it adds no queue and no framework.
 *
 *   - Discovery (system scope, every organization): rows still queued or
 *     running whose row has not been written for the queue's own stall time
 *     (CSR_BUILD_STALL_MINUTES, the assembly's STALL_MINUTES,
 *     NARRATIVE_STALL_MINUTES). A live worker writes its row as it goes, so it
 *     is not stalled.
 *   - Tenant lifecycle: an organization not permitted background work
 *     (filterTenantsForBackgroundWork) is left as it is.
 *   - Requester: the item runs as the user who asked, never as anyone else.
 *     Their access is checked now, under that organization's tenant scope, by
 *     the rule the routes apply to queue the work (requireCsrJobAccess, and a
 *     project that is archived or deleted takes no new work, as
 *     resolveCsrScope forWrite). A requester who is gone or whose access was
 *     removed gets the item recorded failed with a typed code. The worker then
 *     checks access again itself, as it always does.
 *   - Claim: a conditional UPDATE that only a still-stalled row matches puts it
 *     back to 'queued' (the requester is kept). Two instances booting together
 *     both see the row; one UPDATE matches, and only that one starts the worker.
 *     The worker's own claim (queued to running) follows, unchanged.
 *   - Bounded: at most CSR_RECOVERY_BATCH rows per queue, CSR_RECOVERY_CONCURRENCY
 *     workers at a time.
 *
 * What a resume means is the queue's own: a build drafts only sections not yet
 * verified, a narrative build composes only subjects not yet verified, and an
 * assembly (which has no partial state) assembles again.
 */
import { CsrScopeError, requireCsrJobAccess, type CsrScopeExecutor } from './project-scope';
import { STALL_MINUTES as ASSEMBLY_STALL_MINUTES } from './csr-assembly-run';
import { NARRATIVE_STALL_MINUTES } from './csr-narrative-run';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('csr-queue-recovery');

/**
 * The CSR build had no stall rule; this is it. A queued or drafting build whose
 * row has not been written for this long was left by a worker that stopped.
 * runCSRBuildJob writes the row after every drafted section, and one section is
 * one model call over its evidence, so the bound is generous beside the
 * narrative run's 5 minutes and the assembly's 15. It compares the row's
 * updated_at (timestamp without time zone, written in UTC) with now(), so it
 * assumes the database session's time zone is UTC.
 */
export const CSR_BUILD_STALL_MINUTES = 30;
export const CSR_RECOVERY_BATCH = 200;
export const CSR_RECOVERY_CONCURRENCY = 2;

export type CsrQueue = 'build' | 'assembly' | 'narrative';
export interface StalledItem { queue: CsrQueue; id: number; organizationId: number; jobId: number; requestedBy: number | null }
export interface CsrRecoveryRefusal { code: string; message: string }

interface QueueSql {
  stallMinutes: number;
  requesterMissing: string;
  /** $1 stall minutes, $2 limit. Cross-tenant by design: it runs under the system scope and names organization_id. */
  discover: string;
  /** $1 id, $2 organization_id, $3 stall minutes: back to 'queued' only while still stalled. */
  claim: string;
  /** $1 id, $2 organization_id, $3 stall minutes, $4 error json: failed only while still stalled. */
  refuse: string;
}

const QUEUES: Record<CsrQueue, QueueSql> = {
  build: {
    stallMinutes: CSR_BUILD_STALL_MINUTES,
    requesterMissing: 'CSR_BUILD_REQUESTER_MISSING',
    discover: `SELECT id, organization_id, id AS job_id, requested_by FROM csr_build_jobs
      WHERE status IN ('queued', 'drafting') AND updated_at < now() - $1 * interval '1 minute' ORDER BY updated_at, id LIMIT $2`,
    claim: `UPDATE csr_build_jobs SET status = 'queued', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'drafting') AND updated_at < now() - $3 * interval '1 minute' RETURNING id, requested_by`,
    refuse: `UPDATE csr_build_jobs SET status = 'failed', error = $4::jsonb, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'drafting') AND updated_at < now() - $3 * interval '1 minute' RETURNING id`,
  },
  assembly: {
    stallMinutes: ASSEMBLY_STALL_MINUTES,
    requesterMissing: 'CSR_ASSEMBLY_REQUESTER_MISSING',
    discover: `SELECT id, organization_id, job_id, requested_by FROM csr_assembly_runs
      WHERE status IN ('queued', 'assembling') AND updated_at < now() - $1 * interval '1 minute' ORDER BY updated_at, id LIMIT $2`,
    claim: `UPDATE csr_assembly_runs SET status = 'queued', progress = 0, stage = 'Queued again after a server restart', error = NULL, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'assembling') AND updated_at < now() - $3 * interval '1 minute' RETURNING id, requested_by`,
    refuse: `UPDATE csr_assembly_runs SET status = 'failed', stage = 'Failed', error = $4::jsonb, completed_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'assembling') AND updated_at < now() - $3 * interval '1 minute' RETURNING id`,
  },
  narrative: {
    stallMinutes: NARRATIVE_STALL_MINUTES,
    requesterMissing: 'CSR_NARRATIVE_REQUESTER_MISSING',
    discover: `SELECT id, organization_id, job_id, requested_by FROM csr_narrative_runs
      WHERE status IN ('queued', 'running') AND updated_at < now() - $1 * interval '1 minute' ORDER BY updated_at, id LIMIT $2`,
    claim: `UPDATE csr_narrative_runs SET status = 'queued', error = NULL, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'running') AND updated_at < now() - $3 * interval '1 minute' RETURNING id, requested_by`,
    refuse: `UPDATE csr_narrative_runs SET status = 'failed', error = $4::jsonb, completed_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status IN ('queued', 'running') AND updated_at < now() - $3 * interval '1 minute' RETURNING id`,
  },
};

export interface CsrQueueRecoveryDeps {
  /** Estate-wide discovery, under the system scope. */
  discover(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Run `fn` on a connection carrying that organization's tenant scope. */
  withOrganization<T>(organizationId: number, fn: (client: CsrScopeExecutor) => Promise<T>): Promise<T>;
  /** The organizations permitted background work. */
  permitted(organizationIds: number[]): Promise<Set<number>>;
  /** Run the queue's own worker for a claimed item, as its requester, to its end. */
  dispatch(item: StalledItem): Promise<void>;
  concurrency?: number;
  batch?: number;
}

export interface CsrQueueRecoverySummary {
  found: number; resumed: number; refused: number; skippedNotPermitted: number; notClaimed: number; errors: number;
  items: Array<{ queue: CsrQueue; id: number; outcome: 'resumed' | 'refused' | 'not_permitted' | 'not_claimed' | 'error'; code?: string }>;
}

const toItem = (queue: CsrQueue, r: Record<string, unknown>): StalledItem => ({
  queue, id: Number(r.id), organizationId: Number(r.organization_id), jobId: Number(r.job_id),
  requestedBy: r.requested_by == null ? null : Number(r.requested_by),
});

/**
 * The requester's access now, or the typed reason they have none: the rule the
 * routes apply before queueing (read access to the job's project, and no new
 * work on an archived or deleted project).
 */
export async function requesterRefusal(client: CsrScopeExecutor, item: StalledItem): Promise<CsrRecoveryRefusal | null> {
  if (item.requestedBy == null) {
    return { code: QUEUES[item.queue].requesterMissing, message: 'The user who asked for this work no longer exists. It was not resumed after the server restarted, and it was not run as anyone else.' };
  }
  try {
    if (!await requireCsrJobAccess(client, item.organizationId, item.jobId, item.requestedBy)) {
      return { code: 'CSR_JOB_NOT_FOUND', message: 'The CSR build this work belongs to no longer exists. It was not resumed after the server restarted.' };
    }
    const { rows } = await client.query(`SELECT p.status FROM csr_build_jobs j JOIN projects p ON p.id = j.project_id AND p.organization_id = j.organization_id
      WHERE j.id = $1 AND j.organization_id = $2`, [item.jobId, item.organizationId]);
    if (['archived', 'deleted'].includes(String(rows[0]?.status))) {
      return { code: 'CSR_PROJECT_ARCHIVED', message: 'The project was archived, so this CSR work was not resumed after the server restarted. Retained CSR work can still be read.' };
    }
    return null;
  } catch (err) {
    if (err instanceof CsrScopeError) {
      return { code: err.code, message: `The user who asked for this work no longer has access to it (${err.message}) It was not resumed after the server restarted, and it was not run as anyone else.` };
    }
    throw err;
  }
}

/** The error a refused item records, in its queue's own shape (a build's error carries a reason, as runCSRBuildJob writes it). */
function refusalRecord(queue: CsrQueue, refusal: CsrRecoveryRefusal): string {
  if (queue !== 'build') return JSON.stringify(refusal);
  const reason = refusal.code === QUEUES.build.requesterMissing ? 'requester_missing' : 'project_access_refused';
  return JSON.stringify({ reason, ...refusal });
}

type Outcome = CsrQueueRecoverySummary['items'][number];

async function recoverOne(item: StalledItem, deps: CsrQueueRecoveryDeps): Promise<Outcome> {
  const sql = QUEUES[item.queue];
  const decided = await deps.withOrganization(item.organizationId, async (client): Promise<Outcome | StalledItem> => {
    const refusal = await requesterRefusal(client, item);
    if (refusal) {
      const { rows } = await client.query(sql.refuse, [item.id, item.organizationId, sql.stallMinutes, refusalRecord(item.queue, refusal)]);
      return { queue: item.queue, id: item.id, outcome: rows.length ? 'refused' : 'not_claimed', code: refusal.code };
    }
    const { rows } = await client.query(sql.claim, [item.id, item.organizationId, sql.stallMinutes]);
    if (!rows[0]) return { queue: item.queue, id: item.id, outcome: 'not_claimed' };
    const requestedBy = rows[0].requested_by == null ? null : Number(rows[0].requested_by);
    // The row is the authority: a request that took it over first would have refreshed it, and the claim would not match.
    return { ...item, requestedBy };
  });
  if ('outcome' in decided) return decided;
  await deps.dispatch(decided);
  return { queue: item.queue, id: item.id, outcome: 'resumed' };
}

async function eachBounded<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => { while (next < items.length) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

async function discoverAll(deps: CsrQueueRecoveryDeps, batch: number): Promise<StalledItem[]> {
  const found: StalledItem[] = [];
  for (const queue of Object.keys(QUEUES) as CsrQueue[]) {
    try {
      const { rows } = await deps.discover(QUEUES[queue].discover, [QUEUES[queue].stallMinutes, batch]);
      found.push(...rows.map(r => toItem(queue, r)));
    } catch (err) {
      // A queue whose table is not provisioned has nothing to resume; anything else is reported, not hidden.
      if ((err as { code?: string }).code !== '42P01') throw err;
      log.warn('CSR queue table is not provisioned; nothing to resume', { queue });
    }
  }
  return found;
}

/** One sweep over the three CSR queues. */
export async function runCsrQueueRecovery(deps: CsrQueueRecoveryDeps): Promise<CsrQueueRecoverySummary> {
  const found = await discoverAll(deps, deps.batch ?? CSR_RECOVERY_BATCH);
  const summary: CsrQueueRecoverySummary = { found: found.length, resumed: 0, refused: 0, skippedNotPermitted: 0, notClaimed: 0, errors: 0, items: [] };
  if (!found.length) return summary;
  const permitted = await deps.permitted(found.map(i => i.organizationId));
  await eachBounded(found, deps.concurrency ?? CSR_RECOVERY_CONCURRENCY, async (item) => {
    let outcome: Outcome;
    if (!permitted.has(item.organizationId)) outcome = { queue: item.queue, id: item.id, outcome: 'not_permitted' };
    else {
      try { outcome = await recoverOne(item, deps); } catch (err) {
        log.error('CSR queue item could not be resumed', { queue: item.queue, id: item.id, organizationId: item.organizationId, err: err instanceof Error ? err.message : String(err) });
        outcome = { queue: item.queue, id: item.id, outcome: 'error' };
      }
    }
    summary.items.push(outcome);
    if (outcome.outcome === 'resumed') summary.resumed++;
    else if (outcome.outcome === 'refused') summary.refused++;
    else if (outcome.outcome === 'not_permitted') summary.skippedNotPermitted++;
    else if (outcome.outcome === 'not_claimed') summary.notClaimed++;
    else summary.errors++;
  });
  return summary;
}
