/**
 * Corpus ingestion sweep — the RIM precedent flywheel.
 *
 * The ClinicalTrials.gov ingestion pipeline already exists (fetch → normalize →
 * upsert into the precedent corpus, via `ingestCtgovToCorpus`) but ran only
 * on-demand through the corpus route, so the corpus stayed sparse. This job
 * turns that into a continuous background populate: on a schedule it walks a
 * configured query plan (indications × phases) and ingests each into the
 * corpus, so the precedent base keeps growing instead of sitting on a handful
 * of rows.
 *
 * Read-mostly and defensive: every query is independent, failures are logged
 * (never thrown), and the whole job self-guards to a no-op unless
 * ENABLE_CORPUS_INGESTION=true, mirroring the audit-chain / drift-sentinel
 * schedules — so default boot is unchanged.
 *
 * @module server/jobs/corpusIngestionSweep
 */

import cron from 'node-cron';
import { ingestCtgovToCorpus, type CtgovIngestQuery, type IngestSummary } from '../services/corpus/index.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('corpus-ingestion');

/** Per-query fetch cap when none is configured. */
const DEFAULT_LIMIT = 100;
/** Phases worth keeping fresh by default (most precedent-relevant). */
const DEFAULT_PHASES = ['PHASE2', 'PHASE3'];

export interface CorpusIngestionPlanInput {
  /** Indications to keep fresh (e.g. ['non-small cell lung cancer']). */
  indications: string[];
  /** Phase filters to expand each indication across. Empty = no phase filter. */
  phases?: string[];
  /** Per-query fetch cap. */
  limit?: number;
}

/**
 * Build the ingestion query plan from configured indications and phases.
 *
 * Pure and order-stable: the cartesian product of indications × phases, each a
 * `CtgovIngestQuery`. With no phases, one query per indication (no phase
 * filter). With no indications the plan is empty — the sweep then no-ops rather
 * than guessing what the operator wants ingested.
 */
export function buildCorpusIngestionPlan(input: CorpusIngestionPlanInput): CtgovIngestQuery[] {
  const limit = input.limit && input.limit > 0 ? input.limit : DEFAULT_LIMIT;
  const indications = input.indications.map(s => s.trim()).filter(Boolean);
  const phases = (input.phases ?? []).map(s => s.trim()).filter(Boolean);

  const plan: CtgovIngestQuery[] = [];
  for (const indication of indications) {
    if (phases.length === 0) {
      plan.push({ indication, limit });
    } else {
      for (const phase of phases) {
        plan.push({ indication, phase, limit });
      }
    }
  }
  return plan;
}

/** Parse the env-configured plan. Comma-separated lists; blank entries dropped. */
function planFromEnv(): CtgovIngestQuery[] {
  const indications = (process.env.CORPUS_INGESTION_INDICATIONS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const phases = (process.env.CORPUS_INGESTION_PHASES || DEFAULT_PHASES.join(','))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const limitRaw = Number(process.env.CORPUS_INGESTION_LIMIT);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT;
  return buildCorpusIngestionPlan({ indications, phases, limit });
}

export interface CorpusIngestionSweepResult {
  queries: number;
  totals: Pick<IngestSummary, 'fetched' | 'normalized' | 'inserted' | 'updated' | 'skipped' | 'errors'>;
}

/**
 * Run one ingestion pass over the configured plan. Never throws: a failing
 * query is logged and the sweep continues with the next.
 */
export async function runCorpusIngestionSweep(): Promise<CorpusIngestionSweepResult> {
  const plan = planFromEnv();
  const totals = { fetched: 0, normalized: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  if (plan.length === 0) {
    logger.warn(
      'Corpus ingestion sweep skipped: no indications configured (set CORPUS_INGESTION_INDICATIONS).',
    );
    return { queries: 0, totals };
  }

  logger.info(`Corpus ingestion sweep starting: ${plan.length} quer${plan.length === 1 ? 'y' : 'ies'}.`);

  for (const query of plan) {
    try {
      const summary = await ingestCtgovToCorpus(query);
      totals.fetched += summary.fetched;
      totals.normalized += summary.normalized;
      totals.inserted += summary.inserted;
      totals.updated += summary.updated;
      totals.skipped += summary.skipped;
      totals.errors += summary.errors;
      logger.info(
        `Ingested ${describeQuery(query)}: +${summary.inserted} new, ${summary.updated} updated, ` +
          `${summary.skipped} skipped, ${summary.errors} errors.`,
      );
    } catch (err: any) {
      totals.errors += 1;
      logger.error(`Corpus ingestion failed for ${describeQuery(query)}: ${err?.message}`);
    }
  }

  logger.info(
    `Corpus ingestion sweep done: +${totals.inserted} new, ${totals.updated} updated across ` +
      `${plan.length} queries (${totals.errors} errors).`,
  );
  return { queries: plan.length, totals };
}

function describeQuery(q: CtgovIngestQuery): string {
  const parts = [q.indication, q.phase].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'unfiltered';
}

/**
 * Schedule the corpus ingestion sweep. No-op unless ENABLE_CORPUS_INGESTION is
 * set, so default boot is unchanged. Default schedule: 03:30 weekly on Sunday
 * (override with CORPUS_INGESTION_CRON).
 */
export function startCorpusIngestionSchedule(): void {
  if (process.env.ENABLE_CORPUS_INGESTION !== 'true') {
    // Boot-posture line: deliberately opt-in (external CT.gov egress + DB
    // writes), so make the OFF state visible rather than silently returning.
    logger.info('Corpus ingestion sweep disabled (set ENABLE_CORPUS_INGESTION=true to enable)', {
      enabled: false,
      controlledBy: 'ENABLE_CORPUS_INGESTION',
    });
    return;
  }
  const expr = process.env.CORPUS_INGESTION_CRON || '30 3 * * 0';
  try {
    cron.schedule(expr, () => {
      void runCorpusIngestionSweep().catch(err =>
        logger.error(`Corpus ingestion sweep failed: ${err?.message ?? String(err)}`)
      );
    });
    logger.info(`Corpus ingestion sweep scheduled (${expr})`, {
      enabled: true,
      controlledBy: 'ENABLE_CORPUS_INGESTION',
      schedule: expr,
    });
  } catch (err: any) {
    logger.error(`Failed to schedule corpus ingestion sweep: ${err?.message}`);
  }
}
