#!/usr/bin/env node
/**
 * check-sse-heartbeat.mjs — every server-sent event stream is opened by the one
 * helper that keeps it alive (MR-03 Stage 6 step 8, OPS-17).
 *
 * Behind CloudFront and the ALB a connection that carries nothing for 60 s is
 * closed. server/utils/sse-stream.ts (openSseStream) writes a `: heartbeat`
 * comment every 15 s. Until 2026-11-12 ten routes opened their own streams,
 * eight with no heartbeat, so an answer that waited on a model's first token,
 * a context assembly or a job's next progress event for a minute was cut at
 * the edge, mid-stream.
 *
 * This gate fails on any server/ file (tests excluded, comments stripped) other
 * than the helper that names the `text/event-stream` content type as a string,
 * which is how a stream's headers are set by hand. Two readers that only ASK
 * for a stream (an `Accept` header in an outbound fetch) and the compression
 * filter that recognizes one are listed below by name, each with its reason.
 *
 * There is no baseline.
 *
 * Usage:
 *   node scripts/ci/check-sse-heartbeat.mjs
 *   node scripts/ci/check-sse-heartbeat.mjs --self-test
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '__tests__', '__mocks__']);
export const HELPER = 'server/utils/sse-stream.ts';
/** Files that name the content type without opening a stream. */
export const NOT_PRODUCERS = new Map([
  ['server/mcp/client-transcript.ts', 'an outbound fetch to the connector, which ASKS for a stream (Accept)'],
  ['server/services/anaCortexClient.ts', 'an outbound fetch to Cortex, which ASKS for a stream (Accept)'],
  ['server/middleware/enterprise-performance.ts', 'the compression filter, which RECOGNIZES a stream so it is never compressed'],
]);
const EVENT_STREAM = /text\/event-stream/;

function isExcluded(rel) {
  return /\.(test|spec|dbtest)\.[cm]?[jt]sx?$/.test(rel) || /\.d\.ts$/.test(rel);
}

/** Every violation under root, as "file:line — what". */
export function findViolations(root, notProducers = NOT_PRODUCERS) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/.test(e.name)) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (isExcluded(rel) || rel === HELPER || notProducers.has(rel)) continue;
      stripComments(fs.readFileSync(full, 'utf8'))
        .split('\n')
        .forEach((text, i) => {
          if (EVENT_STREAM.test(text)) {
            out.push(`${rel}:${i + 1} — sets text/event-stream by hand; open the stream with openSseStream (${HELPER})`);
          }
        });
    }
  };
  walk(path.join(root, 'server'));
  return out;
}

/** A listed non-producer that no longer names the content type has nothing to excuse. */
export function staleExceptions(root, notProducers = NOT_PRODUCERS) {
  return [...notProducers.keys()].filter((rel) => {
    const full = path.join(root, rel);
    return !fs.existsSync(full) || !EVENT_STREAM.test(stripComments(fs.readFileSync(full, 'utf8')));
  });
}

function checkRepo() {
  const violations = findViolations(REPO_ROOT);
  const stale = staleExceptions(REPO_ROOT);
  if (!fs.existsSync(path.join(REPO_ROOT, HELPER))) {
    console.error(`✗ sse-heartbeat: ${HELPER} is missing; nothing opens a stream with a heartbeat.`);
    return 1;
  }
  if (violations.length === 0 && stale.length === 0) {
    console.log(`✓ sse-heartbeat: every server-sent event stream in server/ is opened by ${HELPER}`);
    return 0;
  }
  if (violations.length > 0) {
    console.error(`✗ sse-heartbeat: ${violations.length} stream(s) opened by hand\n`);
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nBehind CloudFront and the ALB, 60 s without a byte closes the connection.\n' +
        `openSseStream (${HELPER}) sets the headers and writes a heartbeat every 15 s.`,
    );
  }
  if (stale.length > 0) {
    console.error(`✗ sse-heartbeat: listed as not producing a stream, but no longer naming one: ${stale.join(', ')}. Remove them from NOT_PRODUCERS.`);
  }
  return 1;
}

function selfTest() {
  const put = (root, rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  const cases = [
    ['control — a stream opened by the helper', (r) => put(r, 'server/routes/a.ts', "const s = openSseStream(req, res);\ns.send({ type: 'x' });\n"), 0],
    ['the helper itself names the type', (r) => put(r, HELPER, "res.writeHead(200, { 'Content-Type': 'text/event-stream' });\n"), 0],
    ['a route setting the header with setHeader', (r) => put(r, 'server/routes/a.ts', "res.setHeader('Content-Type', 'text/event-stream');\n"), 1],
    ['a route setting it in writeHead, with a charset', (r) => put(r, 'server/routes/b.ts', 'res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });\n'), 1],
    ['a service opening one', (r) => put(r, 'server/services/x/stream.ts', 'res.set(`Content-Type`, `text/event-stream`);\n'), 1],
    ['the type named only in a comment', (r) => put(r, 'server/routes/c.ts', '// we used to set text/event-stream here\nconst s = openSseStream(req, res);\n'), 0],
    ['a test file', (r) => put(r, 'server/routes/__tests__/d.test.ts', "expect(h['content-type']).toBe('text/event-stream');\n"), 0],
  ];
  let failed = 0;
  for (const [name, arrange, expected] of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-heartbeat-'));
    arrange(root);
    const got = findViolations(root, new Map()).length > 0 ? 1 : 0;
    const ok = got === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${got ? 'refused' : 'passed'}${ok ? '' : ` (expected ${expected ? 'refused' : 'passed'})`}`);
    fs.rmSync(root, { recursive: true, force: true });
  }
  // A listed exception that no longer names the type is stale.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sse-heartbeat-'));
  put(root, 'server/mcp/client-transcript.ts', 'fetch(url, { headers: { Accept: "application/json" } });\n');
  const stale = staleExceptions(root, new Map([['server/mcp/client-transcript.ts', 'why']]));
  const staleOk = stale.length === 1;
  if (!staleOk) failed += 1;
  console.log(`${staleOk ? '✓' : '✗'} a stale exception is reported: ${staleOk ? 'reported' : 'not reported'}`);
  fs.rmSync(root, { recursive: true, force: true });
  if (failed) {
    console.error(`\n✗ sse-heartbeat self-test: ${failed} case(s) wrong`);
    return 1;
  }
  console.log('\n✓ sse-heartbeat self-test: every case decided as expected');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : checkRepo());
}
