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
import { getRAGPipeline } from '../../services/advancedRAGPipeline.js';
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
} from './metrics.js';

interface CliOptions {
  minHitRate: number | null;
  minFaithfulness: number | null;
  k: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { minHitRate: null, minFaithfulness: null, k: 5 };
  for (let i = 0; i < argv.length; i++) {
    const next = () => Number(argv[++i]);
    if (argv[i] === '--min-hit-rate') opts.minHitRate = next();
    else if (argv[i] === '--min-faithfulness') opts.minFaithfulness = next();
    else if (argv[i] === '--k') opts.k = next();
  }
  return opts;
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
  const pipeline = getRAGPipeline(pool);
  const aiRouter = getAIRouter(pool);

  const judge = async (prompt: string): Promise<string> => {
    const res = await aiRouter.route({
      taskType: 'reasoning',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 16,
      temperature: 0,
    });
    return res.content;
  };

  const hitRates: number[] = [];
  const recalls: number[] = [];
  const mrrs: number[] = [];
  const containsScores: number[] = [];
  const faithfulnessScores: number[] = [];

  console.info(`\nRAG eval — ${items.length} gold items, k=${opts.k}\n${'─'.repeat(72)}`);

  for (const item of items) {
    const result = await pipeline.queryWithGeneration(item.question, {
      strategy: 'advanced',
      limit: opts.k,
      useReranking: true,
      useMmr: true,
    });

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

  console.info('');
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => {
  console.error('run-eval failed:', err);
  process.exitCode = 1;
});
