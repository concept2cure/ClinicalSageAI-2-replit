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
 * Allowed callers: `server/eval/pq/` and test files. Comments are blanked
 * before matching, so documentation that names the method is not a caller —
 * by the shared, string-aware stripper (scripts/ci/lib/strip-comments.mjs).
 * The regex pair this gate used to carry read a route glob such as
 * '/api/eval/*' as the start of a comment that ran to the next real `*` `/`,
 * and cut a line at the `//` of a protocol-relative URL, so a call below the
 * one or after the other was never read. The self-test holds both cases.
 *
 * Usage:
 *   node scripts/ci/check-pq-evaluation-callers.mjs
 *   node scripts/ci/check-pq-evaluation-callers.mjs --self-test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['server', 'client', 'shared', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
// Any reference to the identifier in code, not only `.evaluateModel(`: bracket
// access (`gw['evaluateModel']`), destructuring and `.bind` reach the same door
// (track GW review [14], 2026-09-28). Assembling the name from pieces at
// runtime is not caught; that is a deliberate evasion a review should see.
const CALL = /\bevaluateModel\b/;

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
      const lines = stripComments(fs.readFileSync(full, 'utf8')).split('\n');
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
    '\nevaluateModel skips routing, fallback, every model-governance rule (approved entry, high-risk\n' +
      'approval, the production PQ gate) and the rate limit. Outside the PQ runner it is a way to have\n' +
      'an unapproved model draft regulated content. Use route().',
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
    ['a service reaches it by bracket access', () => put('server/services/drafting.ts', "const r = await gw['evaluateModel']('gpt-4o', req);\n"), 1],
    ['a service destructures it', () => put('server/services/drafting.ts', 'const { evaluateModel } = getGateway();\n'), 1],
    ['a service binds it', () => put('server/services/drafting.ts', 'const run = gw.evaluateModel.bind(gw);\n'), 1],
    // A string holding `/*` is not a comment opener. The old regex blanked from
    // the route glob to the JSDoc closer below, the call between them included.
    ['a call below a route glob holding /*, above a JSDoc', () => put('server/routes/eval.ts', "router.use('/api/eval/*', requireAuth);\nconst r = await gw.evaluateModel('gpt-4o', req);\n/** next handler */\n"), ['server/routes/eval.ts:2']],
    // Nor is a `//` inside a string a line comment: a protocol-relative URL cut
    // the rest of its line, the call included. ('https://' was spared only by
    // the old regex's `:` exception; it is held here too.)
    ['a call after a //cdn URL on the same line', () => put('server/services/cdn.ts', "const u = '//cdn.example.test/m.js'; const r = await gw.evaluateModel('m', req);\n"), ['server/services/cdn.ts:1']],
    ['a call after an https:// URL on the same line', () => put('server/services/fetch.ts', "const u = 'https://api.example.test/v1'; const r = await gw.evaluateModel('m', req);\n"), ['server/services/fetch.ts:1']],
    ['control — a block comment after a route glob holding /*', () => put('server/routes/eval.ts', "router.use('/api/eval/*', requireAuth);\n/* gw.evaluateModel('m', req) */\nconst a = 1;\n"), 0],
    ['control — a line comment after an https:// URL', () => put('server/services/fetch.ts', "const u = 'https://api.example.test/v1'; // gw.evaluateModel('m', req)\n"), 0],
  ];
  // `expect` is 0 (clean), 1 (caught) or the exact `file:line` list the gate
  // must report, which pins the line to the source line of the call.
  let failures = 0;
  for (const [name, setup, expect] of cases) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    setup();
    const callers = findCallers(root);
    const found = callers.length > 0 ? 1 : 0;
    const ok = Array.isArray(expect) ? callers.join('\n') === expect.join('\n') : found === expect;
    if (!ok) failures += 1;
    const why = !found && expect ? '  — NOT CAUGHT' : found && !expect ? '  — false positive' : `  — reported [${callers.join(', ')}]`;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : why}`);
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
