/**
 * The full-history secret scan (security plan P0-17, audit INF-22) runs on
 * every push, finds the credential shapes this repository actually leaked, and
 * lists what is already in history with a reason.
 *
 * Why these checks: gitleaks' default rules find none of the INF-22 credential
 * (a `postgresql://neondb_owner:npg_…@…neon.tech` URI and a bare `npg_`
 * password); run over every commit on the trunk they found 64 other things and
 * not it. `.gitleaks.toml` adds the two rules the working-tree gate
 * (scripts/ci/check-committed-secrets.mjs) already had. The first checks below
 * keep the two scanners from drifting apart. The gitleaks binary is not
 * available to this suite; CI's job runs it, and the evidence runs it for real:
 * docs/evidence/W2/2026-09-26-p0-17-history-secret-scan/.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const TOML = read('.gitleaks.toml');
const GATE = read('scripts/ci/check-committed-secrets.mjs');
const IGNORE = read('.gitleaksignore');

/** The body of one `[[rules]]` table, by id. */
function ruleBlock(id: string): string {
  const start = TOML.indexOf(`id = "${id}"`);
  expect(start, `.gitleaks.toml has no rule "${id}"`).toBeGreaterThan(-1);
  const next = TOML.indexOf('[[rules]]', start);
  return TOML.slice(start, next < 0 ? undefined : next);
}
const literals = (block: string) => [...block.matchAll(/'''([\s\S]*?)'''/g)].map((m) => m[1]);
/** A gitleaks (RE2) pattern as a JS RegExp: `(?i)` becomes the i flag. */
const re2 = (src: string) => (src.startsWith('(?i)') ? new RegExp(src.slice(4), 'i') : new RegExp(src));

/** A regex literal from the working-tree gate's source. */
function gateRegex(anchor: RegExp): string {
  const m = anchor.exec(GATE);
  expect(m, `check-committed-secrets.mjs no longer has ${anchor}`).not.toBeNull();
  return m![1].replace(/\\\//g, '/');
}

describe('.gitleaks.toml carries the working-tree gate’s rules for the credential this history leaked', () => {
  const uri = ruleBlock('c2c-connection-uri-password');
  const neon = ruleBlock('c2c-neon-password');
  const uriRegex = literals(uri)[0];
  const [placeholder, ...hosts] = literals(uri).slice(1);

  it('the same connection-URI and Neon patterns', () => {
    expect(uriRegex).toBe(gateRegex(/id: 'connection-uri-with-password',[\s\S]*?re: \/(.+?)\/g,/));
    expect(literals(neon)[0]).toBe(gateRegex(/id: 'neon-password', re: \/(.+?)\/g/));
  });

  it('the same placeholders and non-live hosts', () => {
    expect(placeholder).toBe(`(?i)${gateRegex(/const PLACEHOLDER =\s*\/(.+?)\/i;/)}`);
    const gateHosts = gateRegex(/const NON_LIVE_HOST =\s*\/(.+?)\/i;/);
    const alt = (src: string, lead: RegExp) => lead.exec(src)?.[1];
    expect(alt(hosts[0], /^\(\?i\)@\(\?:(.+)\)\$$/)).toBe(alt(gateHosts, /^\^\(\?:(.+?)\)\$\|/));
    expect(alt(hosts[1], /\\\.\(\?:(.+)\)\$$/)).toBe(alt(gateHosts, /\\\.\(\?:(.+)\)\$$/));
  });

  it('as patterns: the INF-22 shape is found; stand-ins and local hosts are not', () => {
    const found = (line: string) => {
      const m = new RegExp(uriRegex).exec(line);
      if (!m) return false;
      if (re2(placeholder).test(m[1])) return false;
      return !hosts.some((h) => re2(h).test(m[0]));
    };
    // Fabricated vectors: the host does not exist and the passwords were typed for this test.
    expect(found("'postgresql://neondb_owner:Q7vT2xN9pL4kR8sW@ep-fake-cloud-12345.us-east-1.aws.neon.tech/neondb'")).toBe(true); // ci-secret-scan-ignore: negative test vector
    expect(found("'postgresql://app:${DB_PASSWORD}@ep-fake-cloud-12345.us-east-1.aws.neon.tech/db'")).toBe(false);
    expect(found("'postgresql://app:Q7vT2xN9pL4kR8sW@localhost:5432/db'")).toBe(false); // ci-secret-scan-ignore: negative test vector
    expect(found("'postgresql://app:Q7vT2xN9pL4kR8sW@db.example.test/db'")).toBe(false); // ci-secret-scan-ignore: negative test vector
    expect(new RegExp(literals(neon)[0]).test('npg_Q7vT2xN9pL4kR8sW')).toBe(true); // ci-secret-scan-ignore: negative test vector
  });

  it('one escape hatch for both scanners', () => {
    const marker = /const IGNORE_MARKER = '([^']+)';/.exec(GATE)?.[1];
    expect(marker).toBe('ci-secret-scan-ignore');
    expect(TOML).toMatch(new RegExp(`regexTarget = "line"\\s*\\nregexes = \\['''${marker}'''\\]`));
  });
});

