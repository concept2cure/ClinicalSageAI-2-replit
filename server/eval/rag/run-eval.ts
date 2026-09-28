/**
 * RAG evaluation runner.
 *
 * Loads the gold dataset, runs each question through the single RAG router,
 * and reports retrieval + grounding metrics. Intended for offline/CI use to
 * turn "is the RAG any good?" into numbers and catch regressions.
 *
 * Usage:
 *   tsx server/eval/rag/run-eval.ts
 *   tsx server/eval/rag/run-eval.ts --min-hit-rate 0.6 --min-faithfulness 0.7
 *
 * Exit code is non-zero when a configured threshold is missed, so it can gate CI.
 * Requires a populated corpus and a configured LLM provider; with neither it
 * reports zeros rather than fabricating a pass.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool } from '../../db';
import { ragRouter, type RagRetrievalParams } from '../../services/ragRouter.js';
import { getAIRouter } from '../../services/aiProviderRouter.js';
import {
  type GoldItem,
  mean,
  hitAtK,
  recallAtK,
  reciprocalRank,
  answerContainsScore,
  isGroundedRefusal,
  judgeFaithfulness,
} from './rag-metrics.js';

interface CliOptions {
  minHitRate: number | null;
  minFaithfulness: number | null;
  k: number;
  /** Gateway model id that must GENERATE every answer. Unset = gateway picks. */
  model: string | null;
  /** Gateway model id that must judge faithfulness. Unset = gateway picks. */
  judgeModel: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    minHitRate: null,
    minFaithfulness: null,
    k: 5,
    model: null,
    judgeModel: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const num = () => Number(argv[++i]);
    const str = () => argv[++i] ?? '';
    if (argv[i] === '--min-hit-rate') opts.minHitRate = num();
    else if (argv[i] === '--min-faithfulness') opts.minFaithfulness = num();
    else if (argv[i] === '--k') opts.k = num();
    else if (argv[i] === '--model') opts.model = str();
    else if (argv[i] === '--judge-model') opts.judgeModel = str();
  }
  return opts;
}

/**
 * A run can qualify a model only if the numbers are attributable to it: the
 * model that answered must be named, and the model that graded must be named
 * and must not be the one being graded.
 *
 * Returns the reasons this run is NOT usable as a performance qualification.
 * Empty means it is. A plain regression run needs none of this and passes no
 * pins — `--min-*` still gates CI exactly as before.
 */
export function pqAttributionGaps(opts: Pick<CliOptions, 'model' | 'judgeModel'>): string[] {
  const gaps: string[] = [];
  if (!opts.model) {
    gaps.push('--model not set: the answer came from whatever the gateway selected');
  }
  if (!opts.judgeModel) {
    gaps.push('--judge-model not set: faithfulness was graded by an unpinned model');
  }
  if (opts.model && opts.judgeModel && opts.model === opts.judgeModel) {
    gaps.push(`--model and --judge-model are both "${opts.model}": a model cannot grade itself`);
  }
  return gaps;
}

/**
 * The retrieval call for one gold item.
 *
 * Extracted so the pin is testable where it matters. `pqAttributionGaps` reads
 * the FLAGS; it cannot see whether the pinned model was actually forwarded to
 * the router. Without this seam, dropping the forwarding would leave every
 * test green while the run still printed "Attributable to <model>" — an
 * attestation about a model that never answered.
 */
export function buildQueryParams(
  question: string,
  opts: Pick<CliOptions, 'model' | 'k'>
): RagRetrievalParams {
  return {
    query: question,
    intent: 'regulatory_qa',
    ...(opts.model ? { model: opts.model } : {}),
    limit: opts.k,
    useReranking: true,
    useMmr: true,
  };
}

/** The faithfulness-judge call. Extracted for the same reason as buildQueryParams. */
export function buildJudgeRequest(prompt: string, opts: Pick<CliOptions, 'judgeModel'>) {
  return {
    taskType: 'reasoning' as const,
    ...(opts.judgeModel ? { model: opts.judgeModel } : {}),
    messages: [{ role: 'user' as const, content: prompt }],
    maxTokens: 16,
    temperature: 0,
  };
}

