/**
 * Existing RAG regression evaluator, with explicit evaluation-corpus binding.
 * --org-uuid and --program-id are required. Unreviewed/unresolved gold items
 * remain in the report as errors. A subset of successful items cannot establish
 * completeness. This runner does NOT qualify a model: the production RAG path
 * does not expose provider-resolved generator identity, and a requested model
 * alias is not proof of the model that actually answered.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type pg from 'pg';
import type { RagRetrievalParams, RagRouterResult } from '../../services/ragRouter.js';
import { EvaluationIntegrityError, safeEvaluationError } from './evaluation-errors.js';
import {
  type GoldItem, mean, hitAtK, recallAtK, reciprocalRank,
  answerContainsScore, isGroundedRefusal, isNegativeControl, judgeFaithfulness,
} from './rag-metrics.js';
import {
  type GuidanceManifest, type SourceResolution,
  requireEvaluationScope, resolveExpectedSources, readEvaluationDocument, withEvaluationTenantScope,
  verifyEvaluationScope, type EvaluationScope,
} from './qualification-corpus.js';

export interface RagEvaluationOptions {
  k: number;
  model: string | null;
  judgeModel: string | null;
  organizationId?: number | null;
  organizationUuid?: string | null;
  programId?: string | null;
}

interface CliOptions extends RagEvaluationOptions {
  minHitRate: number | null;
  minFaithfulness: number | null;
}

function validateCliNumbers(opts: CliOptions): void {
  if (!Number.isSafeInteger(opts.k) || opts.k < 1) throw new EvaluationIntegrityError('--k must be a positive whole number');
  for (const threshold of [opts.minHitRate, opts.minFaithfulness]) {
    if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) throw new EvaluationIntegrityError('Evaluation thresholds must be finite scores between 0 and 1');
  }
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { minHitRate: null, minFaithfulness: null, k: 5, model: null, judgeModel: null };
  const setters: Record<string, (value: string) => void> = {
    '--min-hit-rate': value => { opts.minHitRate = Number(value); },
    '--min-faithfulness': value => { opts.minFaithfulness = Number(value); },
    '--k': value => { opts.k = Number(value); },
    '--model': value => { opts.model = value; },
    '--judge-model': value => { opts.judgeModel = value; },
    '--org-uuid': value => { opts.organizationUuid = value; },
    '--org-id': value => { opts.organizationId = Number(value); },
    '--program-id': value => { opts.programId = value; },
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new EvaluationIntegrityError(`${flag} requires a value`);
    const set = setters[flag];
    if (typeof set !== 'function' || !Object.hasOwn(setters, flag)) throw new EvaluationIntegrityError(`Unknown evaluation flag ${flag}`);
    set(value);
  }
  validateCliNumbers(opts);
  requireEvaluationScope({ organizationId: opts.organizationId ?? undefined, organizationUuid: opts.organizationUuid ?? undefined, programId: opts.programId ?? undefined });
  return opts;
}

/** Flag validation only. Actual attribution additionally needs served-model evidence. */
export function pqAttributionGaps(opts: Pick<RagEvaluationOptions, 'model' | 'judgeModel'>): string[] {
  const gaps: string[] = [];
  if (!opts.model) gaps.push('--model not set: the answer came from whatever the gateway selected');
  if (!opts.judgeModel) gaps.push('--judge-model not set: faithfulness was graded by an unpinned model');
  if (opts.model && opts.judgeModel && opts.model === opts.judgeModel) gaps.push(`--model and --judge-model are both "${opts.model}": a model cannot grade itself`);
  return gaps;
}

/** The existing router supports both tenant and programme scope; neither is optional here. */
export function buildQueryParams(
  question: string,
  opts: Pick<RagEvaluationOptions, 'model' | 'k' | 'organizationId' | 'organizationUuid' | 'programId'>,
): RagRetrievalParams {
  const scope = requireEvaluationScope({ organizationId: opts.organizationId ?? undefined, organizationUuid: opts.organizationUuid ?? undefined, programId: opts.programId ?? undefined });
  if (!Number.isSafeInteger(opts.k) || opts.k < 1) throw new EvaluationIntegrityError('Evaluation k must be a positive whole number');
  return {
    query: question, intent: 'regulatory_qa', organizationId: scope.organizationId, organizationUuid: scope.organizationUuid,
    corpus: 'vault', filters: { programId: scope.programId },
    ...(opts.model ? { model: opts.model } : {}),
    limit: opts.k, strategy: 'basic', useReranking: false, useMmr: false,
    useSelfQuery: false, useCompression: false, useCorrectiveLoop: false,
    // Hybrid retrieval and source-window expansion are deterministic; preserve
    // the reviewed router defaults rather than introducing a second path.
  };
}

