/**
 * Regression tests for scripts/check-security-patterns.ts — the CI tenant-IDOR
 * gate (pr-checks.yml → `npm run check:security-patterns`).
 *
 * The gate historically saw only member-access and single-line destructuring of
 * organizationId / tenantId from req.body / req.query. A destructure spread
 * across multiple lines:
 *
 *     const {
 *       organizationId,
 *       studyId,
 *     } = req.body;
 *
 * slipped straight through — that exact shape is how a cluster of routes shipped
 * cross-tenant reads. These tests lock in the whole-file multi-line pass so the
 * blind spot can't reopen.
 *
 * The checker is exercised as a subprocess (it is a standalone script with a
 * process.exit()-ing main), pointed at throwaway fixture dirs so nothing lands
 * in the scanned tree.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'check-security-patterns.ts');

/**
 * Run the checker against `dir`; return { code, output }. The script resolves
 * its root arg via join(process.cwd(), argv[2]), so pass a cwd-relative path —
 * an absolute one would be concatenated onto cwd and point nowhere.
 */
function runChecker(dir: string): { code: number; output: string } {
  const relDir = relative(process.cwd(), dir);
  try {
    const stdout = execFileSync('npx', ['tsx', SCRIPT, relDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err: any) {
    // Non-zero exit → execFileSync throws; the checker prints violations to
    // stderr and exits 1.
    return {
      code: typeof err.status === 'number' ? err.status : -1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'sec-check-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function fixtureDir(name: string, file: string, contents: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), contents);
  return dir;
}

describe('check-security-patterns: multi-line destructuring', () => {
  it('flags organizationId destructured from req.body across multiple lines', () => {
    const dir = fixtureDir(
      'ml-body',
      'route.ts',
      [
        "router.post('/x', async (req, res) => {",
        '  const {',
        '    predictionId,',
        '    organizationId,',
        '    actualOutcome,',
        '  } = req.body;',
        '  return res.json({ predictionId, organizationId, actualOutcome });',
        '});',
        '',
      ].join('\n'),
    );
    const { code, output } = runChecker(dir);
    expect(code).toBe(1);
    expect(output).toMatch(/tenant-trust-body/);
  });

  it('flags tenantId destructured from req.query across multiple lines', () => {
    const dir = fixtureDir(
      'ml-query',
      'route.ts',
      [
        "router.get('/y', async (req, res) => {",
        '  const {',
        '    category,',
        '    tenantId,',
        '  } = req.query;',
        '  return res.json({ category, tenantId });',
        '});',
        '',
      ].join('\n'),
    );
    const { code, output } = runChecker(dir);
    expect(code).toBe(1);
    expect(output).toMatch(/tenant-trust-query/);
  });

  it('passes a handler that sources the org from the JWT helper', () => {
    const dir = fixtureDir(
      'clean',
      'route.ts',
      [
        "import { requireAuthedOrgId } from '../utils/authedOrgId';",
        "router.post('/z', async (req, res) => {",
        '  const guard = requireAuthedOrgId(req, res);',
        '  if (!guard.ok) return;',
        '  const {',
        '    predictionId,',
        '    actualOutcome,',
        '  } = req.body;',
        '  return res.json({ orgId: guard.orgId, predictionId, actualOutcome });',
        '});',
        '',
      ].join('\n'),
    );
    const { code } = runChecker(dir);
    expect(code).toBe(0);
  });

  it('honors a security-allow marker on the line preceding a multi-line destructure', () => {
    const dir = fixtureDir(
      'allowed',
      'route.ts',
      [
        "router.post('/admin', async (req, res) => {",
        '  // security-allow: admin acts on a target org, cross-checked below.',
        '  const {',
        '    organizationId,',
        '    amountCents,',
        '  } = req.body;',
        '  return res.json({ organizationId, amountCents });',
        '});',
        '',
      ].join('\n'),
    );
    const { code } = runChecker(dir);
    expect(code).toBe(0);
  });
});