function loadGoldItems(): GoldItem[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, 'gold-dataset.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.items as GoldItem[];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const items = loadGoldItems();
  const pool = getPool();
  const aiRouter = getAIRouter(pool);

  // Self-grading is refused before any model is called: a run that would be
  // unusable as evidence should not cost tokens to discover that.
  if (opts.model && opts.judgeModel && opts.model === opts.judgeModel) {
    console.error(
      `\nFAIL: --model and --judge-model are both "${opts.model}". ` +
        'A model cannot grade its own faithfulness.\n'
    );
    process.exitCode = 1;
    return;
  }

  const judge = async (prompt: string): Promise<string> => {
    const res = await aiRouter.route(buildJudgeRequest(prompt, opts));
    return res.content;
  };

  const hitRates: number[] = [];
  const recalls: number[] = [];
  const mrrs: number[] = [];
  const containsScores: number[] = [];
  const faithfulnessScores: number[] = [];

  console.info(
    `\nRAG eval — ${items.length} gold items, k=${opts.k}` +
      `\n  generator  ${opts.model ?? '(gateway selects — run is not attributable)'}` +
      `\n  judge      ${opts.judgeModel ?? '(gateway selects — grading is not attributable)'}` +
      `\n${'─'.repeat(72)}`
  );

  for (const item of items) {
    const result = await ragRouter.query(buildQueryParams(item.question, opts));

    const retrievedIds = result.sources.map(s => s.documentId || s.id);
    const expected = item.expectedSourceIds ?? [];

    // Retrieval metrics only count when the item declares expected sources.
    if (expected.length > 0) {
      hitRates.push(hitAtK(retrievedIds, expected, opts.k));
      recalls.push(recallAtK(retrievedIds, expected, opts.k));
      mrrs.push(reciprocalRank(retrievedIds, expected));
    }

    if (item.expectedAnswerContains?.length) {
      containsScores.push(answerContainsScore(result.answer, item.expectedAnswerContains));
    }

    // Faithfulness: skip grounded refusals (correct behaviour, not a hallucination).
    if (result.sources.length > 0 && !isGroundedRefusal(result.answer)) {
      const sources = result.sources.map(s => s.compressedContent || s.content);
      try {
        faithfulnessScores.push(
          await judgeFaithfulness(judge, item.question, result.answer, sources)
        );
      } catch (err) {
        console.warn(`  [${item.id}] faithfulness judge failed: ${(err as Error).message}`);
      }
    }

    console.info(
      `  ${item.id.padEnd(40)} retrieved=${retrievedIds.length} ` +
        `${expected.length ? `hit@${opts.k}=${hitAtK(retrievedIds, expected, opts.k)}` : 'hit=n/a'}`
    );
  }

  const hitRate = mean(hitRates);
  const recall = mean(recalls);
  const mrr = mean(mrrs);
  const contains = mean(containsScores);
  const faithfulness = mean(faithfulnessScores);

  console.info(`${'─'.repeat(72)}\nResults`);
  console.info(`  hit-rate@${opts.k}     ${hitRate.toFixed(3)}  (${hitRates.length} scored items)`);
  console.info(`  recall@${opts.k}       ${recall.toFixed(3)}`);
  console.info(`  MRR             ${mrr.toFixed(3)}`);
  console.info(`  answer-contains ${contains.toFixed(3)}  (${containsScores.length} scored items)`);
  console.info(
    `  faithfulness    ${faithfulness.toFixed(3)}  (${faithfulnessScores.length} scored items)`
  );

  let failed = false;
  if (opts.minHitRate !== null && hitRate < opts.minHitRate) {
    console.error(`\nFAIL: hit-rate ${hitRate.toFixed(3)} < min ${opts.minHitRate}`);
    failed = true;
  }
  if (opts.minFaithfulness !== null && faithfulness < opts.minFaithfulness) {
    console.error(`FAIL: faithfulness ${faithfulness.toFixed(3)} < min ${opts.minFaithfulness}`);
    failed = true;
  }

  // Say plainly whether these numbers can be cited as a qualification of a
  // named model. Thresholds are a separate question: a run can pass its gates
  // and still be unusable as PQ evidence, so this never changes the exit code.
  const gaps = pqAttributionGaps(opts);
  if (gaps.length === 0) {
    console.info(
      `\nAttributable to ${opts.model} (judged by ${opts.judgeModel}) — usable as PQ evidence.`
    );
  } else {
    console.info('\nNOT usable as PQ evidence:');
    for (const gap of gaps) console.info(`  - ${gap}`);
  }

  console.info('');
  process.exitCode = failed ? 1 : 0;
}

// Guarded so `pqAttributionGaps` can be imported and tested without opening a
// pool and running the whole eval — same pattern as server/eval/pq/run-pq.ts.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('run-eval failed:', err);
    process.exitCode = 1;
  });
}
