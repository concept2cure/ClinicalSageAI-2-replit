/**
 * The MDX health probe says what it could not read, and recommends no
 * invented data.
 *
 * A probe query that failed reported the table "not provisioned — apply the
 * relevant migration" and every pathway as 0 programs; and an empty pathway
 * raised a warning to "run scripts/seed-mdx-beta.mjs to seed all pathways
 * before paying-client demo" — invented programs, Q-Submissions and FDA
 * feedback, into whatever database the deployment uses.
 *
 * The database is the only thing replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));

import { probeMdxHealth } from '../mdx-health.service';

const refused = () => Object.assign(new Error('permission denied'), { code: '42501' });

beforeEach(() => {
  H.query.mockReset();
});

describe('probeMdxHealth', () => {
  it('reports a table it could not probe as unknown, not as not provisioned', async () => {
    H.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/to_regclass/.test(sql)) {
        if (params?.[0] === 'public.q_submissions') throw refused();
        return { rows: [{ exists: true }] };
      }
      if (/COUNT\(\*\)::int AS n FROM/.test(sql)) return { rows: [{ n: 1 }] };
      return { rows: [{ pathway: '510k', n: 2 }] };
    });
    const report = await probeMdxHealth();
    expect(report.tables.find((t) => t.name === 'public.q_submissions')).toMatchObject({ exists: null, rowCount: null });
    expect(report.warnings.some((w) => /q_submissions is not provisioned/.test(w))).toBe(false);
    expect(report.warnings).toContain(
      'Table public.q_submissions could not be probed — whether it is provisioned is not known. Affects: PreSubManager list + KPIs.');
    expect(report.schema).toMatchObject({ status: 'unverified', requiredTablesPresent: false });
    expect(report.dependencies.database.status).toBe('fail');
    expect(report.readiness).not.toBe('ready');
  });

  it('reports pathway counts it could not read as unknown, not zero', async () => {
    H.query.mockImplementation(async (sql: string) => {
      if (/regulatory_path AS pathway/.test(sql)) throw refused();
      if (/to_regclass/.test(sql)) return { rows: [{ exists: true }] };
      return { rows: [{ n: 0 }] };
    });
    const report = await probeMdxHealth();
    expect(report.pathwayCoverage.length).toBeGreaterThan(0);
    for (const p of report.pathwayCoverage) expect(p).toMatchObject({ hasPrograms: null, programCount: null });
    expect(report.warnings).toContain('Pathway coverage could not be read — the number of programs per pathway is not known.');
  });

  it('treats a pathway no program uses as a fact, and recommends no seed', async () => {
    H.query.mockImplementation(async (sql: string) => {
      if (/to_regclass/.test(sql)) return { rows: [{ exists: true }] };
      if (/regulatory_path AS pathway/.test(sql)) return { rows: [] };
      return { rows: [{ n: 0 }] };
    });
    const report = await probeMdxHealth();
    for (const p of report.pathwayCoverage) expect(p).toMatchObject({ hasPrograms: false, programCount: 0 });
    expect(report.warnings.filter((w) => /seed|pathway/i.test(w))).toEqual([]);
    expect(report.schema).toMatchObject({ status: 'pass', requiredTablesPresent: true });
  });
});
