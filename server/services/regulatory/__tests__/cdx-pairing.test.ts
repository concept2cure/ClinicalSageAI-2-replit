/**
 * CDx pairing engine (biomarker-knowledge-aware) tests.
 */

import { describe, it, expect } from 'vitest';
import { lookupBiomarkerValidity, pairCompanionDiagnostic } from '../cdx-pairing';
import { getEntry } from '../../ivd-knowledge/knowledge.service';

describe('lookupBiomarkerValidity', () => {
  it('resolves a known biomarker by alias', () => {
    const m = lookupBiomarkerValidity('PD-L1');
    expect(m.recognized).toBe(true);
    expect(m.entryId).toBe('bio.pd-l1');
    expect(m.cdxDocumented).toBe(true);
    expect((m.citations ?? []).length).toBeGreaterThan(0);
  });

  it('resolves HER2 via the erbb2 alias', () => {
    expect(lookupBiomarkerValidity('ERBB2').entryId).toBe('bio.her2');
  });

  it('resolves KRAS G12C to the KRAS entry', () => {
    expect(lookupBiomarkerValidity('KRAS G12C').entryId).toBe('bio.kras');
  });

  it('does not recognize an unknown marker', () => {
    expect(lookupBiomarkerValidity('unobtanium-7').recognized).toBe(false);
  });
});

describe('pairCompanionDiagnostic', () => {
  it('a recognized biomarker satisfies the biomarkerDefined element and surfaces citations', () => {
    const r = pairCompanionDiagnostic({
      biomarker: 'PD-L1',
      therapeuticProduct: 'pembrolizumab',
      elements: { intendedUseAlignment: true, diagnosticDeviceIdentified: true },
    });
    expect(r.biomarker.recognized).toBe(true);
    expect(r.readiness.linkageEstablished).toBe(true); // therapeutic+device+biomarker+intended-use
    expect(r.euClassification).toBe('C');
    expect(r.knowledgeRefs).toContain('bio.pd-l1');
    expect(r.knowledgeRefs).toContain('fda.ivd.cdx');
  });

  it('an unknown biomarker yields a scientific-validity recommendation and no linkage', () => {
    const r = pairCompanionDiagnostic({ biomarker: 'mystery-marker' });
    expect(r.biomarker.recognized).toBe(false);
    expect(r.readiness.linkageEstablished).toBe(false);
    expect(r.recommendations.some(x => x.toLowerCase().includes('scientific-validity'))).toBe(true);
  });

  it('flags missing clinical validation and contemporaneous review', () => {
    const r = pairCompanionDiagnostic({
      biomarker: 'EGFR',
      therapeuticProduct: 'osimertinib',
      elements: { diagnosticDeviceIdentified: true, intendedUseAlignment: true, analyticalValidation: true },
    });
    expect(r.recommendations.some(x => x.toLowerCase().includes('clinical validation'))).toBe(true);
    expect(r.recommendations.some(x => x.toLowerCase().includes('contemporaneous'))).toBe(true);
  });

  it('every knowledge ref resolves to a real corpus entry', () => {
    const r = pairCompanionDiagnostic({ biomarker: 'HER2', therapeuticProduct: 'trastuzumab' });
    for (const id of r.knowledgeRefs) {
      expect(getEntry(id), `ref ${id}`).not.toBeNull();
    }
  });
});
