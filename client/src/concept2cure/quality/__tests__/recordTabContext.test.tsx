// @vitest-environment jsdom
/**
 * What AnA is told on a Quality record tab is the register as read: its rows
 * and counts when read, "still loading" while it loads, and a failure (never an
 * empty register) when the read failed.
 */
import { describe, it, expect } from 'vitest';
import { recordTabContext } from '../App';

const ready = { tab: 'capa', title: 'CAPA', noun: ['CAPA', 'CAPAs'] as [string, string], state: 'ready' as const, count: 2,
  counts: [{ label: 'Open CAPAs', val: '2', detail: '3 closed' }], records: [{ capa: 'CAPA-007' }, { capa: 'CAPA-008' }], truncated: false,
  partial: false, about: 'Corrective and preventive actions.', scope: null };

describe('Quality record tab context for AnA', () => {
  it('names the rows and counts read', () => {
    const c = recordTabContext('capa', ready);
    expect(c.summary).toBe('The user is on the CAPA tab of Quality. The register holds 2 CAPAs (Open CAPAs: 2 (3 closed)).');
    expect(c.facts).toMatchObject({ recordCount: 2, records: ready.records, partial: false, about: 'Corrective and preventive actions.' });
  });

  // C14: whose rows these are, while a project is open.
  it("says whose rows these are while a project is open", () => {
    expect(recordTabContext('capa', { ...ready, scope: { project: 'C11 · Gasket programme' } }).summary)
      .toBe('The user is on the CAPA tab of Quality. The register holds 2 CAPAs filed under the project C11 · Gasket programme (Open CAPAs: 2 (3 closed)).');
    expect(recordTabContext('capa', { ...ready, scope: { organisationWide: true } }).summary)
      .toMatch(/holds 2 CAPAs of the whole organisation \(this register is not kept per project\)/);
  });

  // C12: at the server's cap the read is the most recent rows; "holds 100" would claim records nobody read.
  it('says a capped read is the most recent rows, never the whole register', () => {
    const c = recordTabContext('capa', { ...ready, count: 100, partial: true });
    expect(c.summary).toMatch(/stopped at the server's cap: it shows the 100 most recent CAPAs, and there may be more/);
    expect(c.summary).not.toMatch(/holds 100/);
    expect(c.facts).toMatchObject({ partial: true });
  });

  it("never reads a failed register as empty, and never borrows another tab's rows", () => {
    expect(recordTabContext('capa', { ...ready, state: 'failed', count: null, records: [] }).summary).toMatch(/could not be read — a failure, not an empty register/);
    expect(recordTabContext('suppliers', ready).summary).toMatch(/still loading/);
    expect(recordTabContext('capa', null).facts).toEqual({ tab: 'capa' });
  });
});
