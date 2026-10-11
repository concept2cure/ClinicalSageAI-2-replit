/**
 * Reproduce the AnA markdown-cache benchmark with the real marked + DOMPurify.
 * Run from the repository root:
 * node docs/evidence/D4/2026-10-08-ana-speed-experience/markdown-cache-benchmark.mjs
 *
 * Compiles the original renderer at the batch's synced base and the working
 * renderer. No network, browser, provider, or database calls are made.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = process.cwd();
const base = process.argv[2] || '185b6f089d58f4bb9f1cead26d9aef9a403f4576';
const sourcePath = 'client/src/concept2cure/components/ana/renderSafeMarkdown.ts';
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const tempDir = mkdtempSync(path.join(root, '.ana-markdown-benchmark-'));
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { marked } = await import('marked');
const { default: DOMPurify } = await import('dompurify');
const originalParse = marked.parse;
const originalSanitize = DOMPurify.sanitize;
let parserCalls = 0;
let sanitizerCalls = 0;
marked.parse = function (...args) {
  parserCalls += 1;
  return originalParse.apply(this, args);
};
DOMPurify.sanitize = function (...args) {
  sanitizerCalls += 1;
  return originalSanitize.apply(this, args);
};

async function compile(source, name) {
  const result = await build({
    stdin: { contents: source, resolveDir: path.dirname(path.join(root, sourcePath)), loader: 'ts' },
    alias: { '@shared': path.join(root, 'shared') },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const output = path.join(tempDir, `${name}.mjs`);
  writeFileSync(output, result.outputFiles[0].text);
  return output;
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

const history = Array.from({ length: 80 }, (_, index) => [
  `## Project evidence review ${index + 1}`,
  '',
  `The selected project document contains **source-linked information** for review ${index + 1}.`,
  'Confirm the evidence in the [project catalog](/concept2cure/projects).',
  '',
  '| Item | Review status |',
  '| --- | --- |',
  '| Extracted content | Needs review |',
  '| Source lineage | Available |',
  '',
  '- Review the cited section before accepting the draft.',
  '- Keep unresolved gaps visible in the document workflow.',
  '',
  '<script>alert("blocked")</script><a href="javascript:alert(1)">unsafe link</a>',
].join('\n'));
const streamingTokens = Array.from({ length: 600 }, (_, index) => ` detail-${index}`);
let content = '### Draft evidence summary\n\n';
const prefixes = streamingTokens.map(token => (content += token));

async function run(output, name, repetition) {
  // Fresh module = empty private cache for every measured run.
  const { renderSafeMarkdown } = await import(`${pathToFileURL(output).href}?run=${repetition}`);
  parserCalls = 0;
  sanitizerCalls = 0;
  const started = performance.now();
  const retained = history.map(renderSafeMarkdown);
  const streamed = [];
  for (const prefix of prefixes) {
    streamed.push(renderSafeMarkdown(prefix));
    for (let index = 0; index < history.length; index += 1) {
      assert.equal(renderSafeMarkdown(history[index]), retained[index]);
    }
  }
  const elapsedMs = performance.now() - started;
  for (const html of retained) {
    assert.doesNotMatch(html, /<script|javascript:|alert\(/i);
    assert.match(html, /<strong>source-linked information<\/strong>/);
  }
  return { name, repetition, parserCalls, sanitizerCalls, elapsedMs, retained, streamed };
}

try {
  const beforeSource = execFileSync('git', ['show', `${base}:${sourcePath}`], { cwd: root, encoding: 'utf8' });
  const afterSource = readFileSync(path.join(root, sourcePath), 'utf8');
  assert.match(beforeSource, /const MD_CACHE_MAX = 200;/);
  assert.match(afterSource, /const MD_CACHE_MAX = 200;/);
  const before = await compile(beforeSource, 'before');
  const after = await compile(afterSource, 'after');
  // Warm the actual libraries before measuring either cache policy.
  DOMPurify.sanitize(marked.parse('**library warmup**'));
  const runs = [];
  for (let repetition = 0; repetition < 3; repetition += 1) {
    const order = repetition % 2 === 0 ? [['before', before], ['after', after]] : [['after', after], ['before', before]];
    const paired = {};
    for (const [name, output] of order) {
      const result = await run(output, name, repetition);
      paired[name] = result;
      runs.push({ name, repetition, parserCalls: result.parserCalls, sanitizerCalls: result.sanitizerCalls, elapsedMs: result.elapsedMs });
    }
    assert.deepEqual(paired.before.retained, paired.after.retained);
    assert.deepEqual(paired.before.streamed, paired.after.streamed);
    assert.equal(paired.after.parserCalls, history.length + prefixes.length);
    assert.equal(paired.after.sanitizerCalls, history.length + prefixes.length);
  }
  const summarize = name => {
    const selected = runs.filter(run => run.name === name);
    return {
      parserCalls: selected[0].parserCalls,
      sanitizerCalls: selected[0].sanitizerCalls,
      medianElapsedMs: median(selected.map(run => run.elapsedMs)),
    };
  };
  const beforeSummary = summarize('before');
  const afterSummary = summarize('after');
  const result = {
    baselineCommit: base,
    renderer: sourcePath,
    runtime: process.version,
    measuredAt: new Date().toISOString(),
    workload: { displayedHistoryAnswers: history.length, distinctStreamingPrefixes: prefixes.length, totalRenderCalls: history.length + prefixes.length * (history.length + 1), repetitions: 3, cacheLimitBeforeAndAfter: 200, libraries: 'real marked and DOMPurify under jsdom' },
    before: beforeSummary,
    after: afterSummary,
    avoidedParserAndSanitizerCalls: beforeSummary.parserCalls - afterSummary.parserCalls,
    parserAndSanitizerReductionPercent: 100 * (beforeSummary.parserCalls - afterSummary.parserCalls) / beforeSummary.parserCalls,
    medianElapsedReductionPercent: 100 * (beforeSummary.medianElapsedMs - afterSummary.medianElapsedMs) / beforeSummary.medianElapsedMs,
    allOutputIdentical: true,
    maliciousHistorySanitized: true,
    limitation: 'A local synchronous renderer microbenchmark, not end-to-end model latency or browser frame-rate evidence. Wall-clock measurements vary with host load; operation counts are deterministic.',
    runs,
  };
  writeFileSync(path.join(evidenceDir, 'markdown-cache-benchmark.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  marked.parse = originalParse;
  DOMPurify.sanitize = originalSanitize;
  dom.window.close();
  rmSync(tempDir, { recursive: true, force: true });
}