export function buildJudgeRequest(prompt: string, opts: Pick<RagEvaluationOptions, 'judgeModel' | 'organizationId'>) {
  return {
    taskType: 'reasoning' as const, ...(opts.judgeModel ? { model: opts.judgeModel } : {}),
    ...(opts.organizationId ? { organizationId: String(opts.organizationId) } : {}),
    messages: [{ role: 'user' as const, content: prompt }], maxTokens: 16, temperature: 0,
  };
}

export interface RagItemAssessment {
  itemId: string;
  negativeControl: boolean;
  expectedSourceIds: string[];
  retrievedDocumentIds: string[];
  hit: number | null;
  recall: number | null;
  mrr: number | null;
  answerContains: number | null;
  faithfulness: number | null;
  negativeControlPass: boolean | null;
  /** The current RAG result does not expose provider-resolved identity. */
  servedModel: null;
  servedModelVerified: false;
  judgeServedModel: null;
  error?: string;
}

export interface RagEvaluationReport {
  complete: boolean;
  usableAsPqEvidence: false;
  itemsScored: number;
  items: RagItemAssessment[];
  reasons: string[];
  qualificationGaps: string[];
  metrics: { hitRate: number; recall: number; mrr: number; answerContains: number; faithfulness: number; hitItems: number; faithfulnessItems: number };
}

export interface RagEvaluationDependencies {
  /** A test seam; real runs use the canonical database pair/programme verifier. */
  verifyScope: (scope: EvaluationScope) => Promise<void>;
  resolveSources: (item: GoldItem) => Promise<SourceResolution>;
  query: (params: RagRetrievalParams) => Promise<Pick<RagRouterResult, 'answer' | 'sources'>>;
  judge: (prompt: string) => Promise<string>;
}

function emptyAssessment(item: GoldItem): RagItemAssessment {
  return {
    itemId: item.id, negativeControl: isNegativeControl(item),
    expectedSourceIds: [], retrievedDocumentIds: [], hit: null, recall: null,
    mrr: null, answerContains: null, faithfulness: null, negativeControlPass: null,
    servedModel: null, servedModelVerified: false, judgeServedModel: null,
  };
}

async function scorePositiveAnswer(
  out: RagItemAssessment, item: GoldItem,
  result: Pick<RagRouterResult, 'answer' | 'sources'>,
  opts: RagEvaluationOptions, judge: RagEvaluationDependencies['judge'],
): Promise<void> {
  if (result.sources.some(s => !s.documentId)) throw new EvaluationIntegrityError('Retrieved source lacks a document identity; chunk ids cannot stand in for document ids');
  out.hit = hitAtK(out.retrievedDocumentIds, out.expectedSourceIds, opts.k);
  out.recall = recallAtK(out.retrievedDocumentIds, out.expectedSourceIds, opts.k);
  out.mrr = reciprocalRank(out.retrievedDocumentIds, out.expectedSourceIds);
  if (item.expectedAnswerContains?.length) out.answerContains = answerContainsScore(result.answer, item.expectedAnswerContains);
  if (!result.answer.trim() || !result.sources.length || isGroundedRefusal(result.answer)) throw new EvaluationIntegrityError('Positive gold item produced no judgeable grounded answer; faithfulness was not assessed');
  const sources = result.sources.map(s => s.compressedContent || s.expandedContent || s.content);
  out.faithfulness = await judgeFaithfulness(judge, item.question, result.answer, sources, { strict: true });
}

async function assessItem(item: GoldItem, opts: RagEvaluationOptions, deps: RagEvaluationDependencies): Promise<RagItemAssessment> {
  const out = emptyAssessment(item);
  try {
    const resolved = await deps.resolveSources(item);
    if (resolved.negativeControl !== out.negativeControl) throw new EvaluationIntegrityError('Source resolver disagrees with the declared negative-control status');
    if (resolved.errors.length) throw new EvaluationIntegrityError(resolved.errors.join('; '));
    if (!out.negativeControl && !resolved.sourceIds.length) throw new EvaluationIntegrityError('Positive gold item has no resolved expected document; retrieval was not run');
    out.expectedSourceIds = resolved.sourceIds;
    const result = await deps.query(buildQueryParams(item.question, opts));
    out.retrievedDocumentIds = result.sources.map(s => s.documentId ?? '').filter(Boolean);
    if (out.negativeControl) {
      out.negativeControlPass = result.sources.length === 0 && isGroundedRefusal(result.answer);
      if (!out.negativeControlPass) throw new EvaluationIntegrityError('Negative control did not produce an empty-corpus grounded refusal; requires review');
      return out;
    }
    await scorePositiveAnswer(out, item, result, opts, deps.judge);
  } catch (err) {
    out.error = safeEvaluationError(err, 'Retrieval or faithfulness execution failed; diagnostic details were withheld.');
  }
  return out;
}

