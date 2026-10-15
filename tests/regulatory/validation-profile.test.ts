import { describe, it, expect } from 'vitest';
import { resolveValidationProfile } from '../../shared/regulatory/validation-profile';
import { resolveWorkspaceConfig } from '../../shared/regulatory/workspace-config';

describe('validation-profile — grounded in (segment, evidence model)', () => {
  it('NDA → pharma-clinical_efficacy with the efficacy/quality claims', () => {
    const p = resolveValidationProfile('NDA');
    expect(p.grounded).toBe(true);
    expect(p.profileId).toBe('pharma-clinical_efficacy');
    expect(p.dossierStandard).toBe('eCTD');
    const claimIds = p.requiredClaims.map((c) => c.id);
    expect(claimIds).toContain('efficacy');
    expect(claimIds).toContain('quality');
  });

  it('BLA gets a DIFFERENT profile than NDA (biologic, not chemistry)', () => {
    const nda = resolveValidationProfile('NDA');
    const bla = resolveValidationProfile('BLA');
    expect(bla.profileId).toBe('biotech-clinical_efficacy');
    expect(bla.profileId).not.toBe(nda.profileId); // the old per-id string conflated these
  });

  it('510(k) → device-equivalence with the substantial-equivalence claim', () => {
    const p = resolveValidationProfile('510k');
    expect(p.profileId).toBe('device-equivalence');
    expect(p.requiredClaims.map((c) => c.id)).toContain('substantial_equivalence');
  });

  it('a generic (ANDA) uses the sameness profile, not the NDA profile', () => {
    const p = resolveValidationProfile('ANDA');
    expect(p.evidenceModel).toBe('sameness');
    expect(p.profileId).toBe('pharma-sameness');
  });

  it('carries the legacy decorative id for migration reference', () => {
    const p = resolveValidationProfile('NDA');
    expect(p.legacyProfileId).toBe('us_nda_validation');
  });

  it('falls back to a generic, ungrounded profile for non-product selections', () => {
    const p = resolveValidationProfile('not-a-real-thing');
    expect(p.grounded).toBe(false);
    expect(p.profileId).toBe('generic-document');
    expect(p.requiredClaims).toHaveLength(0);
  });
});

describe('grounding fixes (#940)', () => {
  it('EU MAA / CTA are segment-grounded, not the generic-document fallback', () => {
    const maa = resolveValidationProfile('EU_MAA');
    expect(maa.grounded).toBe(true);
    expect(maa.profileId).toBe('pharma-clinical_efficacy');
    const cta = resolveValidationProfile('EU_CTA');
    expect(cta.grounded).toBe(true);
    expect(cta.profileId).not.toBe('generic-document');
  });

  it('analytical_similarity surfaces only for exclusively generic/biosimilar filings', () => {
    const appIds = (need: string) => resolveWorkspaceConfig(need).apps.map((a) => a.id);
    // BLA's product-class list *covers* biosimilar but a BLA is not a sameness filing.
    // (NDA is ['small_molecule'] only, so it cannot catch this bug — assert on BLA.)
    expect(appIds('US_BLA')).not.toContain('analytical_similarity');
    expect(appIds('US_IND')).not.toContain('analytical_similarity');
    expect(appIds('ANDA')).toContain('analytical_similarity');
  });
});
