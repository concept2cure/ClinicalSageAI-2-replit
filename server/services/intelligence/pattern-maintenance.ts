/**
 * Pattern decay + contradiction detection.
 *
 * Two failure modes the v1 corpus didn't handle:
 *
 *   1. Patterns from 2 years ago may now contradict new regulatory guidance.
 *      Decay each pattern's confidence by elapsed time since `last_seen_at`
 *      and by dismissal frequency from `pattern_warnings`. Keeps the
 *      surfaced set fresh.
 *
 *   2. When a new pattern is promoted that gives the opposite correction
 *      from an existing pattern with the same fingerprint, the older one
 *      gets marked `superseded_by` the newer one and `status='superseded'`,
 *      with an audit row in `intelligence.pattern_contradictions`. The
 *      read path filters out superseded rows.
 *
 * Both jobs are idempotent — safe to re-run.
 *
 * @module server/services/intelligence/pattern-maintenance
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import { normalizeForFingerprint } from './ana-failure-learning.js';

const log = createScopedLogger('pattern-maintenance');

export const MAINTENANCE_VERSION = '1.0.0';

// Decay constants.
//   - half_life_days controls how fast confidence decays in the absence of
//     reinforcement. 180 days = a year-old pattern with no new evidence
//     drops to ~0.25 of its original confidence.
//   - dismissal_penalty subtracts from decay_factor for each dismissed
//     warning, capped at decay_factor_floor.
export const DEFAULT_HALF_LIFE_DAYS = 180;
export const DEFAULT_DISMISSAL_PENALTY = 0.05;
export const DECAY_FACTOR_FLOOR = 0.05;

// ─── Pure decay math (no DB) ─────────────────────────────────────────────────

export function timeDecay(daysSinceLastSeen: number, halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS): number {
  if (daysSinceLastSeen <= 0) return 1;
  if (halfLifeDays <= 0) return 0;
  return Math.pow(0.5, daysSinceLastSeen / halfLifeDays);
}

export function computeDecayFactor(params: {
  daysSinceLastSeen: number;
  dismissedWarnings: number;
  halfLifeDays?: number;
  dismissalPenalty?: number;
}): number {
  const time = timeDecay(params.daysSinceLastSeen, params.halfLifeDays);
  const penalty = (params.dismissalPenalty ?? DEFAULT_DISMISSAL_PENALTY) * params.dismissedWarnings;
  return Math.max(DECAY_FACTOR_FLOOR, time - penalty);
}

// ─── Decay job ───────────────────────────────────────────────────────────────

export interface DecayOptions {
  readonly halfLifeDays?: number;
  readonly dismissalPenalty?: number;
}

export interface DecayResult {
  readonly evaluated: number;
  readonly updated: number;
  readonly demoted: number;     // patterns whose decayed_confidence fell below the floor
}

/**
 * Walk every active pattern, recompute its decay_factor + decayed_confidence,
 * write back in place. Patterns whose decayed_confidence falls below the
 * floor are not deleted — they're kept active but ranked lowest, so a
 * future curator can revive them if they turn out to still be relevant.
 */
export async function applyDecay(opts: DecayOptions = {}): Promise<DecayResult> {
  const result = await pool.query<{
    id: string;
    confidence: number;
    days_since_last_seen: number;
    dismissed_count: number;
  }>(
    `SELECT fp.id,
            fp.confidence::float                                AS confidence,
            EXTRACT(EPOCH FROM NOW() - fp.last_seen_at) / 86400 AS days_since_last_seen,
            COALESCE((SELECT COUNT(*) FROM intelligence.pattern_warnings pw
                       WHERE pw.pattern_id = fp.id AND pw.status = 'dismissed'), 0)::int
                                                                AS dismissed_count
       FROM intelligence.failure_patterns fp
      WHERE fp.status = 'active'`,
  );

  let updated = 0;
  let demoted = 0;
  for (const r of result.rows) {
    const factor = computeDecayFactor({
      daysSinceLastSeen: Number(r.days_since_last_seen),
      dismissedWarnings: r.dismissed_count,
      halfLifeDays: opts.halfLifeDays,
      dismissalPenalty: opts.dismissalPenalty,
    });
    const decayed = factor * Number(r.confidence);
    await pool.query(
      `UPDATE intelligence.failure_patterns
          SET decay_factor = $2,
              decayed_confidence = $3,
              last_decay_at = NOW()
        WHERE id = $1`,
      [r.id, factor, decayed],
    );
    updated += 1;
    if (decayed < 0.2) demoted += 1;
  }
  if (updated > 0) log.info(`Decay applied: updated=${updated} demoted_to_low_conf=${demoted}`);
  return { evaluated: result.rows.length, updated, demoted };
}

