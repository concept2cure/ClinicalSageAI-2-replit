/**
 * GCP / informed-consent advisor — unit tests. Deterministic; verifies GCP
 * domain resolution, consent required-element detection + scoring, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseGcp, reviewInformedConsent, listGcpDomains } from '../gcp-consent';

describe('adviseGcp', () => {
  it('resolves the sponsor domain via alias (rbm) with citation', () => {
    const r = adviseGcp('rbm');
    expect(r.resolved.domain).toBe('sponsor');
    expect(r.brief).toContain('ICH E6(R2) §5');
    expect(r.brief.toLowerCase()).toContain('risk-based');
  });

  it('returns all domains when none specified', () => {
    const r = adviseGcp();
    expect(r.domain).toBeNull();
    expect(r.brief).toContain('Sponsor responsibilities');
    expect(r.brief).toContain('Investigator responsibilities');
  });
});

describe('reviewInformedConsent', () => {
  it('flags missing required elements and scores a sparse consent', () => {
    const r = reviewInformedConsent('This document describes a research study about your condition.');
    expect(r.completenessScore).toBeLessThan(100);
    const missingIds = r.missingRequired.map(m => m.id);
    expect(missingIds).toContain('voluntary');
    expect(missingIds).toContain('contacts');
    // "research" cue detected
    expect(r.present.map(p => p.id)).toContain('research_statement');
  });

  it('scores a complete consent at 100% required', () => {
    const text = `
      This research study has a purpose and expected duration of 12 weeks.
      Procedures include blood samples; some are experimental and randomized.
      Risks and side effects are described; expected benefits may help others.
      Alternative treatments are available. Your records are confidential.
      If you suffer an injury, medical treatment and compensation are described.
      Contact the IRB / ethics committee with questions about your rights.
      Participation is voluntary; you may withdraw at any time with no penalty.
    `;
    expect(r2(text)).toBe(100);
  });

  function r2(t: string) {
    return reviewInformedConsent(t).completenessScore;
  }

  it('lists the catalog of domains and consent elements', () => {
    const cat = listGcpDomains();
    expect(cat.domains.map(d => d.id)).toEqual(expect.arrayContaining(['principles', 'sponsor', 'investigator', 'irb_ec']));
    expect(cat.consentElements.some(e => e.id === 'voluntary' && e.required)).toBe(true);
  });
});