/** Retain every gold item; partial scores are diagnostics, not complete qualification. */
export async function runRagEvaluation(
  items: GoldItem[], opts: RagEvaluationOptions, deps: RagEvaluationDependencies,
): Promise<RagEvaluationReport> {
  buildQueryParams('', opts); // Refuse unusable scope before any DB/provider dependency.
  if (opts.model && opts.model === opts.judgeModel) throw new EvaluationIntegrityError('A model cannot grade itself');
  await deps.verifyScope(requireEvaluationScope({ organizationId: opts.organizationId ?? undefined, organizationUuid: opts.organizationUuid ?? undefined, programId: opts.programId ?? undefined }));
  const results: RagItemAssessment[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) throw new EvaluationIntegrityError('Every evaluation gold item must have a distinct nonempty id');
    ids.add(item.id);
  }
  for (const item of items) results.push(await assessItem(item, opts, deps));
  const reasons = results.filter(i => i.error).map(i => `${i.itemId}: ${i.error}`);
  if (!items.length) reasons.push('No gold items were provided; nothing was assessed');
  const hit = results.flatMap(i => i.hit === null ? [] : [i.hit]);
  const faith = results.flatMap(i => i.faithfulness === null ? [] : [i.faithfulness]);
  const scored = results.filter(i => !i.error && (i.hit !== null || i.negativeControlPass === true));
  const qualificationGaps = [
    ...pqAttributionGaps(opts),
    'The production RAG path does not expose provider-resolved generator identity; requested flags do not verify the model that answered.',
    'The current faithfulness-judge adapter does not expose provider-resolved identity; requested flags do not verify the model that graded.',
    'This regression evaluator does not approve a PQ protocol or establish reviewed domain-expert acceptance.',
    ...(items.length < 30 ? [`Gold sample has ${items.length} items, below the documented 30-item target.`] : []),
    ...(reasons.length ? ['The evaluation is incomplete: every unresolved, failed or unjudged item must be resolved.'] : []),
  ];
  return {
    complete: reasons.length === 0, usableAsPqEvidence: false,
    itemsScored: scored.length, items: results, reasons, qualificationGaps,
    metrics: {
      hitRate: mean(hit), recall: mean(results.flatMap(i => i.recall === null ? [] : [i.recall])),
      mrr: mean(results.flatMap(i => i.mrr === null ? [] : [i.mrr])),
      answerContains: mean(results.flatMap(i => i.answerContains === null ? [] : [i.answerContains])),
      faithfulness: mean(faith), hitItems: hit.length, faithfulnessItems: faith.length,
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const goldText = readFileSync(path.join(here, 'gold-dataset.json'), 'utf8');
  const manifestText = readFileSync(path.join(here, 'guidance-corpus-manifest.json'), 'utf8');
  const gold = JSON.parse(goldText) as { version: string; keysProvisional: boolean; items: GoldItem[] };
  const manifest = JSON.parse(manifestText) as GuidanceManifest;
  const scope = requireEvaluationScope({ organizationId: opts.organizationId ?? undefined, organizationUuid: opts.organizationUuid ?? undefined, programId: opts.programId ?? undefined });
  let pool: pg.Pool | undefined;
  const db = async () => pool ??= (await import('../../db.js')).getPool();
  try {
    const report = await withEvaluationTenantScope(scope, () => runRagEvaluation(gold.items, opts, {
      verifyScope: async s => verifyEvaluationScope(await db(), s),
      resolveSources: item => resolveExpectedSources(item, manifest, scope, async (s, e) => readEvaluationDocument(await db(), s, e)),
      query: async params => (await import('../../services/ragRouter.js')).ragRouter.query(params),
      judge: async prompt => {
        const { getAIRouter } = await import('../../services/aiProviderRouter.js');
        return (await getAIRouter(await db()).route(buildJudgeRequest(prompt, opts))).content;
      },
    }));
    console.info(JSON.stringify({
      kind: 'rag-regression-evaluation', organizationId: scope.organizationId, organizationUuid: scope.organizationUuid, programId: scope.programId,
      requestedGenerator: opts.model, requestedJudge: opts.judgeModel,
      retrieval: { strategy: 'basic', reranking: false, corpus: 'vault' },
      goldVersion: gold.version, goldKeysProvisional: gold.keysProvisional,
      goldSha256: createHash('sha256').update(goldText).digest('hex'),
      manifestVersion: manifest.version, manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
      ...report,
    }, null, 2));
    console.info('\nNOT usable as PQ evidence:');
    for (const gap of report.qualificationGaps) console.info(`  - ${gap}`);
    const missed = (opts.minHitRate !== null && report.metrics.hitRate < opts.minHitRate) ||
      (opts.minFaithfulness !== null && report.metrics.faithfulness < opts.minFaithfulness);
    process.exitCode = report.complete && !missed ? 0 : 1;
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('run-eval failed:', safeEvaluationError(err, 'Evaluation could not execute; check database/provider configuration and operator prerequisites.'));
    process.exitCode = 1;
  });
}
