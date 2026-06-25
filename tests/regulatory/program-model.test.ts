import { describe, it, expect } from 'vitest';
import { resolveProgramModel } from '../../shared/regulatory/program-model';
import {
  segmentForProductClass,
  resolveEvidenceModel,
  CLIENT_SEGMENTS,
} from '../../shared/regulatory/client-segments';
import { CLAIM_SPINES } from '../../shared/regulatory/claim-spine';

describe('client-segments — the four client types grounded', () => {
  it('maps product classes to the right segment', () => {
    expect(segmentForProductClass('medical_device')).toBe('device');
    expect(segmentForProductClass('ivd')).toBe('ivd');
    expect(segmentForProductClass('biologic')).toBe('biotech');
    expect(segmentForProductClass('small_molecule')).toBe('pharma');
    expect(segmentForProductClass('any')).toBeUndefined();
  });

  it('grounds each segment in its real regulatory center + CMC model', () => {
    expect(CLIENT_SEGMENTS.pharma.center).toContain('CDER');
    expect(CLIENT_SEGMENTS.biotech.center).toContain('CBER');
    expect(CLIENT_SEGMENTS.device.center).toContain('CDRH');
    expect(CLIENT_SEGMENTS.ivd.center).toContain('CLIA');
    expect(CLIENT_SEGMENTS.pharma.cmcModel).toBe('chemistry');
    expect(CLIENT_SEGMENTS.biotech.cmcModel).toBe('biologic');
  });
});

describe('axes cross-cut segments (the whole point)', () => {
  it('device 510(k) uses equivalence but device PMA uses clinical efficacy', () => {
    expect(resolveEvidenceModel('device', 'device_clearance', ['medical_device'])).toBe('equivalence');
    expect(resolveEvidenceModel('device', 'device_approval', ['medical_device'])).toBe('clinical_efficacy');
  });

  it('biosimilars and generics use the sameness model regardless of segment', () => {
    expect(resolveEvidenceModel('biotech', 'marketing_authorization', ['biosimilar'])).toBe('sameness');
    expect(resolveEvidenceModel('pharma', 'marketing_authorization', ['generic'])).toBe('sameness');
  });

  it('a standard drug/biologic marketing app uses clinical efficacy', () => {
    expect(resolveEvidenceModel('pharma', 'marketing_authorization', ['small_molecule'])).toBe('clinical_efficacy');
    expect(resolveEvidenceModel('biotech', 'marketing_authorization', ['biologic'])).toBe('clinical_efficacy');
  });
});

describe('resolveProgramModel — generates a grounded program', () => {
  it('NDA → pharma, clinical-efficacy, chemistry CMC, efficacy claim → M5/M2', () => {
    const p = resolveProgramModel('NDA');
    expect(p.segment?.id).toBe('pharma');
    expect(p.axes?.evidenceModel).toBe('clinical_efficacy');
    expect(p.axes?.cmcModel).toBe('chemistry');
    const efficacy = p.claimSpine?.claims.find((c) => c.id === 'efficacy');
    expect(efficacy?.supportedByApps).toContain('biostatistics');
    expect(efficacy?.supportedByApps).toContain('clinical_csr');
    expect(efficacy?.projectsTo).toContain('M5.3.5');
  });

  it('BLA → biotech, biologic CMC', () => {
    const p = resolveProgramModel('BLA');
    expect(p.segment?.id).toBe('biotech');
    expect(p.axes?.cmcModel).toBe('biologic');
  });

  it('510(k) → device, equivalence, substantial-equivalence claim', () => {
    const p = resolveProgramModel('510k');
    expect(p.segment?.id).toBe('device');
    expect(p.axes?.evidenceModel).toBe('equivalence');
    expect(p.claimSpine?.claims.some((c) => c.id === 'substantial_equivalence')).toBe(true);
  });

  it('unknown selection resolves to nulls, never throws', () => {
    const p = resolveProgramModel('not-a-real-thing');
    expect(p.known).toBe(false);
    expect(p.segment).toBeNull();
    expect(p.claimSpine).toBeNull();
  });
});

describe('claim spines are complete', () => {
  it('every evidence model has a non-empty claim spine rooted in intended use', () => {
    for (const spine of Object.values(CLAIM_SPINES)) {
      expect(spine.claims.length).toBeGreaterThan(0);
      expect(spine.rootClaim).toBeTruthy();
      for (const claim of spine.claims) {
        expect(claim.projectsTo.length).toBeGreaterThan(0);
      }
    }
  });
});
