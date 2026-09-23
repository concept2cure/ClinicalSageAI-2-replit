#!/usr/bin/env node
/**
 * check-pq-evaluation-callers.mjs — only the PQ runner may call
 * `AIGateway.evaluateModel`.
 *
 * `evaluateModel` runs a request on exactly one named model with no routing,
 * no fallback and no high-risk approval check. That is what performance
 * qualification needs: `docs/LAUNCH_DEFINITION_OF_DONE.md` has unapproved
 * models earn approval BY passing their PQ, so the PQ must be able to exercise
 * them. Anywhere else, the same call is a way to have an unapproved model draft
 * regulated content — the exact thing `approvedForTask` in gateway.ts exists to
 * stop. So the door is kept narrow by this gate rather than by a comment.
 *
 * Allowed callers: `server/eval/pq/` and test files. Comments are stripped
 * before matching, so documentation that names the method is not a caller.
 *
 * Usage:
 *   node scripts/ci/check-pq-evaluation-callers.mjs
 *   node scripts/ci/check-pq-evaluation-callers.mjs --self-test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['server', 'client', 'shared', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
const CALL = /\.evaluateModel\s*\(/;

function isAllowed(rel) {
  const p = rel.split(path.sep).join('/');
  return (
    p.startsWith('server/eval/pq/') ||
    /(^|\/)__tests__\//.test(p) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
    // The definition itself, and this file, whose self-test fixtures carry the
    // call inside string literals.
    p === 'server/services/ai-gateway/gateway.ts' ||
    p === 'scripts/ci/check-pq-evaluation-callers.mjs'
  );
}

/** Remove block and line comments so a doc comment naming the method is not a call. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

export function findCallers(root) {
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
      const rel = path.relative(root, full);
      if (isAllowed(rel)) continue;
      const lines = codeOnly(fs.readFileSync(full, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (CALL.test(line)) out.push(`${rel}:${i + 1}`);
      });
    }
  };
  for (const d of SCAN_DIRS) walk(path.join(root, d));
  return out;
}

function checkRepo() {
  const callers = findCallers(REPO_ROOT);
  if (callers.length === 0) {
    console.log('✓ pq-evaluation-callers: AIGateway.evaluateModel is called only from server/eval/pq/ and tests');
    return 0;
  }
  console.error(`✗ pq-evaluation-callers: ${callers.length} call(s) outside server/eval/pq/\n`);
  for (const c of callers) console.error(`  ${c}`);
  console.error(
    '\nevaluateModel skips routing, fallback and the high-risk approval check. Outside the PQ\n' +
      'runner it is a way to have an unapproved model draft regulated content. Use route().',
  );
  return 1;
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-callers-'));
  const put = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  const cases = [
    ['control — the PQ runner calls it', () => put('server/eval/pq/run-pq.ts', 'await gw.evaluateModel("claude-opus-4", req);\n'), 0],
    ['control — a test calls it', () => put('server/services/ai-gateway/__tests__/x.test.ts', 'await gw.evaluateModel("m", r);\n'), 0],
    ['control — a doc comment names it', () => put('server/services/ana/doc.ts', '/** see gateway.evaluateModel(...) */\n// never call .evaluateModel( here\nconst a = 1;\n'), 0],
    ['a route handler calls it', () => put('server/routes/authoring.ts', 'const r = await getGateway().evaluateModel("gpt-4o", req);\n'), 1],
    ['a service calls it across a line break', () => put('server/services/drafting.ts', 'const r = await gw\n  .evaluateModel ("gpt-4o", req);\n'), 1],
  ];
  let failures = 0;
  for (const [name, setup, expect] of cases) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    setup();
    const found = findCallers(root).length > 0 ? 1 : 0;
    const ok = found === expect;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : expect ? '  — NOT CAUGHT' : '  — false positive'}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
  if (failures) {
    console.error(`\n✗ self-test: ${failures} case(s) wrong`);
    return 1;
  }
  console.log(`\n✓ self-test: ${cases.length} cases, every violation caught and the controls clean`);
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : checkRepo());
}
