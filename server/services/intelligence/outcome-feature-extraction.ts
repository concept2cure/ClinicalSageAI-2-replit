/**
 * Outcome → feature vector extractor.
 *
 * Single-place definition of how a submission_outcome row (plus its companion
 * signals / completeness state) becomes a numeric feature vector for the
 * predictive risk model. Kept side-effect-free in the pure builders so
 * feature engineering can be unit-tested without a DB.
 *
 * The feature set is intentionally small and interpretable. Each feature is
 * either a normalized count (0..1 after clipping), a binary indicator
 * (0 or 1), or a one-hot of a closed enum bin. The serving path computes
 * features the same way from in-flight drafts — see `featuresForDraft()`.
 *
 * @module server/services/intelligence/outcome-feature-extraction
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import type { FeatureMap } from './risk-model.js';

const log = createScopedLogger('outcome-feature-extraction');

export const EXTRACTOR_VERSION = '1.0.0';

// ─── Closed enums (one-hot bins) ─────────────────────────────────────────────

const SUBMISSION_TYPE_BINS = [
  'nda', 'bla', 'ind', 'anda', '505b2',
  '510k', 'pma', 'denovo',
  'cer', 'maa', 'other',
] as const;
type SubmissionTypeBin = typeof SUBMISSION_TYPE_BINS[number];

const AGENCY_BINS = ['fda', 'ema', 'pmda', 'mhra', 'hc', 'swissmedic', 'other'] as const;
type AgencyBin = typeof AGENCY_BINS[number];

const THERAPEUTIC_AREA_BINS = [
  'oncology', 'cns', 'cardiovascular', 'metabolic',
  'infectious_disease', 'immunology', 'rare_disease',
  'medtech', 'other',
] as const;
type TherapeuticAreaBin = typeof THERAPEUTIC_AREA_BINS[number];

export type CompletenessBin = 'low' | 'medium' | 'high';

// ─── Bin helpers ─────────────────────────────────────────────────────────────

export function binSubmissionType(raw: string | null | undefined): SubmissionTypeBin {
  if (!raw) return 'other';
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'nda') return 'nda';
  if (s === 'bla') return 'bla';
  if (s === 'ind') return 'ind';
  if (s === 'anda') return 'anda';
  if (s === '505b2' || s === '505b' || s === 'fda505b2') return '505b2';
  if (s === '510k' || s === 'fda510k' || s === 'k510') return '510k';
  if (s === 'pma' || s === 'fdapma') return 'pma';
  if (s === 'denovo' || s === 'fdadenovo') return 'denovo';
  if (s === 'cer' || s === 'eumdrcer' || s === 'mdrcer') return 'cer';
  if (s === 'maa') return 'maa';
  return 'other';
}

export function binAgency(raw: string | null | undefined): AgencyBin {
  if (!raw) return 'other';
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'fda') return 'fda';
  if (s === 'ema') return 'ema';
  if (s === 'pmda') return 'pmda';
  if (s === 'mhra') return 'mhra';
  if (s === 'hc' || s === 'healthcanada') return 'hc';
  if (s === 'swissmedic') return 'swissmedic';
  return 'other';
}

export function binTherapeuticArea(raw: string | null | undefined): TherapeuticAreaBin {
  if (!raw) return 'other';
  const s = raw.toLowerCase();
  if (s.includes('oncolog') || s.includes('cancer') || s.includes('tumor')) return 'oncology';
  if (s.includes('cns') || s.includes('neuro') || s.includes('psych')) return 'cns';
  if (s.includes('cardio') || s.includes('heart') || s.includes('vascular')) return 'cardiovascular';
  if (s.includes('metabolic') || s.includes('diabet') || s.includes('endocrin')) return 'metabolic';
  if (s.includes('infect') || s.includes('virus') || s.includes('bacter')) return 'infectious_disease';
  if (s.includes('immun') || s.includes('autoimm') || s.includes('allerg')) return 'immunology';
  if (s.includes('rare') || s.includes('orphan')) return 'rare_disease';
  if (s.includes('device') || s.includes('medtech') || s.includes('510') || s.includes('pma')) return 'medtech';
  return 'other';
}

export function binCompleteness(readinessPercentage: number | null | undefined): CompletenessBin | null {
  if (readinessPercentage == null || !Number.isFinite(readinessPercentage)) return null;
  if (readinessPercentage >= 85) return 'high';
  if (readinessPercentage >= 60) return 'medium';
  return 'low';
}

// ─── Feature builders ────────────────────────────────────────────────────────

export interface FeatureContext {
  readonly submissionType: string;
  readonly agency: string;
  readonly therapeuticArea?: string | null;
  readonly reviewDays?: number | null;
  readonly questionsReceived?: number | null;
  readonly informationRequests?: number | null;
  readonly deficienciesCited?: number | null;
  readonly hadAdvisoryCommittee?: boolean | null;
  readonly readinessPercentage?: number | null;
  readonly missingCriticalCount?: number | null;
  readonly missingImportantCount?: number | null;
  readonly weakSectionCount?: number | null;
  readonly harmonizeIssueCount?: number | null;
  readonly openEscalations?: number | null;
}

function clampNorm(value: number | null | undefined, scale: number): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / scale));
}

function oneHot<T extends string>(value: T, options: readonly T[]): FeatureMap {
  const out: { [k: string]: number } = {};
  for (const opt of options) out[`is_${opt}`] = opt === value ? 1 : 0;
  return out;
}

/**
 * Build a feature vector. Used both for training (with an observed outcome)
 * and for scoring an in-flight draft (where review/questions/etc. are
 * unknown — those features cleanly degrade to 0).
 */
