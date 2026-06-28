import { describe, it, expect } from 'vitest';
import {
  CLAIM_SPINES,
  getClaimSpine,
  type ClaimSpine,
} from '../../shared/regulatory/claim-spine';
import type { EvidenceModel } from '../../shared/regulatory/client-segments';

const ALL_MODELS: EvidenceModel[] = ['clinical_efficacy', 'equivalence', 'performance', 'sameness'];

describe('claim-spine — evidence model → claim linkage', () => {
  it('defines a spine for every evidence model', () => {
    for (const model of ALL_MODELS) {
      const spine = getClaimSpine(model);
      expect(spine).toBeDefined();
      expect(spine.evidenceModel).toBe(model);
      expect(spine.rootClaim).toBeTruthy();
      expect(spine.claims.length).toBeGreaterThan(0);
    }
  });

  it('every claim has id, label, supporting apps, and dossier projections', () => {
    for (const model of ALL_MODELS) {
      for (const claim of getClaimSpine(model).claims) {
        expect(claim.id).toBeTruthy();
        expect(claim.label).toBeTruthy();
        expect(claim.supportedByApps.length).toBeGreaterThan(0);
        expect(claim.projectsTo.length).toBeGreaterThan(0);
      }
    }
  });

  it('clinical_efficacy spine has quality, nonclinical, efficacy, safety, and labeling claims', () => {
    const ids = getClaimSpine('clinical_efficacy').claims.map((c) => c.id);
    expect(ids).toContain('quality');
    expect(ids).toContain('nonclinical_safety');
    expect(ids).toContain('efficacy');
    expect(ids).toContain('clinical_safety');
    expect(ids).toContain('labeling');
  });

  it('equivalence spine has substantial_equivalence and device_description', () => {
    const ids = getClaimSpine('equivalence').claims.map((c) => c.id);
    expect(ids).toContain('substantial_equivalence');
    expect(ids).toContain('device_description');
  });

  it('performance spine has analytical_performance and clinical_performance', () => {
    const ids = getClaimSpine('performance').claims.map((c) => c.id);
    expect(ids).toContain('analytical_performance');
    expect(ids).toContain('clinical_performance');
  });

  it('sameness spine has quality_similarity and residual_clinical', () => {
    const ids = getClaimSpine('sameness').claims.map((c) => c.id);
    expect(ids).toContain('quality_similarity');
    expect(ids).toContain('residual_clinical');
  });

  it('every spine ends with labeling', () => {
    for (const model of ALL_MODELS) {
      const claims = getClaimSpine(model).claims;
      expect(claims[claims.length - 1].id).toBe('labeling');
    }
  });

  it('efficacy claim is supported by clinical CSR and biostatistics', () => {
    const efficacy = getClaimSpine('clinical_efficacy').claims.find((c) => c.id === 'efficacy')!;
    expect(efficacy.supportedByApps).toContain('clinical_csr');
    expect(efficacy.supportedByApps).toContain('biostatistics');
    expect(efficacy.supportedByApps).toContain('study_protocol_design');
  });

  it('analytical_performance claim is supported by the analytical_performance app', () => {
    const ap = getClaimSpine('performance').claims.find((c) => c.id === 'analytical_performance')!;
    expect(ap.supportedByApps).toContain('analytical_performance');
  });

  it('sameness quality_similarity claim is supported by analytical_similarity', () => {
    const qs = getClaimSpine('sameness').claims.find((c) => c.id === 'quality_similarity')!;
    expect(qs.supportedByApps).toContain('analytical_similarity');
  });
});
