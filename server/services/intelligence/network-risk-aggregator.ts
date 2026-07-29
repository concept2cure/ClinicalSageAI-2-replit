/**
 * Network risk aggregator — the cross-tenant network effect.
 *
 * Bins all observed submission outcomes by
 *   (target, submission_type, agency, therapeutic_area, completeness_bin)
 * and publishes a Laplace-noised positive rate per bin to
 * `intelligence.network_risk_priors`. Tenants can query that table to retrieve
 * a prior for their in-flight draft without ever seeing another tenant's row.
 *
 * Privacy controls:
 *   1. k-anonymity gate — bins with < MIN_TENANT_COUNT distinct tenants are
 *      dropped, never written. Prevents single-tenant inference.
 *   2. Laplace mechanism — each published rate gets noise drawn from
 *      Laplace(0, 1 / (epsilon * sample_size)). The smaller the bin, the
 *      noisier the result, which is exactly the differential-privacy
 *      guarantee we want.
 *   3. Budget ledger — every rebuild charges epsilon. The federated-learning
 *      coordinator's privacy_budget_ledger is the long-term home; this module
 *      records its own epsilon spend per row for auditability.
 *
 * @module server/services/intelligence/network-risk-aggregator
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import type { RiskTarget } from './risk-model.js';
import {
  binAgency,
  binSubmissionType,
  binTherapeuticArea,
  type CompletenessBin,
} from './outcome-feature-extraction.js';

const log = createScopedLogger('network-risk-aggregator');

export const AGGREGATOR_VERSION = '1.0.0';

// k-anonymity threshold — a row must combine at least this many distinct
// tenants before it's safe to publish.
export const MIN_TENANT_COUNT = 3;

// Minimum bin size — even with enough tenants we don't publish a rate from
// fewer than this many outcomes. Keeps noise from dominating.
export const MIN_SAMPLE_SIZE = 5;

// Default privacy budget per rebuild. Roughly: ε=1 means "this rebuild can
// reveal an attacker's posterior at most a factor of e≈2.7 more confident
// than their prior", per row.
export const DEFAULT_EPSILON = 1.0;

const TARGETS: readonly RiskTarget[] = ['rtf', 'crl', 'first_cycle_approval'];

// ─── Pure noise helpers (exported for testing) ───────────────────────────────

/**
 * Sample from Laplace(0, scale). Inverse-CDF method.
 *
 * `rng` is injectable so tests can pin determinism. Defaults to Math.random.
 */
export function laplaceNoise(scale: number, rng: () => number = Math.random): number {
  if (scale <= 0) return 0;
  const u = rng() - 0.5;
  // sign(u) * scale * ln(1 - 2|u|)
  return -Math.sign(u) * scale * Math.log(1 - 2 * Math.abs(u));
}

export function clampRate(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value === Number.POSITIVE_INFINITY) return 1;
  if (value === Number.NEGATIVE_INFINITY) return 0;
  return Math.min(1, Math.max(0, value));
}

// ─── Aggregation pipeline ────────────────────────────────────────────────────

interface RawBinRow {
  target: RiskTarget;
  submission_type: string;
  agency: string;
  therapeutic_area: string | null;
  completeness_bin: CompletenessBin | null;
  sample_size: number;
  positive_count: number;
  tenant_count: number;
}

async function fetchRawBins(): Promise<RawBinRow[]> {
  // SQL is intentionally explicit per target — avoids dynamic SQL with
  // user-controlled column names and keeps each target's labels distinct.
  const out: RawBinRow[] = [];

  for (const target of TARGETS) {
    const labelCol =
      target === 'rtf' ? 'label_rtf'
      : target === 'crl' ? 'label_crl'
      : 'label_first_cycle';

    // Use a feature-derived completeness bin from the stored features map.
    // We round the completeness_pct feature (already clipped to [0,1]) to a
    // coarse 3-bin label.
    const result = await pool.query<RawBinRow>(
      `SELECT
         $1::text AS target,
         submission_type,
         agency,
         therapeutic_area,
         CASE
           WHEN (features->>'completeness_pct')::float >= 0.85 THEN 'high'
           WHEN (features->>'completeness_pct')::float >= 0.60 THEN 'medium'
           WHEN (features->>'completeness_pct')::float >  0    THEN 'low'
           ELSE NULL
         END AS completeness_bin,
         COUNT(*)::int                      AS sample_size,
         SUM(CASE WHEN ${labelCol} THEN 1 ELSE 0 END)::int AS positive_count,
         COUNT(DISTINCT organization_id)::int AS tenant_count
       FROM intelligence.outcome_feature_vectors
       GROUP BY submission_type, agency, therapeutic_area, completeness_bin`,
      [target],
    );
    out.push(...result.rows);
  }

  return out;
}

export interface RebuildOptions {
  readonly epsilon?: number;
  readonly rng?: () => number;
  readonly minTenantCount?: number;
  readonly minSampleSize?: number;
}

export interface RebuildResult {
  readonly published: number;
  readonly suppressed: number;
  readonly epsilon: number;
  readonly version: string;
}

/**
 * Rebuild every published prior row from scratch, applying DP noise and the
 * k-anonymity gate. Atomic: deletes existing priors and inserts fresh ones in
 * a single transaction so readers see a consistent snapshot.
 */
