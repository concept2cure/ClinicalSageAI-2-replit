/**
 * The shell demo seeds carry no credential, target this machine unless told
 * otherwise, and name no real company. 2026-10-15.
 *
 * scripts/seed-demo-oral-biologics.sh, seed-ind-pyramid.sh and seed-demo-data.sh
 * signed in with passwords committed in the script (Lumen2026!, demo123, as
 * the founder's address); the first two posted to a hard-coded localhost and
 * seed-demo-data.sh to any BASE_URL; seed-ind-pyramid.sh wrote into project
 * proj_25 of whatever database answered. seed-demo-oral-biologics.sh created a
 * faux client named after a real company, Lumen Bioscience, carrying its real
 * program codes (LMN-201 …), its street address, a named "SVP", a claimed
 * BARDA contract, an IND number, a "[Digital Signature Applied]" Form 1571,
 * and invented investigators at real Seattle institutions.
 *
 * Each script is run here, for real, with a stub `curl` first on PATH that
 * records every request (its arguments and the body it reads from stdin) and
 * answers as a failed request, so the script stops at its first call.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPTS = ['seed-demo-oral-biologics.sh', 'seed-ind-pyramid.sh', 'seed-demo-data.sh'] as const;
const OPERATOR = { DEMO_EMAIL: 'operator@local.test', DEMO_PASSWORD: 'operator-chosen-secret' };
const REMOTE = 'http://uat.example.invalid:5000';

const stubDir = mkdtempSync(path.join(tmpdir(), 'curl-stub-'));
writeFileSync(
  path.join(stubDir, 'curl'),
  [
    '#!/usr/bin/env bash',
    '{',
    '  printf "CALL"; for a in "$@"; do printf " %s" "$a"; done; printf "\\n"',
    '  for a in "$@"; do if [ "$a" = "@-" ]; then printf "STDIN "; cat; printf "\\n"; fi; done',
    '} >> "$CURL_LOG"',
    'exit 22',
    '',
  ].join('\n'),
);
chmodSync(path.join(stubDir, 'curl'), 0o755);

afterAll(() => rmSync(stubDir, { recursive: true, force: true }));

let runs = 0;
function runSeed(script: string, env: Record<string, string>) {
  const log = path.join(stubDir, `curl-${++runs}.log`);
  const r = spawnSync('bash', [path.join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    env: { PATH: `${stubDir}:${process.env.PATH}`, HOME: process.env.HOME ?? '', CURL_LOG: log, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const requests = existsSync(log) ? readFileSync(log, 'utf8') : '';
  return { status: r.status, out: `${r.stdout}\n${r.stderr}`, requests };
}

/** What a script needs besides credentials before it may start. */
const EXTRA: Record<string, Record<string, string>> = { 'seed-ind-pyramid.sh': { DEMO_PROJECT_ID: 'proj_7' } };

describe.each(SCRIPTS)('%s', (script) => {
  it('refuses without DEMO_EMAIL and DEMO_PASSWORD, before any request', () => {
    const r = runSeed(script, { ...EXTRA[script] });
    expect(r.requests, r.out).toBe('');
    expect(r.out).toMatch(/DEMO_EMAIL and DEMO_PASSWORD/);
    expect(r.status).not.toBe(0);
  });

  it('refuses a server that is not on this machine, before any request', () => {
    const r = runSeed(script, { ...OPERATOR, ...EXTRA[script], BASE_URL: REMOTE });
    expect(r.requests, r.out).toBe('');
    expect(r.out).toContain('is not a server on this machine');
    expect(r.status).toBe(1);
  });

  it('with SEED_ALLOW_REMOTE=1 it signs in there as the operator, with no built-in password', () => {
    const r = runSeed(script, { ...OPERATOR, ...EXTRA[script], BASE_URL: REMOTE, SEED_ALLOW_REMOTE: '1' });
    expect(r.requests.split('\n')[0]).toContain(`${REMOTE}/api/auth/`);
    expect(r.requests).toContain(OPERATOR.DEMO_EMAIL);
    expect(r.requests).not.toMatch(/demo123|Lumen2026!|jm\.smith@|lumenbiosciences/);
  });
});

describe('seed-ind-pyramid.sh', () => {
  it('names the project it writes into: no built-in project id', () => {
    const r = runSeed('seed-ind-pyramid.sh', { ...OPERATOR });
    expect(r.requests, r.out).toBe('');
    expect(r.out).toContain('DEMO_PROJECT_ID');
    expect(r.status).toBe(1);
  });
});

describe('seed-demo-oral-biologics.sh', () => {
  it('signs up a labelled, fictional demo organization', () => {
    const r = runSeed('seed-demo-oral-biologics.sh', { ...OPERATOR });
    const signup = r.requests.split('\n').find((l) => l.startsWith('STDIN ') && l.includes('companyName')) ?? '';
    expect(signup, r.requests).toContain('[Demo]');
    expect(signup).not.toMatch(/Lumen/);
  });

  it('names no real company, person, institution, contract or identifier', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'seed-demo-oral-biologics.sh'), 'utf8');
    const real = [
      'Lumen Biosciences', 'lumenbiosciences', 'LMN-', 'Seattle', '4142 23rd Avenue', '1959 NE Pacific',
      'University of Washington', 'UW Medical Center', 'UW Infectious', 'Virginia Mason', 'Fred Hutch',
      'Stanford', 'UCSF', 'BARDA', 'JPEO', 'FEI 3019876543', 'IND 157832', '[Digital Signature Applied]',
      'Anita Patel', 'Harper', 'Nina Kowalski', 'Michael Tran', 'Priya Sharma',
    ];
    expect(real.filter((t) => src.includes(t))).toEqual([]);
  });
});
