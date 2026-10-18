/**
 * A Bayh-Dole clock nobody can compute is reported as undetermined, not on track.
 *
 * What the code used to do (until 2026-10-15):
 *  - A federally funded disclosure with no inventor disclosure date returned the
 *    agency-disclosure and election-of-title obligations as 'on_track' with
 *    hasOverdue false, although the date that starts both 37 CFR 401.14(c)
 *    clocks was unknown.
 *  - federal_funding was `NOT NULL DEFAULT false` and the service wrote and read
 *    it as `=== true`, so a disclosure whose funding nobody had checked came back
 *    applicable:false with every obligation 'not_applicable' — a federally funded
 *    invention could read as not subject to Bayh-Dole.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));

import { evaluateBayhDoleCompliance, evaluateDisclosureReadiness } from '../invention-disclosure-logic';
import { createDisclosureTx, getCompliance, getReadiness } from '../invention-disclosure-service';

const byObligation = (r: ReturnType<typeof evaluateBayhDoleCompliance>, o: string) => r.deadlines.find((d) => d.obligation === o)!;

describe('evaluateBayhDoleCompliance — a clock without its start date', () => {
  it('reports both disclosure-driven obligations undetermined, naming the missing date, and hasOverdue null', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: null, asOf: '2026-10-15' });
    expect(r.applicable).toBe(true);
    for (const o of ['agency_disclosure', 'election_of_title']) {
      const d = byObligation(r, o);
      expect(d.status).toBe('undetermined');
      expect(d.dueDate).toBeNull();
      expect(d.daysRemaining).toBeNull();
      expect(d.reason).toMatch(/disclosure date/i);
    }
    expect(r.hasOverdue).toBeNull();
  });

  it('still reports an overdue obligation it can compute while another is undetermined', () => {
    // Election recorded long ago, nothing filed: the filing clock runs from the election.
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: null, electionDate: '2024-01-01', asOf: '2026-10-15' });
    expect(byObligation(r, 'patent_filing').status).toBe('overdue');
    expect(r.hasOverdue).toBe(true);
  });

  it('treats a recorded election as satisfying both disclosure-driven obligations even without the disclosure date', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: null, electionDate: '2026-09-01', asOf: '2026-10-15' });
    expect(byObligation(r, 'agency_disclosure').status).toBe('satisfied');
    expect(byObligation(r, 'election_of_title').status).toBe('satisfied');
    expect(r.hasOverdue).toBe(false);
  });

  it('is false only when every obligation was evaluated and none is overdue', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-10-01', asOf: '2026-10-15' });
    expect(r.deadlines.every((d) => d.status !== 'undetermined')).toBe(true);
    expect(r.hasOverdue).toBe(false);
  });
});

describe('evaluateBayhDoleCompliance — funding not yet determined', () => {
  it('reports applicability undetermined, not "not applicable"', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: null, disclosureDate: '2026-01-01', asOf: '2026-10-15' });
    expect(r.applicable).toBe('undetermined');
    expect(r.deadlines.map((d) => d.status)).toEqual(['undetermined', 'undetermined', 'undetermined']);
    expect(r.deadlines.every((d) => /federally funded/i.test(d.reason ?? ''))).toBe(true);
    expect(r.hasOverdue).toBeNull();
  });

  it('keeps a recorded "not federally funded" as not applicable', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: false, disclosureDate: '2026-01-01', asOf: '2026-10-15' });
    expect(r.applicable).toBe(false);
    expect(r.deadlines.every((d) => d.status === 'not_applicable')).toBe(true);
    expect(r.hasOverdue).toBe(false);
  });
});

describe('evaluateDisclosureReadiness — funding not recorded', () => {
  it('says so as a finding without inventing an answer', () => {
    const r = evaluateDisclosureReadiness({ title: 'Widget', inventors: 'Dr. A', fundingSource: 'NIH', disclosureDate: '2026-01-01', federalFunding: null });
    expect(r.findings.some((f) => f.severity === 'warning' && /federally funded/i.test(f.message))).toBe(true);
  });
});

describe('invention-disclosure-service — the undetermined funding state survives the round trip', () => {
  beforeEach(() => poolQuery.mockReset());

  it('createDisclosureTx stores NULL when the caller did not say whether the invention was federally funded', async () => {
    const params: unknown[][] = [];
    const client = { query: async (_sql: string, p?: unknown[]) => { params.push(p ?? []); return { rows: [{ id: 7 }] }; } };
    await createDisclosureTx(client, 1, 2, { title: 'Widget' });
    expect(params[0][5]).toBeNull();
    await createDisclosureTx(client, 1, 2, { title: 'Widget', federalFunding: false });
    expect(params[1][5]).toBe(false);
  });

  it('getCompliance reads a NULL federal_funding as undetermined, not as "not federally funded"', async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: 7, federal_funding: null, disclosure_date: '2026-01-01', election_date: null, status: 'submitted' }] });
    const r = await getCompliance(1, 7, '2026-10-15');
    expect(r.applicable).toBe('undetermined');
  });

  // Found while fixing the above (2026-10-15): node-postgres returns a DATE as a Date
  // at local midnight, and String(date).slice(0, 10) is "Thu Jan 01" — which
  // Date.parse reads as 2001-01-01, so every recorded clock ran from 2001 (overdue).
  it('getCompliance runs the clock from the recorded DATE as the driver returns it', async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: 7, federal_funding: true, disclosure_date: new Date(2026, 0, 1), election_date: null, status: 'submitted' }] });
    const r = await getCompliance(1, 7, '2026-01-15');
    expect(r.deadlines.find((d) => d.obligation === 'agency_disclosure')).toMatchObject({ dueDate: '2026-03-02', status: 'on_track' });
    expect(r.hasOverdue).toBe(false);
  });

  it('getReadiness passes the NULL through so the readiness result names it', async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: 7, title: 'Widget', inventors: 'Dr. A', funding_source: 'NIH', federal_funding: null, federal_award: null, disclosure_date: '2026-01-01' }] });
    const r = await getReadiness(1, 7);
    expect(r.findings.some((f) => /federally funded/i.test(f.message))).toBe(true);
  });
});
