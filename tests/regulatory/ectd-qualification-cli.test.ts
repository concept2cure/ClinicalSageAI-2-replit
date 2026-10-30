import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
let work: string;
let result: { code: number | null; stdout: string; stderr: string };
let summary: { passed: boolean; status?: string; availableChecksPassed?: boolean; blockers?: string[]; reports: Array<{ region: string; version: string; passed: boolean; status?: string }> };

beforeAll(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-qualification-cli-'));
  const requestedReports = path.join(work, 'requested-reports');
  const args = ['--import', path.join(root, 'node_modules/tsx/dist/loader.mjs'),
    path.join(root, 'scripts/ectd/qualify-ectd.ts'), '--region', 'fda', '--no-v4',
    '--report-dir', requestedReports, '--work-dir', path.join(work, 'packages')];
  result = await new Promise(resolve => {
    execFile(process.execPath, args, { cwd: work, timeout: 55_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json'),
        ECTD_DTD_DIR: path.join(work, 'empty-dtd'), ECTD_SCHEMA_DIR: path.join(work, 'empty-schema'),
        EVALIDATOR_BINARY: '', EVALIDATOR_ENDPOINT: '', EVALIDATOR_PROFILE_FDA: '',
        EVALIDATOR_USE_FDA_CRITERIA_FALLBACK: '', ECTD_REQUIRE_DTD: '', ECTD_REQUIRE_RPS_SCHEMA: '' },
    }, (error, stdout, stderr) => resolve({
      code: error ? typeof error.code === 'number' ? error.code : null : 0, stdout, stderr,
    }));
  });
  // An import/runtime failure is not evidence that incomplete qualification was refused.
  expect(result.stdout, result.stderr).toContain('eCTD qualification');
  const reportFile = await fs.access(path.join(requestedReports, 'summary.json')).then(() => path.join(requestedReports, 'summary.json'))
    .catch(() => path.join(work, 'qualification-reports', 'summary.json'));
  summary = JSON.parse(await fs.readFile(reportFile, 'utf8'));
}, 60_000);
afterAll(async () => { if (work) await fs.rm(work, { recursive: true, force: true }); });

describe('actual qualification command with explicitly missing prerequisites', () => {
  it('exits nonzero after an executed but incomplete local run', () => {
    expect(result.code).toBe(1);
    expect(summary.passed).toBe(false);
    expect(summary.status).toBe('blocked');
  });

  it('prints BLOCKED and actionable reasons rather than an overall pass', () => {
    expect(result.stdout).toContain('[BLOCKED]');
    expect(result.stdout).toContain('Overall: BLOCKED');
    expect(result.stdout).toMatch(/DTD|schema/i);
    expect(result.stdout).toMatch(/external|validator/i);
    expect(result.stdout).not.toContain('Overall: PASS');
  });

  it('runs only the requested existing API targets and writes to the requested output', async () => {
    expect(summary.reports.map(report => `${report.version}-${report.region}`)).toEqual(['v3.2.2-fda']);
    await expect(fs.access(path.join(work, 'requested-reports/summary.json'))).resolves.toBeUndefined();
  });
});
