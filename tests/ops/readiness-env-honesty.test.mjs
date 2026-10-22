/**
 * A readiness probe judges the environment it is running in — not a laptop.
 *
 * ── The defect these pin ────────────────────────────────────────────────────
 * `ga-readiness-report.mjs` and `pilot-go-no-go.mjs` both opened with
 * `dotenv.config({ quiet: true })`, merging the repository's gitignored
 * development `.env` into process.env before judging a single row. Measured on
 * 2026-10-11 at 1c8e565f:
 *
 *   • row `flag-rls` — "RLS enforcement (RLS_ENFORCE=on)", severity BLOCKER,
 *     owner "Ops (deploy env)" — reported `ready`, `observed: RLS_ENFORCE="on"`,
 *     sourced from `.env`. The sibling gate said of the same switch on the same
 *     tree: "RLS_ENFORCE=on but no table FORCEs row security, so the switch
 *     currently filters nothing."
 *   • the headline moved with the shell: 6 ready / 18 blockers from the repo
 *     root, 5 / 19 from anywhere else, because dotenv resolves `.env` from
 *     process.cwd().
 *
 * The report's own design contract forbids both: "Nothing is ever reported
 * ready on the strength of a comment, a doc, or an intention."
 *
 * ── Why the integration cases assert invariants, not numbers ────────────────
 * The repository's `.env` is gitignored, so its contents differ per machine and
 * may be absent in CI. A test asserting "flag-rls is blocked" would then pass
 * for the wrong reason on a box with no `.env` at all. So the subprocess cases
 * assert what must hold REGARDLESS of any developer's file: the default never
 * reports a local file as loaded, and the verdict cannot move with cwd. The
 * contents-dependent behaviour is unit-tested against a temp directory instead,
 * where the fixture is controlled.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadReadinessEnv,
  parseDotEnv,
  readinessEnvNotice,
  INCLUDE_LOCAL_ENV_FLAG,
} from '../../scripts/ops/lib/readiness-env.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = path.join(repoRoot, 'scripts', 'ops', 'ga-readiness-report.mjs');

function runReport(args = [], cwd = repoRoot) {
  // The report exits 1 while blockers stand, which is its contract, so a
  // non-zero status is expected and must not fail the test.
  let out;
  try {
    out = execFileSync(process.execPath, [REPORT, '--json', ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: undefined },
    });
  } catch (e) {
    out = e.stdout ?? '';
  }
  return JSON.parse(out.slice(out.indexOf('{')));
}

// ── The helper, against a controlled fixture ────────────────────────────────

test('without the flag, a local .env is not read at all', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'renv-'));
  try {
    writeFileSync(path.join(dir, '.env'), 'RLS_ENFORCE=on\n');
    delete process.env.RLS_ENFORCE;
    const state = loadReadinessEnv({ repoRoot: dir, argv: ['node', 'probe'] });
    assert.equal(state.localEnvLoaded, false);
    assert.equal(process.env.RLS_ENFORCE, undefined, 'the file must not have been merged');
  } finally {
    delete process.env.RLS_ENFORCE;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with the flag, the file is read, and every name it supplied is reported', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'renv-'));
  try {
    writeFileSync(path.join(dir, '.env'), 'RLS_ENFORCE=on\nSMTP_HOST=smtp.example\n');
    delete process.env.RLS_ENFORCE;
    delete process.env.SMTP_HOST;
    const state = loadReadinessEnv({
      repoRoot: dir,
      argv: ['node', 'probe', INCLUDE_LOCAL_ENV_FLAG],
    });
    assert.equal(state.localEnvLoaded, true);
    assert.deepEqual(state.keys, ['RLS_ENFORCE', 'SMTP_HOST']);
    assert.equal(process.env.RLS_ENFORCE, 'on');
  } finally {
    delete process.env.RLS_ENFORCE;
    delete process.env.SMTP_HOST;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a real environment variable is never overwritten by the file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'renv-'));
  try {
    writeFileSync(path.join(dir, '.env'), 'RLS_ENFORCE=on\n');
    process.env.RLS_ENFORCE = 'off';
    const state = loadReadinessEnv({
      repoRoot: dir,
      argv: ['node', 'probe', INCLUDE_LOCAL_ENV_FLAG],
    });
    // An operator's explicit setting must win: the deployment is the authority.
    assert.equal(process.env.RLS_ENFORCE, 'off');
    assert.ok(!state.keys.includes('RLS_ENFORCE'));
  } finally {
    delete process.env.RLS_ENFORCE;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the file is resolved from the repository root, not the shell cwd', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'renv-repo-'));
  const elsewhere = mkdtempSync(path.join(os.tmpdir(), 'renv-else-'));
  const cwd = process.cwd();
  try {
    writeFileSync(path.join(repo, '.env'), 'RLS_ENFORCE=on\n');
    writeFileSync(path.join(elsewhere, '.env'), 'RLS_ENFORCE=off\n');
    process.chdir(elsewhere);
    delete process.env.RLS_ENFORCE;
    loadReadinessEnv({ repoRoot: repo, argv: ['node', 'probe', INCLUDE_LOCAL_ENV_FLAG] });
    assert.equal(process.env.RLS_ENFORCE, 'on', 'must read the repo root, not the cwd');
  } finally {
    process.chdir(cwd);
    delete process.env.RLS_ENFORCE;
    rmSync(repo, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('the notice states whose environment produced the verdict, on both paths', () => {
  assert.match(readinessEnvNotice({ localEnvLoaded: false, keys: [] }), /process environment only/i);
  const loaded = readinessEnvNotice({
    localEnvLoaded: true,
    envPath: '/x/.env',
    keys: ['RLS_ENFORCE'],
  });
  assert.match(loaded, /THIS MACHINE, not a deployment/);
  assert.match(loaded, /RLS_ENFORCE/);
});

test('parseDotEnv handles comments, blanks, quotes, and refuses junk keys', () => {
  const p = parseDotEnv('# c\n\nA=1\nB="two"\nC=\'three\'\n9BAD=x\nnoequals\n');
  assert.deepEqual(p, { A: '1', B: 'two', C: 'three' });
});

// ── The report itself, as a subprocess ──────────────────────────────────────

test('the report never reports a local file loaded unless asked', () => {
  const d = runReport();
  assert.equal(d.summary.localEnvLoaded, false);
  assert.equal(d.summary.localEnvPath, null);
});

test('the verdict does not move with the shell working directory', () => {
  // This is the regression that made the launch number depend on where you
  // stood: 6/18 from the repo root, 5/19 from anywhere else.
  const here = runReport([], repoRoot);
  const there = runReport([], os.tmpdir());
  assert.equal(here.summary.ready, there.summary.ready);
  assert.equal(here.summary.blockersOutstanding, there.summary.blockersOutstanding);
  const byId = Object.fromEntries(there.rows.map((r) => [r.id, r.status]));
  for (const r of here.rows) assert.equal(r.status, byId[r.id], `row ${r.id} moved with cwd`);
});

test('a production enforcement blocker is not green by default', () => {
  // flag-rls is owned by "Ops (deploy env)". With no deployment environment
  // supplied, the honest answer is blocked — never ready off a dev file.
  const d = runReport();
  const rls = d.rows.find((r) => r.id === 'flag-rls');
  assert.ok(rls, 'flag-rls row must exist');
  assert.equal(rls.severity, 'blocker');
  assert.notEqual(rls.status, 'ready');
});

test('the opt-in flag does load the repository .env when one is present', (t) => {
  if (!existsSync(path.join(repoRoot, '.env'))) {
    t.skip('no .env in this checkout — contents-dependent behaviour is unit-tested above');
    return;
  }
  const d = runReport([INCLUDE_LOCAL_ENV_FLAG]);
  assert.equal(d.summary.localEnvLoaded, true);
  assert.ok(Array.isArray(d.summary.localEnvKeys));
});