export function buildFeatures(ctx: FeatureContext): FeatureMap {
  const subType = binSubmissionType(ctx.submissionType);
  const agency = binAgency(ctx.agency);
  const ta = binTherapeuticArea(ctx.therapeuticArea ?? null);

  return {
    // Categorical one-hots (prefixed so they don't collide).
    ...Object.fromEntries(
      Object.entries(oneHot(subType, SUBMISSION_TYPE_BINS)).map(([k, v]) => [`stype_${k}`, v]),
    ),
    ...Object.fromEntries(
      Object.entries(oneHot(agency, AGENCY_BINS)).map(([k, v]) => [`agency_${k}`, v]),
    ),
    ...Object.fromEntries(
      Object.entries(oneHot(ta, THERAPEUTIC_AREA_BINS)).map(([k, v]) => [`ta_${k}`, v]),
    ),

    // Continuous, normalized.
    completeness_pct:   clampNorm(ctx.readinessPercentage, 100),
    missing_critical:   clampNorm(ctx.missingCriticalCount, 10),
    missing_important:  clampNorm(ctx.missingImportantCount, 20),
    weak_sections:      clampNorm(ctx.weakSectionCount, 20),
    harmonize_issues:   clampNorm(ctx.harmonizeIssueCount, 30),
    open_escalations:   clampNorm(ctx.openEscalations, 10),

    // Post-submission features (zero during pre-submission scoring).
    questions_received: clampNorm(ctx.questionsReceived, 30),
    info_requests:      clampNorm(ctx.informationRequests, 20),
    deficiencies:       clampNorm(ctx.deficienciesCited, 30),
    review_days_norm:   clampNorm(ctx.reviewDays, 365),
    had_advcomm:        ctx.hadAdvisoryCommittee ? 1 : 0,
  };
}

/**
 * Score-time variant. Discards features that don't exist for a pre-submission
 * draft — questions_received / info_requests / deficiencies / review_days /
 * had_advcomm are zeroed regardless of input, since at scoring time we have
 * not yet observed them.
 */
export function featuresForDraft(ctx: Omit<FeatureContext,
  'reviewDays' | 'questionsReceived' | 'informationRequests' | 'deficienciesCited' | 'hadAdvisoryCommittee'
>): FeatureMap {
  return buildFeatures({
    ...ctx,
    reviewDays: 0,
    questionsReceived: 0,
    informationRequests: 0,
    deficienciesCited: 0,
    hadAdvisoryCommittee: false,
  });
}

// ─── Training-time extraction (DB-backed) ────────────────────────────────────

