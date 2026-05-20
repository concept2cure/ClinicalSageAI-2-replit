/**
 * Outcome → precedent ingestor.
 *
 * When a submission outcome lands, mint a corresponding row in
 * `precedent.regulatory_precedents` so the precedent engine can retrieve it
 * for the next sponsor's similar submission. This is what makes the corpus
 * grow with the platform instead of staying frozen at whatever was seeded.
 *
 * Idempotent: the outcome → precedent link is recorded in
 * `intelligence.outcome_precedent_links`; re-running over the same outcome
 * is a no-op.
 *
 * Embeddings are deliberately optional. If an embedding provider is wired
 * in (via `embedFn`), we compute one for the precedent's semantic field set
 * and write it; otherwise we leave embedding NULL and the precedent is still
 * retrievable by the non-vector columns (submission_type, decision, etc.).
 *
 * @module server/services/intelligence/outcome-precedent-ingestor
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('outcome-precedent-ingestor');

export const INGESTOR_VERSION = '1.0.0';

export type EmbedFn = (text: string) => Promise<number[] | null>;

function mapOutcomeStatusToDecision(status: string, hadRtf: boolean | null | undefined): string {
  if (hadRtf === true) return 'REFUSE_TO_FILE';
  switch ((status || '').toLowerCase()) {
    case 'approved': return 'APPROVED';
    case 'approved_with_conditions': return 'APPROVED_WITH_CONDITIONS';
    case 'refuse_to_file': return 'REFUSE_TO_FILE';
    case 'complete_response': return 'CRL';
    case 'withdrawn': return 'WITHDRAWN';
    default: return status.toUpperCase();
  }
}

interface RawOutcome {
  outcome_id: string;
  program_id: string;
  submission_id: string | null;
  submission_type: string;
  agency: string;
  outcome_status: string;
  outcome_date: string | null;
  submitted_at: string | null;
  questions_received: number | null;
  deficiencies_cited: number | null;
  had_rtf: boolean | null;
  had_advisory_committee: boolean | null;
  questions_detail: unknown;
  deficiencies_detail: unknown;
  therapeutic_area: string | null;
  product_type: string | null;
  device_class: string | null;
  indication: string | null;
}

async function fetchUningestedOutcomes(limit: number): Promise<RawOutcome[]> {
  const result = await pool.query<RawOutcome>(
    `SELECT so.id                AS outcome_id,
            so.program_id,
            so.submission_id,
            so.submission_type,
            so.agency,
            so.outcome_status,
            so.outcome_date::text  AS outcome_date,
            so.submitted_at::text  AS submitted_at,
            so.questions_received,
            so.deficiencies_cited,
            so.had_rtf,
            so.had_advisory_committee,
            so.questions_detail,
            so.deficiencies_detail,
            p.therapeutic_area,
            NULL::text AS product_type,
            NULL::text AS device_class,
            NULL::text AS indication
       FROM innovation.submission_outcomes so
       LEFT JOIN core.programs p ON p.id = so.program_id
      WHERE NOT EXISTS (
        SELECT 1 FROM intelligence.outcome_precedent_links opl
         WHERE opl.outcome_id = so.id
      )
      ORDER BY so.created_at DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows;
}

function summarizeQuestions(detail: unknown): string[] {
  if (!Array.isArray(detail)) return [];
  return detail
    .map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return String(obj.text ?? obj.question ?? obj.summary ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

function buildSemanticText(outcome: RawOutcome): string {
  const parts: string[] = [];
  parts.push(`Submission type: ${outcome.submission_type}`);
  parts.push(`Agency: ${outcome.agency}`);
  parts.push(`Decision: ${mapOutcomeStatusToDecision(outcome.outcome_status, outcome.had_rtf)}`);
  if (outcome.therapeutic_area) parts.push(`Therapeutic area: ${outcome.therapeutic_area}`);
  if (outcome.indication) parts.push(`Indication: ${outcome.indication}`);
  if (outcome.had_advisory_committee) parts.push('Reviewed by advisory committee');
  if (outcome.deficiencies_cited != null) parts.push(`Deficiencies cited: ${outcome.deficiencies_cited}`);
  if (outcome.questions_received != null) parts.push(`Questions received: ${outcome.questions_received}`);
  const qs = summarizeQuestions(outcome.questions_detail);
  if (qs.length > 0) parts.push(`Questions: ${qs.slice(0, 10).join(' | ')}`);
  const ds = summarizeQuestions(outcome.deficiencies_detail);
  if (ds.length > 0) parts.push(`Deficiencies: ${ds.slice(0, 10).join(' | ')}`);
  return parts.join('\n');
}

function buildRiskFactors(outcome: RawOutcome): string[] {
  const factors: string[] = [];
  if (outcome.had_rtf) factors.push('Refused to file');
  if (outcome.outcome_status === 'complete_response') factors.push('Complete response letter issued');
  if ((outcome.deficiencies_cited ?? 0) > 5) factors.push(`High deficiency count (${outcome.deficiencies_cited})`);
  if ((outcome.questions_received ?? 0) > 20) factors.push(`High question volume (${outcome.questions_received})`);
  if (outcome.had_advisory_committee) factors.push('Required advisory committee');
  return factors;
}

export interface IngestOptions {
  readonly limit?: number;
  readonly embedFn?: EmbedFn;
}

export interface IngestResult {
  readonly ingested: number;
  readonly skipped: number;
  readonly errors: number;
}

/**
 * Walk uningested outcomes, mint precedent rows, write the linkage.
 */
