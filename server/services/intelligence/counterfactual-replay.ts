/**
 * Counterfactual replay — proactive warnings on in-flight drafts.
 *
 * When a `failure_pattern` is freshly promoted, replay it across every
 * draft that's currently in flight on the platform. Any draft whose
 * `(agency × document_type × intent)` tuple matches the new pattern's
 * fingerprint dimensions gets a row in `intelligence.pattern_warnings`
 * so the user sees a "this might fail" hint before they hit the same
 * trap the rest of the network already walked into.
 *
 * The replay is bounded by recency (default 90 days of activity), org
 * scope (we only flag drafts in tenants that have at least one recent
 * artifact in the tuple), and de-duplication (one warning per
 * pattern × draft pair via the UNIQUE on the warnings table).
 *
 * @module server/services/intelligence/counterfactual-replay
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('counterfactual-replay');

export const REPLAY_VERSION = '1.0.0';
export const DEFAULT_LOOKBACK_DAYS = 90;

// ─── Pure helpers ────────────────────────────────────────────────────────────

export type WarningSeverity = 'low' | 'medium' | 'high';

export function severityFromConfidence(confidence: number): WarningSeverity {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

// ─── Replay (called when a pattern is promoted) ─────────────────────────────

export interface ReplayPatternOptions {
  readonly lookbackDays?: number;
  readonly minConfidence?: number;
}

export interface ReplayPatternResult {
  readonly patternId: string;
  readonly warningsCreated: number;
  readonly tenantsWarned: number;
}

/**
 * Replay a single freshly-promoted pattern across all open drafts.
 * Idempotent: re-running over the same pattern is a no-op thanks to the
 * UNIQUE constraint on (org_id, project_id, artifact_id, pattern_id).
 */
export async function replayPattern(
  patternId: string,
  opts: ReplayPatternOptions = {},
): Promise<ReplayPatternResult> {
  const lookback = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const minConfidence = opts.minConfidence ?? 0.4;

  // 1. Load the pattern.
  const patternRow = await pool.query<{
    id: string;
    pattern_fingerprint: string;
    agency: string;
    document_type: string;
    intent_class: string;
    suggested_correction: string;
    confidence: number;
    status: string;
  }>(
    `SELECT id, pattern_fingerprint, agency, document_type, intent_class,
            suggested_correction, confidence, status
       FROM intelligence.failure_patterns
      WHERE id = $1 AND status = 'active'`,
    [patternId],
  );
  if (patternRow.rows.length === 0) {
    return { patternId, warningsCreated: 0, tenantsWarned: 0 };
  }
  const p = patternRow.rows[0];
  const confidence = typeof p.confidence === 'number' ? p.confidence : parseFloat(p.confidence as unknown as string);
  if (confidence < minConfidence) {
    return { patternId, warningsCreated: 0, tenantsWarned: 0 };
  }

  // 2. Find candidate drafts. We treat "any tenant that has had a recent
  // ana_interaction on the same (agency, doc_type, intent) tuple with an
  // open artifact" as a candidate. Each candidate becomes a warning row.
  const severity = severityFromConfidence(confidence);
  const result = await pool.query<{ organization_id: number; project_id: number | null; artifact_id: string | null }>(
    `INSERT INTO intelligence.pattern_warnings (
       organization_id, project_id, artifact_id,
       pattern_id, pattern_fingerprint,
       severity, status,
       suggested_correction, confidence_at_warning
     )
     SELECT DISTINCT
            ai.organization_id,
            ai.project_id,
            ai.artifact_id,
            $1::uuid,
            $2::text,
            $3::text,
            'open',
            $4::text,
            $5::float
       FROM intelligence.ana_interactions ai
      WHERE ai.agency = $6
        AND ai.document_type = $7
        AND ai.intent_class = $8
        AND ai.recorded_at > NOW() - ($9 || ' days')::interval
     ON CONFLICT (organization_id, (COALESCE(project_id, -1)), (COALESCE(artifact_id, '')), pattern_id)
     DO NOTHING
     RETURNING organization_id, project_id, artifact_id`,
    [
      p.id,
      p.pattern_fingerprint,
      severity,
      p.suggested_correction,
      confidence,
      p.agency, p.document_type, p.intent_class,
      String(lookback),
    ],
  );

  const tenants = new Set<number>();
  for (const r of result.rows) tenants.add(r.organization_id);
  if (result.rowCount && result.rowCount > 0) {
    log.info(`Replayed pattern=${patternId} warnings=${result.rowCount} tenants=${tenants.size}`);
  }
  return {
    patternId,
    warningsCreated: result.rowCount ?? 0,
    tenantsWarned: tenants.size,
  };
}

/**
 * Run replay across every active pattern that was promoted recently. Used
 * as a backfill / nightly job after bulk pattern extraction.
 */
export async function replayRecentlyPromoted(opts: ReplayPatternOptions & { since?: Date } = {}): Promise<{
  patternsReplayed: number;
  warningsCreated: number;
}> {
  const since = opts.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
  const patterns = await pool.query<{ id: string }>(
    `SELECT id FROM intelligence.failure_patterns
      WHERE status = 'active' AND extracted_at >= $1
      ORDER BY extracted_at DESC`,
    [since],
  );
  let totalWarnings = 0;
  for (const row of patterns.rows) {
    const r = await replayPattern(row.id, opts);
    totalWarnings += r.warningsCreated;
  }
  return { patternsReplayed: patterns.rows.length, warningsCreated: totalWarnings };
}

// ─── Read path / resolve path ────────────────────────────────────────────────

export interface ActiveWarning {
  readonly id: string;
  readonly patternId: string;
  readonly severity: WarningSeverity;
  readonly suggestedCorrection: string;
  readonly confidence: number;
  readonly createdAt: string;
}

export async function getActiveWarnings(query: {
  organizationId: number;
  projectId?: number;
  artifactId?: string;
}): Promise<ActiveWarning[]> {
  const result = await pool.query(
    `SELECT id, pattern_id, severity, suggested_correction,
            confidence_at_warning, created_at::text
       FROM intelligence.pattern_warnings
      WHERE organization_id = $1
        AND status = 'open'
        AND ($2::bigint IS NULL OR project_id = $2)
        AND ($3::text IS NULL OR artifact_id = $3)
      ORDER BY
        CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
        confidence_at_warning DESC`,
    [query.organizationId, query.projectId ?? null, query.artifactId ?? null],
  );
  return result.rows.map(r => ({
    id: r.id,
    patternId: r.pattern_id,
    severity: r.severity as WarningSeverity,
    suggestedCorrection: r.suggested_correction,
    confidence: parseFloat(r.confidence_at_warning),
    createdAt: r.created_at,
  }));
}

export type ResolutionStatus = 'fixed' | 'dismissed';

/**
 * Resolve a warning. A `dismissed` resolution is itself a feedback signal —
 * the pattern-decay job will treat repeated dismissals as evidence the
 * pattern is misfiring and demote its decay_factor.
 */
export async function resolveWarning(params: {
  warningId: string;
  organizationId: number;
  status: ResolutionStatus;
  note?: string;
}): Promise<{ resolved: boolean }> {
  const result = await pool.query(
    `UPDATE intelligence.pattern_warnings
        SET status = $3, resolved_at = NOW(), resolution = $4
      WHERE id = $1 AND organization_id = $2 AND status = 'open'`,
    [params.warningId, params.organizationId, params.status, params.note ?? null],
  );
  return { resolved: (result.rowCount ?? 0) > 0 };
}
