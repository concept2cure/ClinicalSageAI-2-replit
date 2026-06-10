/**
 * Per-document-type doc-quality evaluation runner.
 *
 * Loads the gold tasks and produces a per-document-type scorecard for
 * extraction (field F1) and generation (section coverage + forbidden hits).
 *
 * Two modes:
 *  - Offline (default): scores any task that carries a captured candidate
 *    (`candidateContent` / `candidateExtraction`). No DB or LLM required, so it
 *    is runnable in CI today and regression-gates captured outputs.
 *  - Live (--live): would run each task's `input` through the extraction /
 *    generation services. Not wired here — left as the data-population follow-up
 *    so we never fabricate a pass.
 *
 * Usage:
 *   tsx server/eval/doc-quality/run-eval.ts
 *   tsx server/eval/doc-quality/run-eval.ts --min-coverage 0.85 --min-f1 0.8
 *
 * Exit code is non-zero when a configured threshold is missed (CI gate).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  type GoldDocTask,
  mean,
  scoreGenerationTask,
  scoreExtractionTask,
} from './doc-quality-metrics.js';
import { getGateway } from '../../services/ai-gateway/gateway.js';

/**
 * Live generation through the governed AI gateway. Returns null (and logs) when
 * no provider is configured, so a keyless environment reports "skipped" rather
 * than fabricating a pass.
 */
async function liveGenerate(task: GoldDocTask): Promise<string | null> {
  if (!task.input) return null;
  const sections = (task.requiredSections ?? []).join(', ');
  const prompt =
    `You are drafting the "${task.docType}" document section below. Use only the source ` +
    `material provided. Cover these sections where supported: ${sections}. Cite sources ` +
    `inline. Do not overclaim.\n\nSource material:\n${task.input}`;
  try {
    return await getGateway().complete(prompt, {
      taskType: 'document_drafting',
      temperature: 0,
      callerModule: 'doc-quality-eval',
    });
  } catch (err) {
    console.warn(`  [${task.id}] live generation unavailable: ${(err as Error).message}`);
    return null;
  }
}

interface CliOptions {
  minCoverage: number | null;
  minF1: number | null;
  live: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { minCoverage: null, minF1: null, live: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min-coverage') opts.minCoverage = Number(argv[++i]);
    else if (argv[i] === '--min-f1') opts.minF1 = Number(argv[++i]);
    else if (argv[i] === '--live') opts.live = true;
  }
  return opts;
}

function loadTasks(): GoldDocTask[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, 'gold-tasks.json'), 'utf8');
  return JSON.parse(raw).tasks as GoldDocTask[];
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const tasks = loadTasks();

  if (opts.live) {
    console.info(
      'Live mode: generation tasks with `input` are drafted through the AI gateway and scored.\n' +
        'Extraction live mode is not wired (needs the per-doc-type extraction service); those score\n' +
        'from captured candidates only.'
    );
  }

  const coverageByDoc = new Map<string, number[]>();
  const f1ByDoc = new Map<string, number[]>();
  let forbiddenTotal = 0;
  let generationScored = 0;
  let extractionScored = 0;
  let skipped = 0;

  const push = (map: Map<string, number[]>, key: string, v: number) => {
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  };

  console.info(`\nDoc-quality eval — ${tasks.length} gold tasks\n${'─'.repeat(72)}`);

  for (const task of tasks) {
    if (task.taskType === 'generation') {
      const content =
        typeof task.candidateContent === 'string'
          ? task.candidateContent
          : opts.live
            ? await liveGenerate(task)
            : null;
      if (content === null) {
        skipped += 1;
        console.info(`  ${task.id.padEnd(34)} [${task.docType}] skipped (no candidate; needs --live + input)`);
        continue;
      }
      const s = scoreGenerationTask(task, content, opts.minCoverage ?? 0.85);
      push(coverageByDoc, task.docType, s.sectionCoverage);
      forbiddenTotal += s.forbiddenHits;
      generationScored += 1;
      console.info(
        `  ${task.id.padEnd(34)} [${task.docType}] coverage=${s.sectionCoverage.toFixed(2)} ` +
          `forbidden=${s.forbiddenHits} ${s.pass ? 'PASS' : 'FAIL'}`
      );
    } else if (task.taskType === 'extraction' && task.candidateExtraction) {
      const s = scoreExtractionTask(task, task.candidateExtraction, opts.minF1 ?? 0.8);
      push(f1ByDoc, task.docType, s.f1);
      extractionScored += 1;
      console.info(
        `  ${task.id.padEnd(34)} [${task.docType}] F1=${s.f1.toFixed(2)} ` +
          `(P=${s.precision.toFixed(2)} R=${s.recall.toFixed(2)}) ${s.pass ? 'PASS' : 'FAIL'}`
      );
    } else {
      skipped += 1;
      console.info(`  ${task.id.padEnd(34)} [${task.docType}] skipped (no captured candidate; needs --live)`);
    }
  }

  console.info(`${'─'.repeat(72)}\nPer-document-type scorecard`);
  const docTypes = new Set([...coverageByDoc.keys(), ...f1ByDoc.keys()]);
  for (const dt of [...docTypes].sort()) {
    const cov = coverageByDoc.get(dt);
    const f1s = f1ByDoc.get(dt);
    const parts: string[] = [];
    if (cov) parts.push(`gen coverage ${mean(cov).toFixed(2)} (${cov.length})`);
    if (f1s) parts.push(`extract F1 ${mean(f1s).toFixed(2)} (${f1s.length})`);
    console.info(`  ${dt.padEnd(8)} ${parts.join(' · ')}`);
  }

  const overallCoverage = mean([...coverageByDoc.values()].flat());
  const overallF1 = mean([...f1ByDoc.values()].flat());
  console.info(`${'─'.repeat(72)}`);
  console.info(`  overall gen coverage ${overallCoverage.toFixed(3)} (${generationScored} scored)`);
  console.info(`  overall extract F1   ${overallF1.toFixed(3)} (${extractionScored} scored)`);
  console.info(`  forbidden-pattern hits ${forbiddenTotal}`);
  if (skipped > 0) console.info(`  skipped (need live run) ${skipped}`);

  let failed = false;
  if (forbiddenTotal > 0) {
    console.error(`\nFAIL: ${forbiddenTotal} forbidden-pattern hit(s) across scored generations.`);
    failed = true;
  }
  if (opts.minCoverage !== null && generationScored > 0 && overallCoverage < opts.minCoverage) {
    console.error(`FAIL: gen coverage ${overallCoverage.toFixed(3)} < min ${opts.minCoverage}`);
    failed = true;
  }
  if (opts.minF1 !== null && extractionScored > 0 && overallF1 < opts.minF1) {
    console.error(`FAIL: extract F1 ${overallF1.toFixed(3)} < min ${opts.minF1}`);
    failed = true;
  }

  console.info('');
  process.exitCode = failed ? 1 : 0;
}

main().catch(err => {
  console.error('run-eval failed:', err);
  process.exitCode = 1;
});
