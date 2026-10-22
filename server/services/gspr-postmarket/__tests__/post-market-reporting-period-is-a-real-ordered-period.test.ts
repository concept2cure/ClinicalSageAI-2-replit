/**
 * The reporting period authorPostMarketDocument stores is the one the caller
 * declared: real calendar dates, the start before the end. Anything else is
 * refused (PM_BAD_INPUT, naming the field) before anything is written.
 *
 * Before (to 2026-10-15): the engine stored whatever Dates it was handed, so a
 * start after the end became the document's period; and both callers (the
 * REST generate route and the AnA post_market.document.create tool) parsed the
 * dates themselves, turning an unparseable value into "not declared" and
 * letting `new Date` roll 2025-02-30 over to 2 March.
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
  createdBy: '7',
  deviceName: 'Acme Pump',
  documentType: 'pms_report' as const,
  regulation: 'MDR' as const,
};

beforeEach(() => {
  h.inserted.length = 0;
});

describe('a reporting period is real and ordered, or refused', () => {
  it.each([
    ['start after end', '2025-12-31', '2025-01-01'],
    ['start equal to end', '2025-06-30', '2025-06-30'],
    ['Date objects, start after end', new Date('2025-12-31T00:00:00Z'), new Date('2025-01-01T00:00:00Z')],
  ])('%s is refused, naming both fields, and nothing is written', async (_label, start, end) => {
    await expect(
      authorPostMarketDocument({ ...base, reportingPeriodStart: start, reportingPeriodEnd: end }),
    ).rejects.toMatchObject({
      code: 'PM_BAD_INPUT',
      message: expect.stringMatching(/reportingPeriodStart.*before.*reportingPeriodEnd/),
    });
    expect(h.inserted).toHaveLength(0);
  });

  it.each([
    ['reportingPeriodStart', 'not-a-date'],
    ['reportingPeriodEnd', '2025-02-30'],
    ['reportingPeriodEnd', '2025-13-01'],
    ['reportingPeriodEnd', '2025'],
    ['reportingPeriodStart', 'Jan 5 2025'],
    ['reportingPeriodStart', 20250101],
    ['reportingPeriodEnd', true],
    ['reportingPeriodEnd', new Date('nonsense')],
  ])('%s = %j is refused, naming the field, and nothing is written', async (field, value) => {
    await expect(authorPostMarketDocument({ ...base, [field]: value })).rejects.toMatchObject({
      code: 'PM_BAD_INPUT',
      message: expect.stringContaining(field),
    });
    expect(h.inserted).toHaveLength(0);
  });

  it('an ISO date, or date-time, naming a real day is stored as that instant', async () => {
    await authorPostMarketDocument({
      ...base,
      reportingPeriodStart: '2024-02-29',
      reportingPeriodEnd: '2025-02-28T23:59:59.999+01:00',
    });
    expect(h.inserted[0]).toMatchObject({
      reportingPeriodStart: new Date('2024-02-29T00:00:00Z'),
      reportingPeriodEnd: new Date('2025-02-28T22:59:59.999Z'),
    });
  });

  it.each([undefined, null, '', '   '])('%j is "not declared": stored null, never refused or invented', async (value) => {
    const { document } = await authorPostMarketDocument({ ...base, reportingPeriodStart: value, reportingPeriodEnd: value });
    expect(h.inserted[0]).toMatchObject({ reportingPeriodStart: null, reportingPeriodEnd: null });
    expect(document.summary).toMatch(/reporting period not declared/i);
  });
});