export interface SubmissionOutcomeRow {
  readonly id: string;
  readonly programId: string;
  readonly submissionId: string | null;
  readonly submissionType: string;
  readonly agency: string;
  readonly outcomeStatus: string;
  readonly reviewDays: number | null;
  readonly questionsReceived: number | null;
  readonly informationRequests: number | null;
  readonly deficienciesCited: number | null;
  readonly wasFirstCycle: boolean | null;
  readonly hadRtf: boolean | null;
  readonly hadAdvisoryCommittee: boolean | null;
}

function deriveLabels(status: string, hadRtf: boolean | null, wasFirstCycle: boolean | null): {
  rtf: boolean;
  crl: boolean;
  firstCycle: boolean;
} {
  const s = (status || '').toLowerCase();
  return {
    rtf: hadRtf === true || s === 'refuse_to_file',
    crl: s === 'complete_response' || s === 'refuse_to_file', // CRL covers both failure modes
    firstCycle: wasFirstCycle === true && (s === 'approved' || s === 'approved_with_conditions'),
  };
}

/**
 * Extract feature vectors from outcome rows that don't yet have one. Idempotent
 * via the UNIQUE(outcome_id) constraint on outcome_feature_vectors.
 *
 * Returns the number of new vectors written.
 */
export async function extractPendingOutcomeVectors(opts: { limit?: number } = {}): Promise<number> {
  const limit = opts.limit ?? 500;
  const result = await pool.query<{
    id: string;
    program_id: string;
    submission_id: string | null;
    submission_type: string;
    agency: string;
    outcome_status: string;
    review_days: number | null;
    questions_received: number | null;
    information_requests: number | null;
    deficiencies_cited: number | null;
    was_first_cycle: boolean | null;
    had_rtf: boolean | null;
    had_advisory_committee: boolean | null;
    therapeutic_area: string | null;
    organization_id: string | null;
  }>(
    `SELECT so.id, so.program_id, so.submission_id,
            so.submission_type, so.agency, so.outcome_status,
            so.review_days, so.questions_received, so.information_requests,
            so.deficiencies_cited, so.was_first_cycle, so.had_rtf, so.had_advisory_committee,
            COALESCE(p.therapeutic_area, NULL) AS therapeutic_area,
            COALESCE(p.organization_id::text, NULL) AS organization_id
       FROM innovation.submission_outcomes so
       LEFT JOIN core.programs p ON p.id = so.program_id
      WHERE NOT EXISTS (
        SELECT 1 FROM intelligence.outcome_feature_vectors ofv
         WHERE ofv.outcome_id = so.id
      )
      ORDER BY so.created_at DESC
      LIMIT $1`,
    [limit],
  );

  let written = 0;
  for (const r of result.rows) {
    const ctx: FeatureContext = {
      submissionType: r.submission_type,
      agency: r.agency,
      therapeuticArea: r.therapeutic_area,
      reviewDays: r.review_days,
      questionsReceived: r.questions_received,
      informationRequests: r.information_requests,
      deficienciesCited: r.deficiencies_cited,
      hadAdvisoryCommittee: r.had_advisory_committee,
    };
    const features = buildFeatures(ctx);
    const labels = deriveLabels(r.outcome_status, r.had_rtf, r.was_first_cycle);
    try {
      await pool.query(
        `INSERT INTO intelligence.outcome_feature_vectors (
           outcome_id, organization_id, submission_type, agency, therapeutic_area,
           features, label_rtf, label_crl, label_first_cycle
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (outcome_id) DO NOTHING`,
        [
          r.id,
          r.organization_id ? Number(r.organization_id) || null : null,
          r.submission_type,
          r.agency,
          binTherapeuticArea(r.therapeutic_area),
          JSON.stringify(features),
          labels.rtf,
          labels.crl,
          labels.firstCycle,
        ],
      );
      written += 1;
    } catch (err) {
      log.warn(`Failed to extract vector for outcome ${r.id}:`, err instanceof Error ? err.message : err);
    }
  }
  if (written > 0) log.info(`Extracted ${written} outcome feature vectors (limit=${limit})`);
  return written;
}
