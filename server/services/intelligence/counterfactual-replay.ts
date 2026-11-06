/**
 * Counterfactual replay — proactive warnings on in-flight drafts.
 *
 * Legacy behavior (held pending reviewed de-identification, spec v0.5 §27):
 * when a `failure_pattern` was freshly promoted, replay it across every
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
import { SHARED_LEARNING_HOLD } from './ana-failure-learning.js';

export const REPLAY_VERSION = '1.1.0';
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
  readonly holdReason?: typeof SHARED_LEARNING_HOLD;
}

/**
 * Replay a single freshly-promoted pattern across all open drafts.
 * Idempotent: re-running over the same pattern is a no-op thanks to the
 * UNIQUE constraint on (org_id, project_id, artifact_id, pattern_id).
 */
export async function replayPattern(
  patternId: string,
  _opts: ReplayPatternOptions = {},
): Promise<ReplayPatternResult> {
  // Historical active patterns may contain a tenant's raw correction. They have
  // no reviewed de-identification artifact; never copy them into other tenants.
  return { patternId, warningsCreated: 0, tenantsWarned: 0, holdReason: SHARED_LEARNING_HOLD };
}

/** Do not backfill unreviewed legacy patterns into tenant warning records. */
export async function replayRecentlyPromoted(_opts: ReplayPatternOptions & { since?: Date } = {}): Promise<{
  patternsReplayed: number;
  warningsCreated: number;
  holdReason?: typeof SHARED_LEARNING_HOLD;
}> {
  return { patternsReplayed: 0, warningsCreated: 0, holdReason: SHARED_LEARNING_HOLD };
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

export async function getActiveWarnings(_query: {
  organizationId: number;
  projectId?: number;
  artifactId?: string;
}): Promise<ActiveWarning[]> {
  // Rows previously fanned out by replay can already contain another tenant's
  // text. Their receiving organization_id does not prove ownership of content.
  // Keep them hidden; existing tenant-bound resolution remains available below.
  return [];
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
