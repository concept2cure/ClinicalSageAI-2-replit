/**
 * currency-registry — time-resolved status.
 *
 * `mandatory_upcoming` is a claim about the future, and a stored one
 * goes wrong the moment its date arrives. Two facts in this registry
 * were in exactly that state: EU EUDAMED (effective 2026-05-28) and
 * PMDA eCTD v4.0 (2026-04-01), both still labelled "upcoming" months
 * later. The AnA tool that surfaces them instructs the model to report
 * the status verbatim, so it would have told a user EUDAMED was not yet
 * mandatory when it had been for two months — the exact failure this
 * module exists to prevent, turned on itself.
 *
 * The promotion is derived rather than stored, so it cannot re-break on
 * the next date to pass. `asOf` is always an explicit parameter, never a
 * wall-clock read, so the registry keeps its determinism guarantee.
 */

import { describe, it, expect } from 'vitest';
import {
  statusAsOf,
  factAsOf,
  findFacts,
  REGULATORY_FACTS,
  type RegulatoryFact,
} from '../currency-registry';

const upcoming: RegulatoryFact = {
  id: 'test-upcoming',
  topic: 'Test rule',
  jurisdiction: 'EU',
  status: 'mandatory_upcoming',
  effectiveDate: '2026-05-28',
  lastVerified: '2026-01-01',
  sourceUrl: 'https://example.invalid',
  appliesTo: ['mdx'],
  note: 'n/a',
  keywords: ['test'],
};

describe('statusAsOf', () => {
  it('keeps a future obligation upcoming before its date', () => {
    expect(statusAsOf(upcoming, '2026-05-27')).toBe('mandatory_upcoming');
  });

  it('promotes to in_force on the effective date itself', () => {
    /* The obligation lands on the date, not the day after. */
    expect(statusAsOf(upcoming, '2026-05-28')).toBe('in_force');
  });

  it('promotes to in_force after the effective date', () => {
    expect(statusAsOf(upcoming, '2026-07-26')).toBe('in_force');
  });

  it('never expires a vacated or rescinded rule', () => {
    /* A struck-down rule does not come back into force with time. */
    const void_: RegulatoryFact = { ...upcoming, status: 'void', effectiveDate: '2025-09-19' };
    expect(statusAsOf(void_, '2030-01-01')).toBe('void');
    const vacated: RegulatoryFact = { ...upcoming, status: 'vacated' };
    expect(statusAsOf(vacated, '2030-01-01')).toBe('vacated');
  });

  it('leaves in_force untouched', () => {
    const live: RegulatoryFact = { ...upcoming, status: 'in_force' };
    expect(statusAsOf(live, '2020-01-01')).toBe('in_force');
  });

  it('falls back to the stored status when asOf is unusable', () => {
    /* When "now" cannot be established, claiming a future obligation has
       landed is the more dangerous of the two errors. */
    expect(statusAsOf(upcoming, 'not-a-date')).toBe('mandatory_upcoming');
    expect(statusAsOf(upcoming, '')).toBe('mandatory_upcoming');
  });

  it('falls back when the fact itself has no usable effective date', () => {
    expect(statusAsOf({ ...upcoming, effectiveDate: 'TBD' }, '2030-01-01')).toBe(
      'mandatory_upcoming',
    );
  });

  it('compares dates lexicographically, immune to timezone drift', () => {
    /* Parsing to Date would shift the boundary by up to a day depending
       on the runtime zone; a boundary-day answer must not depend on
       where the server happens to run. */
    expect(statusAsOf({ ...upcoming, effectiveDate: '2026-01-01' }, '2026-01-01')).toBe('in_force');
    expect(statusAsOf({ ...upcoming, effectiveDate: '2026-12-31' }, '2026-12-30')).toBe(
      'mandatory_upcoming',
    );
  });
});

describe('factAsOf', () => {
  it('returns the same object when nothing changed', () => {
    const live: RegulatoryFact = { ...upcoming, status: 'in_force' };
    expect(factAsOf(live, '2030-01-01')).toBe(live);
  });

  it('returns a copy with the resolved status, leaving the original intact', () => {
    const resolved = factAsOf(upcoming, '2026-07-26');
    expect(resolved.status).toBe('in_force');
    expect(upcoming.status).toBe('mandatory_upcoming'); // registry not mutated
  });
});

describe('findFacts with asOf', () => {
  it('reports EUDAMED as in force today, not upcoming', () => {
    /* The concrete bug: EUDAMED's first four modules became mandatory on
       2026-05-28. */
    const [eudamed] = findFacts({ topic: 'EUDAMED', asOf: '2026-07-26' });
    expect(eudamed).toBeDefined();
    expect(eudamed.status).toBe('in_force');
  });

  it('reports PMDA eCTD v4.0 as in force today', () => {
    const [pmda] = findFacts({ topic: 'PMDA', asOf: '2026-07-26' });
    expect(pmda).toBeDefined();
    expect(pmda.status).toBe('in_force');
  });

  it('still reports genuinely future obligations as upcoming', () => {
    /* EU AI Act high-risk obligations apply from 2026-08-02. */
    const [aiAct] = findFacts({ topic: 'AI Act', asOf: '2026-07-26' });
    expect(aiAct).toBeDefined();
    expect(aiAct.status).toBe('mandatory_upcoming');
  });

  it('leaves the vacated LDT rule void regardless of date', () => {
    const [ldt] = findFacts({ topic: 'LDT', asOf: '2030-01-01' });
    expect(ldt.status).toBe('void');
  });

  it('returns stored statuses unchanged when asOf is omitted', () => {
    /* Back-compat: existing callers see exactly what they saw before. */
    const stored = findFacts({ topic: 'EUDAMED' })[0];
    const original = REGULATORY_FACTS.find((f) => f.id === 'eu-eudamed-mandatory')!;
    expect(stored.status).toBe(original.status);
  });

  it('does not mutate the shared registry across calls', () => {
    findFacts({ asOf: '2030-01-01' });
    const original = REGULATORY_FACTS.find((f) => f.id === 'eu-eudamed-mandatory')!;
    expect(original.status).toBe('mandatory_upcoming');
  });
});
