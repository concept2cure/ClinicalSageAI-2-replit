/**
 * Unit tests for the pure Research Agreements (MTA/DUA/CDA) logic (Capability C2C-27).
 */

import { describe, it, expect } from 'vitest';
import { evaluateAgreementReadiness, summarizeAgreementPortfolio, type AgreementView, type AgreementPortfolioRow } from '../research-agreements-logic';

function agreement(over: Partial<AgreementPortfolioRow> = {}): AgreementPortfolioRow {
  return {
    agreementType: 'mta',
    direction: 'incoming',
    title: 'Cell line transfer',
    ourParty: 'Our University',
    otherParty: 'Partner Institute',
    materialOrDataDescription: 'HEK293 cell line',
    containsPhi: false,
    containsHumanData: false,
    isDeidentified: false,
    limitedDataSet: false,
    publicationRights: true,
    protocolDocumentId: null,
    expirationDate: null,
    ...over,
  };
}

describe('evaluateAgreementReadiness', () => {
  it('blocks an agreement missing core fields', () => {
    const r = evaluateAgreementReadiness({ agreementType: 'mta' });
    expect(r.readyToExecute).toBe(false);
    expect(r.blockers.length).toBeGreaterThanOrEqual(3);
  });

  it('blocks PHI that is neither de-identified nor a limited data set', () => {
    const r = evaluateAgreementReadiness(agreement({ agreementType: 'dua', containsPhi: true }));
    expect(r.readyToExecute).toBe(false);
    expect(r.blockers.some((b) => /PHI/i.test(b))).toBe(true);
  });

  it('blocks a limited data set with PHI not on a DUA', () => {
    const r = evaluateAgreementReadiness(agreement({ agreementType: 'mta', containsPhi: true, limitedDataSet: true }));
    expect(r.readyToExecute).toBe(false);
    expect(r.blockers.some((b) => /Data Use Agreement|DUA/i.test(b))).toBe(true);
  });

  it('allows a DUA with PHI as a limited data set', () => {
    const r = evaluateAgreementReadiness(agreement({ agreementType: 'dua', containsPhi: true, limitedDataSet: true, materialOrDataDescription: 'Limited data set' }));
    expect(r.readyToExecute).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('allows PHI that is fully de-identified under any agreement', () => {
    const r = evaluateAgreementReadiness(agreement({ containsPhi: true, isDeidentified: true }));
    expect(r.readyToExecute).toBe(true);
  });

  it('warns when human-subjects data has no protocol link', () => {
    const r = evaluateAgreementReadiness(agreement({ containsHumanData: true, protocolDocumentId: null }));
    expect(r.readyToExecute).toBe(true); // warning, not blocker
    expect(r.findings.some((f) => f.severity === 'warning' && /protocol/i.test(f.message))).toBe(true);
  });

  it('warns when outgoing transfer retains no publication rights', () => {
    const r = evaluateAgreementReadiness(agreement({ direction: 'outgoing', publicationRights: false }));
    expect(r.findings.some((f) => /publication/i.test(f.message))).toBe(true);
  });

  it('is ready for a clean MTA', () => {
    const r = evaluateAgreementReadiness(agreement());
    expect(r.readyToExecute).toBe(true);
    expect(r.findings).toHaveLength(0);
  });
});

describe('summarizeAgreementPortfolio', () => {
  it('counts by type/status, PHI, and expiry buckets', () => {
    const s = summarizeAgreementPortfolio([
      agreement({ agreementType: 'mta', status: 'executed', expirationDate: '2026-08-01' }),  // expiring soon vs 2026-06-30
      agreement({ agreementType: 'dua', status: 'executed', containsPhi: true, expirationDate: '2026-01-01' }), // expired
      agreement({ agreementType: 'dua', status: 'draft', expirationDate: '2030-01-01' }),
    ], '2026-06-30');
    expect(s.total).toBe(3);
    expect(s.byType.dua).toBe(2);
    expect(s.byStatus.executed).toBe(2);
    expect(s.phiCount).toBe(1);
    expect(s.expiringSoon).toBe(1);
    expect(s.expired).toBe(1);
  });
});
