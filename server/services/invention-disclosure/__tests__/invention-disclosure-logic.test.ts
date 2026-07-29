/**
 * Unit tests for the pure Invention Disclosure / Bayh-Dole logic (Capability C2C-25).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateBayhDoleCompliance,
  evaluateDisclosureReadiness,
  AGENCY_DISCLOSURE_DAYS,
  ELECTION_OF_TITLE_DAYS,
} from '../invention-disclosure-logic';

describe('evaluateBayhDoleCompliance', () => {
  it('marks every obligation not applicable for a non-federal invention', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: false, disclosureDate: '2026-01-01', asOf: '2026-06-30' });
    expect(r.applicable).toBe(false);
    expect(r.deadlines.every((d) => d.status === 'not_applicable')).toBe(true);
    expect(r.hasOverdue).toBe(false);
  });

  it('computes the agency-disclosure and election due dates from the disclosure date', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-01-01', asOf: '2026-01-15' });
    const agency = r.deadlines.find((d) => d.obligation === 'agency_disclosure')!;
    const election = r.deadlines.find((d) => d.obligation === 'election_of_title')!;
    expect(agency.dueDate).toBe('2026-03-02'); // 2026-01-01 + 60 days
    expect(election.dueDate).toBe('2028-01-01'); // + 730 days (2 years)
    expect(agency.status).toBe('on_track');
  });

  it('flags an overdue agency disclosure when title was never elected', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-01-01', asOf: '2026-06-30' });
    const agency = r.deadlines.find((d) => d.obligation === 'agency_disclosure')!;
    expect(agency.status).toBe('overdue');
    expect(r.hasOverdue).toBe(true);
  });

  it('marks agency disclosure satisfied once title is elected', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-01-01', electionDate: '2026-02-01', asOf: '2026-06-30' });
    const agency = r.deadlines.find((d) => d.obligation === 'agency_disclosure')!;
    expect(agency.status).toBe('satisfied');
  });

  it('clocks patent filing only after election, due 1 year later', () => {
    const noElection = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-01-01', asOf: '2026-06-30' });
    expect(noElection.deadlines.find((d) => d.obligation === 'patent_filing')!.status).toBe('not_applicable');

    const elected = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-01-01', electionDate: '2026-02-01', asOf: '2026-06-30' });
    const filing = elected.deadlines.find((d) => d.obligation === 'patent_filing')!;
    expect(filing.dueDate).toBe('2027-02-01');
    expect(filing.status).toBe('on_track');
  });

  it('marks patent filing satisfied once filed', () => {
    const r = evaluateBayhDoleCompliance({ federalFunding: true, disclosureDate: '2026-01-01', electionDate: '2026-02-01', patentFiled: true, asOf: '2027-06-30' });
    expect(r.deadlines.find((d) => d.obligation === 'patent_filing')!.status).toBe('satisfied');
  });

  it('exposes the canonical interval constants', () => {
    expect(AGENCY_DISCLOSURE_DAYS).toBe(60);
    expect(ELECTION_OF_TITLE_DAYS).toBe(730);
  });
});

describe('evaluateDisclosureReadiness', () => {
  it('blocks a disclosure missing core fields', () => {
    const r = evaluateDisclosureReadiness({});
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it('requires a federal award number for a federally-funded invention', () => {
    const r = evaluateDisclosureReadiness({ title: 'Widget', inventors: 'Dr. A', fundingSource: 'NIH', disclosureDate: '2026-01-01', federalFunding: true });
    expect(r.readyToSubmit).toBe(false);
    expect(r.blockers.some((b) => /federal award/i.test(b))).toBe(true);
  });

  it('is ready with all core fields present (non-federal)', () => {
    const r = evaluateDisclosureReadiness({ title: 'Widget', inventors: 'Dr. A', fundingSource: 'Internal', disclosureDate: '2026-01-01', federalFunding: false });
    expect(r.readyToSubmit).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('is ready for a federally-funded invention with an award number', () => {
    const r = evaluateDisclosureReadiness({ title: 'Widget', inventors: 'Dr. A', fundingSource: 'NIH', disclosureDate: '2026-01-01', federalFunding: true, federalAward: '5R01CA000000' });
    expect(r.readyToSubmit).toBe(true);
  });
});