export async function ingestOutcomeAsPrecedent(opts: IngestOptions = {}): Promise<IngestResult> {
  const limit = opts.limit ?? 200;
  const rows = await fetchUningestedOutcomes(limit);
  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (const outcome of rows) {
    try {
      const decision = mapOutcomeStatusToDecision(outcome.outcome_status, outcome.had_rtf);
      const fdaQuestions = summarizeQuestions(outcome.questions_detail);
      const riskFactors = buildRiskFactors(outcome);

      let embedding: number[] | null = null;
      if (opts.embedFn) {
        try {
          embedding = await opts.embedFn(buildSemanticText(outcome));
        } catch (err) {
          log.warn(`Embedding failed for outcome ${outcome.outcome_id}:`, err instanceof Error ? err.message : err);
        }
      }

      const insert = await pool.query<{ id: string }>(
        `INSERT INTO precedent.regulatory_precedents (
           submission_type, product_type, device_class, therapeutic_area, indication,
           decision_date, decision_outcome,
           fda_questions, risk_factors,
           embedding,
           source_type, confidence_score, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6::date, $7,
                   $8::jsonb, $9::jsonb,
                   $10,
                   $11, $12, $13)
         RETURNING id`,
        [
          outcome.submission_type,
          outcome.product_type,
          outcome.device_class,
          outcome.therapeutic_area,
          outcome.indication,
          outcome.outcome_date,
          decision,
          JSON.stringify(fdaQuestions),
          JSON.stringify(riskFactors),
          embedding ? `[${embedding.join(',')}]` : null,
          'outcome_ingestor',
          0.9,
          `outcome_ingestor@${INGESTOR_VERSION}`,
        ],
      );

      const precedentId = insert.rows[0].id;

      await pool.query(
        `INSERT INTO intelligence.outcome_precedent_links (outcome_id, precedent_id, ingestor_version)
         VALUES ($1, $2, $3)
         ON CONFLICT (outcome_id, precedent_id) DO NOTHING`,
        [outcome.outcome_id, precedentId, INGESTOR_VERSION],
      );

      ingested += 1;
    } catch (err) {
      errors += 1;
      log.warn(`Precedent ingestion failed for outcome ${outcome.outcome_id}:`, err instanceof Error ? err.message : err);
    }
  }

  skipped = rows.length - ingested - errors;
  if (ingested > 0 || errors > 0) {
    log.info(`Outcome → precedent: ingested=${ingested} skipped=${skipped} errors=${errors}`);
  }
  return { ingested, skipped, errors };
}
