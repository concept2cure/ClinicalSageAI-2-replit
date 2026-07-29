/**
 * Citation run pruner.
 *
 * Keeps `ana_artifact_citation_runs` from growing unbounded. For each
 * artifact, keeps the N most-recent runs PLUS the currently-active run
 * (the one `concept2cure_artifacts.citation_run_id` points at). Anything
 * older / unreferenced is deleted.
 *
 * Why retain the active run no matter what? It's still being served by
 * GET /citations/:artifactId; deleting it would orphan the artifact's
 * citations JSONB. The active run is always preserved even if it falls
 * outside the "last N" window (e.g. on a quiet artifact where the
 * current run is the only run).
 *
 * Pruning is destructive — runs CAN'T be recovered after delete. We
 * surface counts in the return value so an ops dashboard can show
 * "pruned 142 runs across 47 artifacts" before the user pulls the
 * trigger.
 *
 * Two interfaces:
 *   - pruneOldCitationRuns({ keepLastN, organizationId? }): one-shot.
 *     Org-scoped when organizationId is supplied; otherwise sweeps
 *     across the whole table (admin / ops-only).
 *   - startCitationRunPruneScheduler(): same lifecycle as the proposal
 *     sweep — fixed interval, .unref()'d, disabled in tests.
 *
 * @module server/services/ana/citation-run-pruner
 */
import { getPool } from '../../db/runtime.js';

const DEFAULT_KEEP_LAST_N = parseInt(
  process.env.ANA_CITATION_RUN_KEEP_LAST_N ?? '10',
  10
);
const DEFAULT_INTERVAL_MS = parseInt(
  process.env.ANA_CITATION_RUN_PRUNE_INTERVAL_MS ?? String(6 * 60 * 60 * 1000),
  10
);
const STARTUP_DELAY_MS = 10 * 60 * 1000; // 10 min before first prune

export interface PruneCitationRunsOptions {
  /** Default: ANA_CITATION_RUN_KEEP_LAST_N or 10. */
  keepLastN?: number;
  /** When set, only prune runs in this org. Otherwise sweeps everywhere. */
  organizationId?: number;
}

export interface PruneCitationRunsResult {
  prunedRunCount: number;
  prunedArtifactCount: number;
  keepLastN: number;
  scope: 'org' | 'global';
}

export async function pruneOldCitationRuns(
  options: PruneCitationRunsOptions = {}
): Promise<PruneCitationRunsResult> {
  const keepLastN = Math.max(1, options.keepLastN ?? DEFAULT_KEEP_LAST_N);
  const orgId = options.organizationId;
  const params: any[] = [keepLastN];
  let orgFilter = '';
  if (typeof orgId === 'number') {
    params.push(orgId);
    orgFilter = `AND organization_id = $${params.length}`;
  }

  // Single statement with a CTE: rank runs per artifact, then delete those
  // outside the "last N" window AND not pointed at by any artifact's
  // citation_run_id (the active-run guard).
  let result;
  try {
    result = await getPool().query(
      `WITH ranked AS (
         SELECT id, artifact_id,
                ROW_NUMBER() OVER (
                  PARTITION BY artifact_id
                  ORDER BY created_at DESC
                ) AS rn
           FROM ana_artifact_citation_runs
          WHERE 1 = 1
            ${orgFilter}
       ),
       active AS (
         SELECT citation_run_id AS id
           FROM concept2cure_artifacts
          WHERE citation_run_id IS NOT NULL
       )
       DELETE FROM ana_artifact_citation_runs r
        WHERE r.id IN (
          SELECT id FROM ranked
           WHERE rn > $1
        )
          AND r.id NOT IN (SELECT id FROM active)
       RETURNING r.id, r.artifact_id`,
      params
    );
  } catch (err: any) {
    // 42P01: table missing in dev / test env — silently no-op.
    if (err?.code === '42P01') {
      return {
        prunedRunCount: 0,
        prunedArtifactCount: 0,
        keepLastN,
        scope: orgId ? 'org' : 'global',
      };
    }
    throw err;
  }

  const distinctArtifacts = new Set<string>();
  for (const r of result.rows) distinctArtifacts.add(r.artifact_id);

  return {
    prunedRunCount: result.rows.length,
    prunedArtifactCount: distinctArtifacts.size,
    keepLastN,
    scope: orgId ? 'org' : 'global',
  };
}

// ─── Background scheduler (mirrors submission-chat-sweep-scheduler) ──

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let lastTick: { at: Date; result: PruneCitationRunsResult } | null = null;

function isDisabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const flag = (process.env.ANA_CITATION_RUN_PRUNE_DISABLED || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(flag);
}

async function tick(): Promise<void> {
  try {
    // Global sweep — all orgs. The CTE inside pruneOldCitationRuns
    // partitions by artifact, so cross-org partitions stay disjoint.
    const result = await pruneOldCitationRuns({ keepLastN: DEFAULT_KEEP_LAST_N });
    lastTick = { at: new Date(), result };
    if (result.prunedRunCount > 0) {
      console.log(
        `[citation-run-prune] pruned ${result.prunedRunCount} runs across ${result.prunedArtifactCount} artifacts`
      );
    }
  } catch (err: any) {
    console.warn(
      '[citation-run-prune] tick failed (will retry next interval):',
      err?.message || err
    );
  }
}

export function startCitationRunPruneScheduler(): boolean {
  if (timer || startupTimer) return false;
  if (isDisabled()) return false;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void tick();
    timer = setInterval(() => {
      void tick();
    }, DEFAULT_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
  }, Math.min(STARTUP_DELAY_MS, DEFAULT_INTERVAL_MS));
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  console.log(
    `[citation-run-prune] scheduled (interval=${DEFAULT_INTERVAL_MS}ms, first=${Math.min(STARTUP_DELAY_MS, DEFAULT_INTERVAL_MS)}ms, keepLastN=${DEFAULT_KEEP_LAST_N})`
  );
  return true;
}

export function stopCitationRunPruneScheduler(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getCitationRunPruneStatus(): {
  running: boolean;
  intervalMs: number;
  keepLastN: number;
  lastTick: { at: string; result: PruneCitationRunsResult } | null;
} {
  return {
    running: !!timer,
    intervalMs: DEFAULT_INTERVAL_MS,
    keepLastN: DEFAULT_KEEP_LAST_N,
    lastTick: lastTick
      ? {
          at: lastTick.at.toISOString(),
          result: lastTick.result,
        }
      : null,
  };
}
