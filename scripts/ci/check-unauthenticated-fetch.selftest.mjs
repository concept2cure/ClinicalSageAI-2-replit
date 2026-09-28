#!/usr/bin/env node
/**
 * Self-test for check-unauthenticated-fetch.
 *
 * A gate that has only ever been seen to pass has not been tested. This builds
 * every shape of the defect the gate exists to catch — including the two that
 * defeated an earlier URL-string sweep (a URL passed as a parameter, and a
 * `${BASE}${path}` template) and "auth" that is only a comment — and asserts
 * each one FAILS. It also asserts the two things that must PASS (a public
 * endpoint read from the server's own allowlist, and a token sent through a
 * local helper), because a gate that refuses everything is as useless as one
 * that refuses nothing. Every case restores the tree in a finally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(repoRoot, 'scripts/ci/check-unauthenticated-fetch.mjs');
const BASELINE = path.join(repoRoot, 'scripts/ci/unauthenticated-fetch-baseline.json');
const SCRATCH = path.join(repoRoot, 'client/src/concept2cure/__selftest-scratch-fetch.ts');
const SCRATCH_REL = 'client/src/concept2cure/__selftest-scratch-fetch.ts';

const run = () => spawnSync('node', [GATE], { cwd: repoRoot, encoding: 'utf8' });
let failures = 0;

function withScratch(src, fn) {
  fs.writeFileSync(SCRATCH, src);
  try { return fn(); } finally { fs.rmSync(SCRATCH, { force: true }); }
}
function withBaseline(obj, fn) {
  const orig = fs.readFileSync(BASELINE, 'utf8');
  fs.writeFileSync(BASELINE, JSON.stringify(obj, null, 2));
  try { return fn(); } finally { fs.writeFileSync(BASELINE, orig); }
}
function expectFail(label, needle, out) {
  const all = (out.stdout ?? '') + (out.stderr ?? '');
  if (out.status === 0) { console.error(`  FAIL  ${label} — the gate PASSED a case it must refuse`); failures++; }
  else if (needle && !all.includes(needle)) { console.error(`  FAIL  ${label} — refused, but never named "${needle}"\n${all}`); failures++; }
  else console.log(`  ok    ${label}`);
}
function expectPass(label, out) {
  if (out.status !== 0) { console.error(`  FAIL  ${label} — the gate REFUSED a correct call\n${out.stdout}${out.stderr}`); failures++; }
  else console.log(`  ok    ${label}`);
}

console.log('[ci:unauthenticated-fetch:selftest] the gate refuses:');

expectFail('a literal /api URL with credentials only (useVaultUpload, useSubmissions)', SCRATCH_REL,
  withScratch(`export async function f() {
  return fetch('/api/vault/ingest', { method: 'POST', credentials: 'include' });
}\n`, run));

expectFail('a URL passed as a PARAMETER (usePdevData.postJson — invisible to a URL sweep)', SCRATCH_REL,
  withScratch(`export async function postJson(url: string, body: unknown) {
  return fetch(url, { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}\n`, run));

expectFail('a ${BASE}${path} template (useEsignature — invisible to a URL sweep)', SCRATCH_REL,
  withScratch("const BASE = '/api/esignature';\nexport async function p(path: string) {\n  return fetch(`${BASE}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } });\n}\n", run));

expectFail('"auth" that is only a COMMENT', SCRATCH_REL,
  withScratch(`export async function f() {
  // TODO: add the Authorization header here
  return fetch('/api/tasks', { credentials: 'include' });
}\n`, run));

expectFail('a baseline entry with no written reason', 'no written reason',
  withScratch(`export async function f() { return fetch('/api/tasks', { credentials: 'include' }); }\n`,
    () => withBaseline({ allow: [{ file: SCRATCH_REL, target: '/api/tasks', reason: '' }] }, run)));

expectFail('a baseline entry that no longer occurs', 'no longer occurs',
  withBaseline({ allow: [{ file: 'client/src/nowhere.ts', target: '/api/gone', reason: 'A reason long enough to count as written down.' }] }, run));

console.log('[ci:unauthenticated-fetch:selftest] the gate admits:');

expectPass('a public endpoint, judged by the SERVER allowlist (/api/auth/*)',
  withScratch(`export async function f() { return fetch('/api/auth/login', { method: 'POST', credentials: 'include' }); }\n`, run));

expectPass('the token sent through a local helper (useEstarFiling jsonHeaders shape)',
  withScratch(`import { getAuthHeaders } from '@/utils/authToken';
const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...getAuthHeaders() });
export async function f() { return fetch('/api/tasks', { credentials: 'include', headers: jsonHeaders() }); }\n`, run));

expectPass('the token sent through an init object passed by name (apiRequest shape)',
  withScratch(`import { getAuthHeaders } from '@/utils/authToken';
export async function f(url: string) {
  const headers = { ...getAuthHeaders() };
  const options = { method: 'GET', headers, credentials: 'include' as const };
  return fetch(url, options);
}\n`, run));

if (failures) { console.error(`\n❌ ${failures} self-test case(s) failed`); process.exit(1); }
console.log('\n✅ ci:unauthenticated-fetch:selftest — every case behaves');
