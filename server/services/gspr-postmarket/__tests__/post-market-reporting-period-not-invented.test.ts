/**
 * A report-style post-market document authored without a reporting period is
 * stored with no period, and the gate says the period is not declared.
 *
 * Before (to 2026-10-15): authorPostMarketDocument filled a missing period with
 * a trailing 12 months ending today, disclosed only as prose appended to
 * `summary`. The validators (PMSR-001, PMCFE-001, PSUR-001, PMPFE-001) check
 * that both dates are present, so the invented window satisfied the one finding
 * that exists to require a declared period.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));

vi.mock('../../../db', () => {
  // listProgramDocuments ends in orderBy(); createDocument in insert().values().returning().
  const select: any = {
    from: () => select,
    where: () => select,
    orderBy: () => Promise.resolve([]),
    limit: () => Promise.resolve([]),
  };
  return {
    db: {
      select: () => select,
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          returning: async () => {
            h.inserted.push(v);
            return [{ id: `doc-${h.inserted.length}`, locked: false, ...v }];
          },
        }),
      }),
    },
  };
});

import { authorPostMarketDocument } from '../post-market-authoring';

const base = {
  organizationId: 7,
  programId: 'aaaaaaaa-0000-4000-8000-000000000001',
  createdBy: 'u-7',
  deviceName: 'Acme Pump',
};

const REPORT_TYPES = [
  ['pms_report', 'PMSR-001', 'MDR'],
  ['pmcf_evaluation', 'PMCFE-001', 'MDR'],
  ['psur', 'PSUR-001', 'MDR'],
  ['pmpf_evaluation', 'PMPFE-001', 'IVDR'],
] as const;

const codes = (v: { findings: Array<{ code: string }> }) => v.findings.map((f) => f.code);

beforeEach(() => {
  h.inserted.length = 0;
});

describe('post-market authoring never invents a reporting period', () => {
  it.each(REPORT_TYPES)('%s without dates is stored with no period and fails %s', async (documentType, code, regulation) => {
    const { document, validation } = await authorPostMarketDocument({ ...base, documentType, regulation });
    expect(h.inserted[0].reportingPeriodStart).toBeNull();
    expect(h.inserted[0].reportingPeriodEnd).toBeNull();
    expect(document.summary).not.toMatch(/trailing 12 months/);
    expect(document.summary).toMatch(/reporting period not declared/i);
    expect(codes(validation)).toContain(code);
    expect(validation.passesGate).toBe(false);
  });

  it('a start date alone is kept; the missing end stays missing, not "today"', async () => {
    const start = new Date('2025-01-01T00:00:00Z');
    const { validation } = await authorPostMarketDocument({
      ...base,
      documentType: 'psur',
      regulation: 'MDR',
      reportingPeriodStart: start,
    });
    expect(h.inserted[0].reportingPeriodStart).toEqual(start);
    expect(h.inserted[0].reportingPeriodEnd).toBeNull();
    expect(codes(validation)).toContain('PSUR-001');
  });

  it('a declared period is stored as declared and satisfies the period finding', async () => {
    const start = new Date('2025-01-01T00:00:00Z');
    const end = new Date('2025-12-31T00:00:00Z');
    const { document, validation } = await authorPostMarketDocument({
      ...base,
      documentType: 'pms_report',
      regulation: 'MDR',
      reportingPeriodStart: start,
      reportingPeriodEnd: end,
    });
    expect(h.inserted[0]).toMatchObject({ reportingPeriodStart: start, reportingPeriodEnd: end });
    expect(document.summary).not.toMatch(/not declared/i);
    expect(codes(validation)).not.toContain('PMSR-001');
  });

  it('a plan, which reports on no period, is stored without one and is not asked for one', async () => {
    const { document } = await authorPostMarketDocument({ ...base, documentType: 'pms_plan', regulation: 'MDR' });
    expect(h.inserted[0].reportingPeriodStart).toBeNull();
    expect(h.inserted[0].reportingPeriodEnd).toBeNull();
    expect(document.summary).not.toMatch(/reporting period/i);
  });
});
