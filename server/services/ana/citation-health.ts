/**
 * Citation engine health + org-scoped aggregate counts.
 *
 * One endpoint a monitoring dashboard can poll to get:
 *   - Scheduler statuses (run pruner, proposal sweep)
 *   - OTel exporter enable state
 *   - Per-org aggregate counts: artifacts (total / cited / stale /
 *     filing-blocked), pending proposals, total runs, runs in the last
 *     24h.
 *
 * Tenant-scoped: every aggregate filtered by organization_id.
 *
 * @module server/services/ana/citation-health
 */
import { getPool } from '../../db/runtime.js';
import { getCitationRunPruneStatus } from './citation-run-pruner.js';
import { getSweepSchedulerStatus } from './submission-chat-sweep-scheduler.js';

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastTick: { at: string; [k: string]: any } | null;
}

export interface OrgCitationCounts {
  organizationId: number;
  artifactCount: number;
  artifactsCited: number;
  artifactsStale: number;
  artifactsFilingBlocked: number;
  pendingProposals: number;
  totalRuns: number;
  runsLast24h: number;
}

export interface CitationHealthReport {
  asOf: string;
  scheduler: {
    runPruner: SchedulerStatus & { keepLastN: number };
    proposalSweep: SchedulerStatus;
  };
  otelExporter: {
    enabled: boolean;
  };
  org: OrgCitationCounts;
}

function isOtelEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.OTEL_ENABLED || '').toLowerCase()
  );
}

/**
 * Pull org-scoped aggregate counts in two SQL round-trips. Tolerant of
 * missing tables (returns zeros for whatever isn't migrated yet).
 */
async function loadOrgCounts(organizationId: number): Promise<OrgCitationCounts> {
  const empty: OrgCitationCounts = {
    organizationId,
    artifactCount: 0,
    artifactsCited: 0,
    artifactsStale: 0,
    artifactsFilingBlocked: 0,
    pendingProposals: 0,
    totalRuns: 0,
    runsLast24h: 0,
  };

  // 1) Artifact + run aggregates joined together. Tolerant of missing
  // ana_artifact_citation_runs by using LEFT JOIN — if the runs table
  // is missing the SQL still works against concept2cure_artifacts.
  let artifactRow: any = {};
  try {
    const { rows } = await getPool().query(
      `SELECT
         COUNT(*)::int                                         AS artifact_count,
         COUNT(a.citation_run_id)::int                          AS artifacts_cited,
         SUM(
           CASE
             WHEN a.content_hash IS NOT NULL
              AND r.artifact_content_hash IS NOT NULL
              AND r.artifact_content_hash <> a.content_hash
             THEN 1 ELSE 0
           END
         )::int                                                  AS artifacts_stale,
         SUM(CASE WHEN r.filing_blocked THEN 1 ELSE 0 END)::int  AS artifacts_filing_blocked
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.organization_id = $1`,
      [organizationId]
    );
    artifactRow = rows[0] ?? {};
  } catch (err: any) {
    if (err?.code !== '42P01') {
      console.warn('[citation-health] artifact aggregates failed:', err?.message);
    }
  }

  // 2) Run history aggregates — total + last 24h.
  let runRow: any = {};
  try {
    const { rows } = await getPool().query(
      `SELECT
         COUNT(*)::int                                         AS total_runs,
         SUM(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int AS runs_last_24h
       FROM ana_artifact_citation_runs
      WHERE organization_id = $1`,
      [organizationId]
    );
    runRow = rows[0] ?? {};
  } catch (err: any) {
    if (err?.code !== '42P01') {
      console.warn('[citation-health] run aggregates failed:', err?.message);
    }
  }

  // 3) Proposal pending count.
  let proposalRow: any = {};
  try {
    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS pending_proposals
         FROM ana_submission_chat_proposals
        WHERE organization_id = $1
          AND status = 'pending'`,
      [organizationId]
    );
    proposalRow = rows[0] ?? {};
  } catch (err: any) {
    if (err?.code !== '42P01') {
      console.warn('[citation-health] proposal aggregates failed:', err?.message);
    }
  }

  return {
    ...empty,
    artifactCount: Number(artifactRow.artifact_count) || 0,
    artifactsCited: Number(artifactRow.artifacts_cited) || 0,
    artifactsStale: Number(artifactRow.artifacts_stale) || 0,
    artifactsFilingBlocked: Number(artifactRow.artifacts_filing_blocked) || 0,
    pendingProposals: Number(proposalRow.pending_proposals) || 0,
    totalRuns: Number(runRow.total_runs) || 0,
    runsLast24h: Number(runRow.runs_last_24h) || 0,
  };
}

export async function getCitationHealth(
  organizationId: number
): Promise<CitationHealthReport> {
  const [pruner, sweep, org] = await Promise.all([
    Promise.resolve(getCitationRunPruneStatus()),
    Promise.resolve(getSweepSchedulerStatus()),
    loadOrgCounts(organizationId),
  ]);
  return {
    asOf: new Date().toISOString(),
    scheduler: {
      runPruner: pruner,
      proposalSweep: sweep,
    },
    otelExporter: {
      enabled: isOtelEnabled(),
    },
    org,
  };
}