describe('CI scans every commit on the branch, and fails on a new finding', () => {
  type Step = { uses?: string; run?: string; with?: Record<string, unknown>; 'continue-on-error'?: unknown; if?: string };
  const wf = loadYaml(read('.github/workflows/ci.yml')) as { jobs: Record<string, { steps: Step[]; 'continue-on-error'?: unknown }> };
  const job = wf.jobs['secret-history-scan'];

  it('has the job, with the whole history checked out', () => {
    expect(job, 'ci.yml has no secret-history-scan job').toBeDefined();
    const checkout = job.steps.find((s) => (s.uses ?? '').startsWith('actions/checkout'));
    expect(checkout?.with?.['fetch-depth'], 'a shallow checkout scans one commit').toBe(0);
  });

  it('installs a pinned gitleaks and runs it blocking over HEAD with the repository config', () => {
    const runs = job.steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toMatch(/go install github\.com\/zricethezav\/gitleaks\/v8@v8\.\d+\.\d+\n/);
    const scan = job.steps.find((s) => /\bgitleaks git\b/.test(s.run ?? ''));
    expect(scan, 'no step runs gitleaks git').toBeDefined();
    expect(scan!.run).toMatch(/--config \.gitleaks\.toml/);
    expect(scan!.run).toMatch(/--log-opts="[^"]*\bHEAD"/);
    expect(scan!.run).not.toMatch(/--exit-code[= ]0/);
    expect(scan!.if, 'the scan step must not be conditional').toBeUndefined();
    expect(job['continue-on-error']).toBeUndefined();
    for (const s of job.steps) expect(s['continue-on-error'], 'no step may be advisory').toBeUndefined();
  });
});

describe('.gitleaksignore lists history, each finding with its status and reason', () => {
  const blocks = IGNORE.split(/\n\s*\n/).filter((b) => /^[0-9a-f]{40}:/m.test(b));

  it('every entry is a fingerprint in a block that says what it is', () => {
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      const lines = b.split('\n').filter(Boolean);
      for (const l of lines.filter((x) => !x.startsWith('#'))) {
        expect(l, 'an entry is commit:file:rule:line').toMatch(/^[0-9a-f]{40}:[^:\n]+:[a-z0-9-]+:\d+$/);
      }
      expect(b, `a block has no "# status:" line:\n${b.slice(0, 200)}`).toMatch(/^# status: (live|public by design|not a secret)/m);
      expect(b, `a block has no "# reason:" line:\n${b.slice(0, 200)}`).toMatch(/^# reason: \S/m);
    }
  });

  it('the INF-22 credential is listed as live, not as a false positive', () => {
    const inf22 = blocks.find((b) => b.includes('INF-22') && b.includes(':AUTH_CREDENTIALS_LOCKED.md:'));
    expect(inf22, 'the INF-22 findings are not in .gitleaksignore').toBeDefined();
    expect(inf22).toMatch(/^# status: live/m);
  });
});