// ─── Contradiction detection ─────────────────────────────────────────────────

interface PatternRow {
  id: string;
  pattern_fingerprint: string;
  suggested_correction: string;
  last_seen_at: string;
  confidence: number;
  tenant_count: number;
  failure_count: number;
}

/**
 * Two corrections "contradict" when they suggest opposite token-bag
 * normalized text under the same fingerprint. We approximate by treating
 * normalized corrections as different *and* the newer one carries more
 * weight (newer last_seen_at, ≥ same tenant_count). The older row is
 * marked superseded; the newer is left active.
 */
export function isContradiction(older: PatternRow, newer: PatternRow): boolean {
  if (older.pattern_fingerprint !== newer.pattern_fingerprint) return false;
  const olderNorm = normalizeForFingerprint(older.suggested_correction);
  const newerNorm = normalizeForFingerprint(newer.suggested_correction);
  if (olderNorm === newerNorm) return false;
  // Newer must be at least as well-supported as older.
  if (newer.tenant_count < older.tenant_count) return false;
  if (new Date(newer.last_seen_at).getTime() <= new Date(older.last_seen_at).getTime()) return false;
  return true;
}

export interface ContradictionResult {
  readonly fingerprintsEvaluated: number;
  readonly contradictionsFound: number;
  readonly patternsSuperseded: number;
}

/**
 * Scan for fingerprints that have multiple active patterns. For each pair,
 * if the newer one carries a different normalized correction, supersede
 * the older one and write an audit row.
 */
export async function detectContradictions(): Promise<ContradictionResult> {
  // Find fingerprints with ≥ 2 active patterns.
  const fingerprintRows = await pool.query<{ pattern_fingerprint: string }>(
    `SELECT pattern_fingerprint
       FROM intelligence.failure_patterns
      WHERE status = 'active'
      GROUP BY pattern_fingerprint
     HAVING COUNT(*) >= 2`,
  );

  let contradictionsFound = 0;
  let patternsSuperseded = 0;

  for (const fpRow of fingerprintRows.rows) {
    const patterns = await pool.query<PatternRow>(
      `SELECT id, pattern_fingerprint, suggested_correction,
              last_seen_at::text, confidence::float, tenant_count, failure_count
         FROM intelligence.failure_patterns
        WHERE pattern_fingerprint = $1 AND status = 'active'
        ORDER BY last_seen_at ASC`,
      [fpRow.pattern_fingerprint],
    );
    if (patterns.rows.length < 2) continue;

    const newest = patterns.rows[patterns.rows.length - 1];
    for (let i = 0; i < patterns.rows.length - 1; i++) {
      const older = patterns.rows[i];
      if (!isContradiction(older, newest)) continue;
      contradictionsFound += 1;

      // Mark older as superseded; record audit row.
      await pool.query(
        `UPDATE intelligence.failure_patterns
            SET status = 'superseded',
                superseded_by = $2,
                superseded_at = NOW(),
                superseded_reason = 'newer_consensus_correction'
          WHERE id = $1`,
        [older.id, newest.id],
      );
      patternsSuperseded += 1;

      await pool.query(
        `INSERT INTO intelligence.pattern_contradictions (
           older_pattern_id, newer_pattern_id, fingerprint,
           older_correction, newer_correction,
           older_last_seen, newer_last_seen,
           detector_version
         ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8)
         ON CONFLICT (older_pattern_id, newer_pattern_id) DO NOTHING`,
        [
          older.id, newest.id, fpRow.pattern_fingerprint,
          older.suggested_correction, newest.suggested_correction,
          older.last_seen_at, newest.last_seen_at,
          `pattern-maintenance@${MAINTENANCE_VERSION}`,
        ],
      );
    }
  }

  if (contradictionsFound > 0) {
    log.info(`Contradiction scan: fingerprints=${fingerprintRows.rows.length} contradictions=${contradictionsFound} superseded=${patternsSuperseded}`);
  }
  return {
    fingerprintsEvaluated: fingerprintRows.rows.length,
    contradictionsFound,
    patternsSuperseded,
  };
}