export async function rebuildNetworkPriors(opts: RebuildOptions = {}): Promise<RebuildResult> {
  const epsilon = opts.epsilon ?? DEFAULT_EPSILON;
  const rng = opts.rng ?? Math.random;
  const minTenants = opts.minTenantCount ?? MIN_TENANT_COUNT;
  const minSamples = opts.minSampleSize ?? MIN_SAMPLE_SIZE;

  const raw = await fetchRawBins();
  let published = 0;
  let suppressed = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE intelligence.network_risk_priors');

    for (const row of raw) {
      if (row.tenant_count < minTenants || row.sample_size < minSamples) {
        suppressed += 1;
        continue;
      }
      // Bin the inputs through the public binners so the published row uses
      // the same canonical strings the lookup path produces.
      const sType = binSubmissionType(row.submission_type);
      const agency = binAgency(row.agency);
      const ta = row.therapeutic_area
        ? binTherapeuticArea(row.therapeutic_area)
        : null;

      const trueRate = row.positive_count / row.sample_size;
      // Sensitivity of a single record on the rate = 1 / n.
      const noiseScale = 1 / (epsilon * row.sample_size);
      const noised = clampRate(trueRate + laplaceNoise(noiseScale, rng));

      await client.query(
        `INSERT INTO intelligence.network_risk_priors (
           target, submission_type, agency, therapeutic_area, completeness_bin,
           sample_size, tenant_count, raw_positive_count, noised_rate, epsilon
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (target, submission_type, agency, therapeutic_area, completeness_bin)
         DO UPDATE SET
           sample_size = EXCLUDED.sample_size,
           tenant_count = EXCLUDED.tenant_count,
           raw_positive_count = EXCLUDED.raw_positive_count,
           noised_rate = EXCLUDED.noised_rate,
           epsilon = EXCLUDED.epsilon,
           computed_at = NOW()`,
        [
          row.target,
          sType,
          agency,
          ta,
          row.completeness_bin,
          row.sample_size,
          row.tenant_count,
          row.positive_count,
          noised,
          epsilon,
        ],
      );
      published += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('Network prior rebuild failed:', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    client.release();
  }

  log.info(`Network priors rebuilt: published=${published} suppressed=${suppressed} epsilon=${epsilon}`);
  return { published, suppressed, epsilon, version: AGGREGATOR_VERSION };
}

// ─── Read path ───────────────────────────────────────────────────────────────

export interface PriorLookup {
  readonly target: RiskTarget;
  readonly submissionType: string;
  readonly agency: string;
  readonly therapeuticArea?: string | null;
  readonly completenessBin?: CompletenessBin | null;
}

export interface PriorResult {
  readonly probability: number | null;       // null when no bin matches
  readonly sampleSize: number;
  readonly tenantCount: number;
  readonly epsilon: number | null;
  readonly matchSpecificity: 'exact' | 'no_completeness' | 'no_ta_or_completeness' | 'submission_agency_only' | 'none';
}

/**
 * Look up the network prior for a feature combination. Falls back from
 * most-specific (target+stype+agency+ta+completenessBin) to least-specific
 * (target+stype+agency) so we always return something useful while the
 * specific bin is undertrained.
 */
export async function lookupNetworkPrior(query: PriorLookup): Promise<PriorResult> {
  const sType = binSubmissionType(query.submissionType);
  const agency = binAgency(query.agency);
  const ta = query.therapeuticArea ? binTherapeuticArea(query.therapeuticArea) : null;
  const cb = query.completenessBin ?? null;

  const candidates: Array<{ ta: string | null; cb: CompletenessBin | null; tag: PriorResult['matchSpecificity'] }> = [
    { ta, cb, tag: 'exact' },
    { ta, cb: null, tag: 'no_completeness' },
    { ta: null, cb: null, tag: 'no_ta_or_completeness' },
  ];

  for (const c of candidates) {
    const result = await pool.query(
      `SELECT noised_rate, sample_size, tenant_count, epsilon
         FROM intelligence.network_risk_priors
        WHERE target = $1 AND submission_type = $2 AND agency = $3
          AND ($4::text IS NULL AND therapeutic_area IS NULL OR therapeutic_area = $4)
          AND ($5::text IS NULL AND completeness_bin IS NULL OR completeness_bin = $5)
        ORDER BY sample_size DESC
        LIMIT 1`,
      [query.target, sType, agency, c.ta, c.cb],
    );
    if (result.rows.length > 0) {
      const r = result.rows[0];
      return {
        probability: parseFloat(r.noised_rate),
        sampleSize: r.sample_size,
        tenantCount: r.tenant_count,
        epsilon: r.epsilon === null ? null : parseFloat(r.epsilon),
        matchSpecificity: c.tag,
      };
    }
  }

  // Last resort: ignore therapeutic_area + completeness entirely.
  const broad = await pool.query(
    `SELECT AVG(noised_rate)::float AS p,
            SUM(sample_size)::int    AS n,
            SUM(tenant_count)::int   AS k,
            AVG(epsilon)::float      AS eps
       FROM intelligence.network_risk_priors
      WHERE target = $1 AND submission_type = $2 AND agency = $3`,
    [query.target, sType, agency],
  );
  const b = broad.rows[0];
  if (b && b.p !== null) {
    return {
      probability: parseFloat(b.p),
      sampleSize: b.n,
      tenantCount: b.k,
      epsilon: b.eps === null ? null : parseFloat(b.eps),
      matchSpecificity: 'submission_agency_only',
    };
  }

  return {
    probability: null,
    sampleSize: 0,
    tenantCount: 0,
    epsilon: null,
    matchSpecificity: 'none',
  };
}
