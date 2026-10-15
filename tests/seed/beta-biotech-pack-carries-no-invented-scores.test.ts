/**
 * The beta biotech fixture pack carries no readiness, completeness or
 * export verdict. 2026-10-15.
 *
 * scripts/seed-beta-biotech-workspace.mjs writes a JSON pack "to preload API
 * fixtures or localStorage in beta demos". Each project carried
 * `readinessScore` (87, 62, 34, 71) and `exportReady` (true for the IND), and
 * the NDA's modules a `completeness` percentage — figures in the shape the
 * product computes, which the script never computed: it creates nothing and
 * measures nothing, it only writes the file. Preloaded, they read as the
 * platform's own verdicts.
 *
 * The script is run here, for real, in a temporary directory.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(__dirname, '../../scripts/seed-beta-biotech-workspace.mjs');
const work = mkdtempSync(path.join(tmpdir(), 'beta-seed-'));

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the beta biotech fixture pack', () => {
  it('states no score, completeness or export readiness the script did not compute', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: work, encoding: 'utf8', timeout: 60_000 });
    expect(r.status, r.stderr).toBe(0);
    const pack = JSON.parse(readFileSync(path.join(work, 'test-results', 'beta-seed', 'seeded-biotech-workspace.json'), 'utf8'));
    expect(pack.seededProjects.length).toBeGreaterThan(0);
    const verdicts: string[] = [];
    const walk = (v: unknown, at: string) => {
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (/score|ready|completeness/i.test(k)) verdicts.push(`${at}.${k} = ${JSON.stringify(x)}`);
          walk(x, `${at}.${k}`);
        }
      }
    };
    walk(pack.seededProjects, 'seededProjects');
    expect(verdicts, verdicts.join('\n')).toEqual([]);
  }, 90_000);
});
