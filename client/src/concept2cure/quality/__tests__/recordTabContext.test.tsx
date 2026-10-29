// @vitest-environment jsdom
/**
 * What AnA is told on a Quality record tab is the register as read: its rows
 * and counts when read, "still loading" while it loads, and a failure (never an
 * empty register) when the read failed.
 */
import { describe, it, expect } from 'vitest';
import { recordTabContext } from '../App';

const ready = { tab: 'capa', title: 'CAPA', noun: ['CAPA', 'CAPAs'] as [string, string], state: 'ready' as const, count: 2,
  counts: [{ label: 'Open CAPAs', val: '2' }], records: [{ capa: 'CAPA-007' }, { capa: 'CAPA-008' }], truncated: false };

describe('Quality record tab context for AnA', () => {
  it('names the rows and counts read', () => {
    const c = recordTabContext('capa', ready);
    expect(c.summary).toBe('The user is on the CAPA tab of Quality. The register holds 2 CAPAs (Open CAPAs: 2).');
    expect(c.facts).toMatchObject({ recordCount: 2, records: ready.records });
  });

  it("never reads a failed register as empty, and never borrows another tab's rows", () => {
    expect(recordTabContext('capa', { ...ready, state: 'failed', count: null, records: [] }).summary).toMatch(/could not be read — a failure, not an empty register/);
    expect(recordTabContext('suppliers', ready).summary).toMatch(/still loading/);
    expect(recordTabContext('capa', null).facts).toEqual({ tab: 'capa' });
  });
});
